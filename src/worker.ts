// Edge Worker: serves the static app and one small AI endpoint.
// Chats are analysed in the browser; this only ever sees anonymous aggregates.
import { type AnalyticsEnv, type Ctx, readRange, recordEvent, recordPageview } from "./analytics.ts";
import { cleanOutput, isInvalid, sanitize, SCHEMA, SYSTEM } from "./insights.ts";
import { renderStats } from "./stats-page.ts";

type Env = AnalyticsEnv & {
  STATS_KEY?: string;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  GEMINI_API_KEY?: string;
  GEMINI_MODELS?: string;
  WORKERS_AI_MODEL?: string;
  AI?: { run: (model: string, input: unknown) => Promise<{ response?: unknown }> };
  AI_LIMITER?: { limit: (o: { key: string }) => Promise<{ success: boolean }> };
};
const SITE = "chat-wrapped";
// Button taps the page may report. Nothing about the chat itself is ever sent.
const EVENTS = new Set(["demo", "upload", "share_received", "wrapped_whatsapp", "wrapped_telegram", "parse_error", "story_end", "dashboard", "share_group", "save_image", "install", "search", "quiz", "quiz_done", "person_card", "export_csv", "error_zip", "error_worker", "worker_fallback"]);

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

// Tries each Gemini model in order; an overloaded, rate-limited, retired or slow
// model falls through to the next one instead of failing the request.
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

// Last resort: an open model on Cloudflare Workers AI. Same account, no API key,
// free daily allowance, and it doesn't share Gemini's free-tier congestion.
async function workersAi(env: Env, prompt: string): Promise<unknown> {
  const model = env.WORKERS_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const started = Date.now();
  const out = await env.AI!.run(model, {
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
    response_format: { type: "json_schema", json_schema: SCHEMA },
    temperature: 0.9,
    max_tokens: 1024,
  });
  console.log("workers-ai", { model, ms: Date.now() - started });
  return typeof out.response === "string" ? JSON.parse(out.response) : out.response;
}

async function generate(env: Env, prompt: string): Promise<{ data: unknown; provider: "gemini" | "workers-ai" }> {
  const errors: string[] = [];
  if (env.GEMINI_API_KEY) {
    const models = (env.GEMINI_MODELS || "gemini-flash-latest").split(",").map((m) => m.trim()).filter(Boolean);
    try { return { data: await gemini(env, models, prompt), provider: "gemini" }; } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  }
  if (env.AI) {
    try { return { data: await workersAi(env, prompt), provider: "workers-ai" }; } catch (e) { errors.push(`workers-ai: ${e instanceof Error ? e.message : e}`); }
  }
  throw new Error(errors.join(" | ") || "no AI provider configured");
}

async function insights(request: Request, env: Env, ctx: Ctx) {
  if (!env.GEMINI_API_KEY && !env.AI) return json({ error: "AI insights aren't switched on for this site yet." }, 503);
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
  const canonical = JSON.stringify(payload);
  const key = new Request(`${new URL(request.url).origin}/__cache/insights/${await sha256(canonical)}`);
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(key);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set("X-Cache", "HIT");
    ctx.waitUntil(recordEvent(env, SITE, "ai_cached"));
    return res;
  }

  if (env.AI_LIMITER) {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.AI_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "Too many requests. Try again in a minute." }, 429);
  }

  try {
    const { data, provider } = await generate(env, `Chat statistics (JSON):\n${canonical}`);
    const out = cleanOutput(data, payload);
    ctx.waitUntil(recordEvent(env, SITE, provider === "gemini" ? "ai_ok" : "ai_fallback"));
    const res = json(out, 200, "public, max-age=604800");
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    console.error("insights failed", e instanceof Error ? e.message : e);
    ctx.waitUntil(recordEvent(env, SITE, "ai_error"));
    return json({ error: "The AI is having a moment. Your stats are all still here." }, 502);
  }
}

async function event(request: Request, env: Env, ctx: Ctx) {
  // sendBeacon from our own page only; anything else is ignored.
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 204 });
  const raw = (await request.text()).slice(0, 200);
  let name = "";
  try { name = String((JSON.parse(raw) as { e?: unknown }).e ?? ""); } catch { /* ignore */ }
  if (EVENTS.has(name)) ctx.waitUntil(recordEvent(env, SITE, name));
  return new Response(null, { status: 204 });
}

function timingSafeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// The stats page lives at a secret, unguessable path (/stats/<STATS_KEY>) instead of
// behind a login. Anything else under /stats looks exactly like a missing page.
async function stats(request: Request, env: Env) {
  const key = new URL(request.url).pathname.slice("/stats/".length);
  if (!env.STATS_KEY || !env.DB || env.STATS_KEY.length < 24 || !timingSafeEqual(key, env.STATS_KEY)) {
    const page = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url)));
    return new Response(page.body, { status: 404, headers: page.headers });
  }
  const requested = Number(new URL(request.url).searchParams.get("days"));
  const days = [7, 30, 90].includes(requested) ? requested : 30;
  return new Response(renderStats(await readRange(env.DB, days), days), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    // Share-sheet posts are normally caught by the service worker on the phone. If one
    // reaches us (worker not installed yet), don't read the body: just send them home.
    if (pathname === "/share-target") return Response.redirect(new URL("/?shared=error", request.url).toString(), 303);
    if (pathname === "/" && request.method === "GET") ctx.waitUntil(recordPageview(env, request, SITE));
    if (pathname.startsWith("/stats/")) return stats(request, env);
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (pathname === "/api/event" && request.method === "POST") return event(request, env, ctx);
    if (pathname === "/api/health") return json({ status: "ok", ai: Boolean(env.GEMINI_API_KEY || env.AI) });
    if (pathname === "/api/insights") {
      return request.method === "POST" ? insights(request, env, ctx) : json({ error: "Use POST." }, 405);
    }
    return json({ error: "Not found." }, 404);
  },
};
