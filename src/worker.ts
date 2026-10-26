// Edge Worker: serves the static app and one small AI endpoint.
// Chats are analysed in the browser; this only ever sees anonymous aggregates.
import { cleanOutput, isInvalid, sanitize, SCHEMA, SYSTEM } from "./insights.ts";

type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  GEMINI_API_KEY?: string;
  GEMINI_MODELS?: string;
  AI_LIMITER?: { limit: (o: { key: string }) => Promise<{ success: boolean }> };
};
type Ctx = { waitUntil: (p: Promise<unknown>) => void };

const MAX_BODY = 16_000;

function json(data: unknown, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" },
  });
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Tries each model in order; an overloaded, rate-limited, retired or slow model
// falls through to the next one instead of failing the request.
async function gemini(env: Env, models: string[], prompt: string): Promise<unknown> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: SCHEMA,
      temperature: 0.9,
      maxOutputTokens: 2048,
    },
  });
  let lastError = "no models configured";
  for (const model of models) {
    const started = Date.now();
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
        body,
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        lastError = `${model} returned ${res.status}: ${(await res.text()).slice(0, 160)}`;
        if (res.status === 400 || res.status === 401 || res.status === 403) break; // our request or key is wrong; another model won't help
        console.warn("gemini fallback", lastError);
        continue;
      }
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: unknown };
      console.log("gemini", { model, ms: Date.now() - started, usage: data.usageMetadata });
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      return JSON.parse(text);
    } catch (e) {
      lastError = `${model}: ${e instanceof Error ? e.message : e}`;
      console.warn("gemini fallback", lastError);
    }
  }
  throw new Error(lastError);
}

async function insights(request: Request, env: Env, ctx: Ctx) {
  if (!env.GEMINI_API_KEY) return json({ error: "AI insights aren't switched on for this site yet." }, 503);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return json({ error: "Request too large." }, 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "Request too large." }, 413);

  let payload;
  try {
    payload = sanitize(JSON.parse(raw));
  } catch (e) {
    return json({ error: isInvalid(e) ? e.message : "Body must be JSON." }, 400);
  }

  // Identical stats get identical answers: serve repeats from the edge cache.
  const models = (env.GEMINI_MODELS || "gemini-flash-latest").split(",").map((m) => m.trim()).filter(Boolean);
  const canonical = JSON.stringify(payload);
  const key = new Request(`${new URL(request.url).origin}/__cache/insights/${await sha256(canonical)}`);
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(key);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set("X-Cache", "HIT");
    return res;
  }

  if (env.AI_LIMITER) {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.AI_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "Too many requests. Try again in a minute." }, 429);
  }

  try {
    const out = cleanOutput(await gemini(env, models, `Chat statistics (JSON):\n${canonical}`), payload);
    const res = json(out, 200, "public, max-age=604800");
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    console.error("insights failed", e instanceof Error ? e.message : e);
    return json({ error: "The AI is having a moment. Your stats are all still here." }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (pathname === "/api/health") return json({ status: "ok", ai: Boolean(env.GEMINI_API_KEY) });
    if (pathname === "/api/insights") {
      return request.method === "POST" ? insights(request, env, ctx) : json({ error: "Use POST." }, 405);
    }
    return json({ error: "Not found." }, 404);
  },
};
