// Fetches AI insights in the background while the story plays.
import { deanonymize, insightsPayload } from "./payload.js";

export function createInsights(stats, { enabled, includeWords, you = null }) {
  const listeners = new Set();
  let state = { status: enabled ? "loading" : "off" };
  const set = (next) => { state = next; listeners.forEach((fn) => fn(state)); };

  if (enabled) {
    const { payload, names } = insightsPayload(stats, { includeWords, you });
    const named = (s) => deanonymize(s, names);
    fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "AI insights are unavailable right now.");
        return data;
      })
      .then((d) => set({
        status: "ready",
        data: {
          vibe: named(d.vibe),
          summary: named(d.summary),
          prediction: named(d.prediction),
          personas: d.personas.map((p) => ({ name: names[Number(p.id.slice(1)) - 1], title: named(p.title), line: named(p.line) })),
        },
      }))
      .catch((e) => set({ status: "error", error: e.name === "TimeoutError" ? "The AI took too long to answer." : e.message }));
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
