// Private analytics dashboard, rendered on the server as plain HTML (no scripts).
import type { Row } from "./analytics.ts";

const SITES: Record<string, { name: string; url: string }> = {
  "chat-wrapped": { name: "Chat Wrapped", url: "https://wrapped.jashparmar.com" },
  matchday: { name: "Matchday Brain", url: "https://matchday.jashparmar.com" },
};

const EVENT_LABELS: Record<string, string> = {
  demo: "Demo chat started", upload: "Chat uploaded", share_received: "Opened from share menu",
  wrapped_whatsapp: "Wrapped created (WhatsApp)", wrapped_telegram: "Wrapped created (Telegram)",
  parse_error: "File couldn't be read", story_end: "Watched to the end", dashboard: "Opened all stats",
  share_group: "Sent to a group", save_image: "Saved the card", install: "Installed the app",
  search: "Word searches", quiz: "Quiz started", quiz_done: "Quiz finished", person_card: "Personal card shared", export_csv: "Stats exported (CSV)",
  ai_ok: "AI verdict (Gemini)", ai_fallback: "AI verdict (Workers AI backup)", ai_cached: "AI verdict (from cache)",
  ai_error: "AI verdict failed", predict: "Head-to-head predictions",
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const int = (n: number) => Math.round(n).toLocaleString("en");
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

let regionNames: Intl.DisplayNames | null = null;
try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch { /* fall back to codes */ }
const country = (code: string) => { try { return regionNames?.of(code) ?? code; } catch { return code; } };

function sum(rows: Row[], test: (metric: string) => boolean) {
  return rows.reduce((s, r) => (test(r.metric) ? s + r.n : s), 0);
}

function breakdown(rows: Row[], prefix: string, label: (key: string) => string = (k) => k, limit = 8) {
  const totals = new Map<string, number>();
  for (const r of rows) if (r.metric.startsWith(prefix)) totals.set(r.metric.slice(prefix.length), (totals.get(r.metric.slice(prefix.length)) ?? 0) + r.n);
  return [...totals].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, n]) => [label(k), n] as const);
}

function table(title: string, rows: readonly (readonly [string, number])[], total?: number) {
  if (!rows.length) return `<section class="card"><h3>${title}</h3><p class="muted">Nothing yet.</p></section>`;
  return `<section class="card"><h3>${title}</h3><table>${rows.map(([k, n]) =>
    `<tr><td>${esc(k)}</td><td class="num">${int(n)}</td>${total ? `<td class="num muted">${pct(n, total)}</td>` : ""}</tr>`).join("")}</table></section>`;
}

