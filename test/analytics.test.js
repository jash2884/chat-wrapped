import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, readRange, recordEvent, recordPageview } from "../src/analytics.ts";
import { renderStats } from "../src/stats-page.ts";

// Just enough of D1 to run the analytics SQL against an in-memory map.
function fakeDb() {
  const daily = new Map(), visitors = new Set();
  const stmt = (sql, args = []) => ({
    bind: (...v) => stmt(sql, v),
    async run() {
      if (sql.startsWith("INSERT INTO visitors")) {
        const key = args.join("|"), fresh = !visitors.has(key);
        visitors.add(key);
        return { meta: { changes: fresh ? 1 : 0 } };
      }
      if (sql.startsWith("INSERT INTO daily")) {
        const key = args.join("|");
        daily.set(key, (daily.get(key) ?? 0) + 1);
      }
      return { meta: { changes: 1 } };
    },
    async all() {
      return { results: [...daily].map(([k, n]) => { const [day, site, metric] = k.split("|"); return { day, site, metric, n }; }).filter((r) => r.day >= args[0]) };
    },
  });
  return { prepare: (sql) => stmt(sql), batch: (list) => Promise.all(list.map((s) => s.run())), daily };
}

const CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const page = (headers = {}, url = "https://wrapped.jashparmar.com/") =>
  new Request(url, { headers: { "user-agent": CHROME, "sec-fetch-mode": "navigate", "cf-connecting-ip": "203.0.113.7", ...headers } });

test("classifies people, link previews and bots", () => {
  assert.deepEqual(classify(page()), { kind: "human" });
  assert.deepEqual(classify(page({ "user-agent": "WhatsApp/2.24.1 A" })), { kind: "preview", app: "whatsapp" });
  assert.deepEqual(classify(page({ "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" })), { kind: "bot" });
  assert.deepEqual(classify(page({ "user-agent": "curl/8.4" })), { kind: "bot" });
  assert.deepEqual(classify(page({ "sec-fetch-mode": "no-cors" })), { kind: "bot" }); // not a real page load
});

test("counts unique visitors once per day and keeps breakdowns per visitor", async () => {
  const db = fakeDb(), env = { DB: db, ANALYTICS_SALT: "s" };
  await recordPageview(env, page({ referer: "https://www.linkedin.com/feed/" }), "chat-wrapped");
  await recordPageview(env, page(), "chat-wrapped"); // same person refreshes
  await recordPageview(env, page({ "cf-connecting-ip": "198.51.100.2" }, "https://wrapped.jashparmar.com/?source=app"), "chat-wrapped");
  await recordPageview(env, page({ "user-agent": "WhatsApp/2.24.1 A" }), "chat-wrapped");
  await recordPageview(env, page({ "user-agent": "python-requests/2.31" }), "chat-wrapped");
  await recordEvent(env, "chat-wrapped", "share_group");
  const totals = Object.fromEntries((await readRange(db, 1)).map((r) => [r.metric, r.n]));
  assert.deepEqual(totals, {
    pageview: 3, visitor: 2, "device:mobile": 2, "ref:linkedin.com": 1, "ref:direct": 1, "source:app": 1,
    preview: 1, "preview:whatsapp": 1, bot: 1, "event:share_group": 1,
  });
});

test("analytics failures never throw into the request", async () => {
  const broken = { prepare() { throw new Error("D1 down"); }, batch() { throw new Error("D1 down"); } };
  await recordPageview({ DB: broken }, page(), "chat-wrapped");
  await recordEvent({ DB: broken }, "chat-wrapped", "demo");
});

test("the stats page escapes untrusted values like referrer hosts", () => {
  const day = new Date().toISOString().slice(0, 10);
  const html = renderStats([
    { day, site: "chat-wrapped", metric: "visitor", n: 3 },
    { day, site: "chat-wrapped", metric: "ref:<script>alert(1)</script>", n: 1 },
    { day, site: "chat-wrapped", metric: "event:share_group", n: 2 },
  ], 7);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&#60;script&#62;"));
  assert.match(html, /Sent to a group<\/span><b>2<\/b>/);
});