// Daily visitors: single series, so one colour, no legend; native tooltips per bar.
function chart(days: string[], values: number[]) {
  const W = 720, H = 180, top = 16, bottom = 24, left = 8;
  const max = Math.max(1, ...values);
  const slot = (W - left) / days.length, bar = Math.max(2, slot - 2);
  const y = (v: number) => H - bottom - (v / max) * (H - top - bottom);
  const bars = values.map((v, i) => {
    const x = left + i * slot, yy = y(v), h = H - bottom - yy, r = Math.min(4, bar / 2, h);
    const shape = h <= 0 ? "" : `<path d="M${x},${H - bottom} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bar - r} Q${x + bar},${yy} ${x + bar},${yy + r} V${H - bottom} Z" class="bar"/>`;
    return `<g><title>${days[i]}: ${int(v)} visitor${v === 1 ? "" : "s"}</title><rect x="${x}" y="${top}" width="${slot}" height="${H - top - bottom}" fill="transparent"/>${shape}</g>`;
  }).join("");
  const tick = (i: number) => {
    const edge = i === 0 ? ["start", left] : i === days.length - 1 ? ["end", left + i * slot + bar] : ["middle", left + i * slot + bar / 2];
    return `<text x="${edge[1]}" y="${H - 6}" text-anchor="${edge[0]}">${days[i].slice(5)}</text>`;
  };
  const ticks = [0, Math.floor((days.length - 1) / 2), days.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(tick).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Unique visitors per day"><text x="${left}" y="11" class="axis">${int(max)}</text><line x1="${left}" x2="${W}" y1="${H - bottom}" y2="${H - bottom}" class="base"/>${bars}${ticks}</svg>`;
}

function siteSection(id: string, rows: Row[], dayList: string[]) {
  const meta = SITES[id] ?? { name: id, url: "#" };
  const visitors = sum(rows, (m) => m === "visitor"), views = sum(rows, (m) => m === "pageview");
  const previews = sum(rows, (m) => m === "preview"), bots = sum(rows, (m) => m === "bot");
  const ev = (name: string) => sum(rows, (m) => m === `event:${name}`);
  const perDay = dayList.map((d) => sum(rows.filter((r) => r.day === d), (m) => m === "visitor"));

  let funnel = "";
  if (id === "chat-wrapped") {
    const steps: [string, number][] = [
      ["Visitors", visitors],
      ["Started (demo, upload or share menu)", ev("demo") + ev("upload") + ev("share_received")],
      ["Wrapped created", ev("wrapped_whatsapp") + ev("wrapped_telegram")],
      ["Watched to the end", ev("story_end")],
      ["Sent to a group", ev("share_group")],
    ];
    funnel = `<section class="card wide"><h3>Funnel</h3><ol class="funnel">${steps.map(([label, n], i) =>
      `<li><span>${label}</span><b>${int(n)}</b><span class="muted">${i ? `${pct(n, steps[i - 1][1])} of previous` : ""}</span><i style="width:${steps[0][1] ? Math.max(1, (n / steps[0][1]) * 100) : 0}%"></i></li>`).join("")}</ol></section>`;
  }

  const events = breakdown(rows, "event:", (k) => EVENT_LABELS[k] ?? k, 20);
  return `<section class="site">
  <h2>${esc(meta.name)} <a href="${meta.url}" class="muted">${esc(meta.url.replace("https://", ""))} ↗</a></h2>
  <div class="tiles">
    <div class="tile"><span>Unique visitors</span><b>${int(visitors)}</b></div>
    <div class="tile"><span>Page views</span><b>${int(views)}</b></div>
    <div class="tile"><span>Link previews</span><b>${int(previews)}</b><small>someone pasted the link in a chat</small></div>
    <div class="tile"><span>Bots filtered</span><b>${int(bots)}</b><small>not counted above</small></div>
  </div>
  <section class="card wide"><h3>Unique visitors per day</h3>${chart(dayList, perDay)}</section>
  ${funnel}
  <div class="grid">
    ${table("Actions", events)}
    ${table("Countries", breakdown(rows, "country:", country), visitors)}
    ${table("Came from", breakdown(rows, "ref:", (k) => (k === "direct" ? "Direct / app / WhatsApp" : k)), visitors)}
    ${table("Devices", breakdown(rows, "device:", (k) => k[0].toUpperCase() + k.slice(1)), visitors)}
    ${table("Opened via", breakdown(rows, "source:"))}
    ${table("Link previews by app", breakdown(rows, "preview:", (k) => k[0].toUpperCase() + k.slice(1)))}
  </div>
</section>`;
}

export function renderStats(rows: Row[], days: number, now = new Date()) {
  const dayList = Array.from({ length: days }, (_, i) => new Date(now.getTime() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
  const sites = Object.keys(SITES);
  for (const r of rows) if (!sites.includes(r.site)) sites.push(r.site);
  const ranges = [7, 30, 90].map((d) => `<a href="?days=${d}"${d === days ? ' aria-current="page"' : ""}>${d} days</a>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Analytics · jashparmar.com apps</title><style>${CSS}</style></head><body>
<header><div><p class="muted">Private link · cookieless · bots filtered</p><h1>App analytics</h1></div><nav>${ranges}</nav></header>
${sites.map((s) => siteSection(s, rows.filter((r) => r.site === s), dayList)).join("")}
<footer class="muted">Visitors are counted with a salted daily hash of IP + browser, never stored, unlinkable across days. Times are UTC. The portfolio (jashparmar.com) isn't on Cloudflare Workers; see Cloudflare → Analytics for it.</footer>
</body></html>`;
}

const CSS = `
:root{--bg:#0d0a17;--card:#1a1430;--line:rgba(255,255,255,.1);--text:#f6f3ff;--muted:#a9a2c2;--accent:#ff4fa3}
*{box-sizing:border-box}body{margin:0 auto;max-width:1100px;padding:28px 16px 60px;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:inherit}.muted{color:var(--muted)}h1{margin:0;font-size:34px;letter-spacing:-.02em}h2{font-size:24px;margin:40px 0 14px;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
h2 a{font-size:14px;font-weight:500;text-decoration:none}h3{margin:0 0 12px;font-size:15px}
header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}header p{margin:0 0 4px;font-size:13px}
nav{display:flex;gap:6px}nav a{padding:6px 12px;border:1px solid var(--line);border-radius:999px;text-decoration:none;font-size:13px;color:var(--muted)}nav a[aria-current]{background:#fff;color:#160b24;border-color:#fff}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;display:grid}
.tile span{color:var(--muted);font-size:13px}.tile b{font-size:30px;letter-spacing:-.02em}.tile small{color:var(--muted);font-size:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;min-width:0}.wide{margin-top:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:10px;margin-top:10px}
table{width:100%;border-collapse:collapse;font-size:14px}td{padding:6px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere}td.num{text-align:right;white-space:nowrap;padding-left:12px;font-variant-numeric:tabular-nums}
svg{width:100%;height:auto;display:block}svg text{fill:var(--muted);font-size:11px}.bar{fill:var(--accent)}g:hover .bar{fill:#ff8cc4}.base{stroke:var(--line)}
.funnel{list-style:none;margin:0;padding:0;display:grid;gap:8px}.funnel li{position:relative;display:grid;grid-template-columns:1fr auto 130px;gap:12px;padding:8px 12px;border-radius:10px;overflow:hidden;align-items:center}
.funnel li>*{position:relative;z-index:1}.funnel i{position:absolute;inset:0 auto 0 0;background:rgba(255,79,163,.22);z-index:0}.funnel b{font-variant-numeric:tabular-nums}.funnel .muted{font-size:12px;text-align:right}
footer{margin-top:36px;font-size:13px}
@media (max-width:600px){.funnel li{grid-template-columns:1fr auto}.funnel li .muted{display:none}}
`;
