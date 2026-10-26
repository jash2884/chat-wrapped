// Compares two exports of the same chat (e.g. from two phones) and explains why
// their Wrapped results differ. Runs locally; nothing is uploaded.
//   node scripts/compare.js "export-from-phone-A.zip" "export-from-phone-B.txt"
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseChat } from "../public/js/parse.js";
import { analyze } from "../public/js/stats.js";
import { extractChat, isZip } from "../public/js/zip.js";

async function load(path) {
  const bytes = new Uint8Array(await readFile(path));
  let name = basename(path), text;
  if (await isZip(bytes)) {
    const entry = await extractChat(bytes);
    if (!/(^|\/)_chat\.txt$/i.test(entry.name)) name = entry.name;
    text = new TextDecoder().decode(entry.bytes);
  } else {
    text = new TextDecoder().decode(bytes);
  }
  const chat = parseChat(text, name);
  return { path, chat, stats: analyze(chat) };
}

const day = (ts) => new Date(ts).toISOString().slice(0, 10);
const clock = (ts) => new Date(ts).toISOString().slice(0, 16).replace("T", " ");
const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

const [a, b] = await Promise.all(process.argv.slice(2, 4).map(load)).catch((e) => {
  console.error(`Usage: node scripts/compare.js <export A> <export B>\n${e.message}`);
  process.exit(1);
});

console.log("\n== Overview");
for (const x of [a, b]) {
  console.log(`${basename(x.path)}: ${x.chat.messages.length} messages, ${clock(x.stats.range.first)} → ${clock(x.stats.range.last)}, ${x.stats.people.length} people`);
}

// Messages are matched by text and time. First find the clock offset between the
// phones (a different time zone shifts every timestamp by the same amount).
const MIN = 60_000, HOUR = 3_600_000;
const byText = (x) => {
  const m = new Map();
  for (const msg of x.chat.messages) if (msg.kind === "text") {
    const k = norm(msg.text);
    m.set(k, [...(m.get(k) ?? []), msg]);
  }
  return m;
};
const ta = byText(a), tb = byText(b);
const votes = new Map();
for (const [k, la] of ta) {
  const lb = tb.get(k);
  if (!lb || la.length * lb.length > 400) continue; // skip very common lines like "ok"
  for (const x of la) for (const y of lb) {
    const d = (y.ts - x.ts) / HOUR;
    if (Math.abs(d) <= 14) votes.set(Math.round(d * 4) / 4, (votes.get(Math.round(d * 4) / 4) ?? 0) + 1);
  }
}
const offset = [...votes].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 0;

// Then pair messages: same text at the same (offset-corrected) minute.
const keyOf = (msg, shift = 0) => `${Math.round((msg.ts + shift) / MIN)}|${norm(msg.text)}`;
const indexB = new Map(b.chat.messages.filter((m) => m.kind === "text").map((m) => [keyOf(m), m]));
const pairs = new Map();
let matched = 0;
const matchedB = new Set();
for (const msg of a.chat.messages) {
  if (msg.kind !== "text") continue;
  const other = indexB.get(keyOf(msg, offset * HOUR));
  if (!other) continue;
  matched++;
  matchedB.add(other);
  const key = `${msg.author}\u0000${other.author}`;
  pairs.set(key, (pairs.get(key) ?? 0) + 1);
}

console.log("\n== Time zone");
console.log(offset === 0 ? `Same clock on both phones (${matched} messages matched).`
  : `Phone B's clock is ${offset > 0 ? "+" : ""}${offset} h from phone A's (${matched} messages matched). The phones are in different time zones, which shifts prime time, busiest day and streaks.`);

console.log("\n== Names (who is who)");
const best = new Map();
for (const [key] of [...pairs].sort((x, y) => y[1] - x[1])) {
  const [na, nb] = key.split("\u0000");
  if (!best.has(na)) best.set(na, nb);
}
const countsB = new Map(b.stats.people.map((p) => [p.name, p.messages]));
for (const p of a.stats.people) {
  const nb = best.get(p.name), cb = nb ? countsB.get(nb) : undefined;
  console.log(`${p.name.padEnd(26)} → ${(nb ?? "(not found)").padEnd(26)} ${String(p.messages).padStart(6)} vs ${String(cb ?? "-").padStart(6)}${nb && nb !== p.name ? "   ← saved under a different name" : ""}`);
}

console.log("\n== Coverage");
const daysA = new Set(a.chat.messages.map((m) => day(m.ts))), daysB = new Set(b.chat.messages.map((m) => day(m.ts)));
const textsA = a.chat.messages.filter((m) => m.kind === "text").length, textsB = b.chat.messages.filter((m) => m.kind === "text").length;
console.log(`Text messages only in A: ${textsA - matched}, only in B: ${textsB - matchedB.size}`);
if (a.stats.range.first !== b.stats.range.first) {
  const later = a.stats.range.first > b.stats.range.first ? "A" : "B";
  console.log(`Export ${later} starts later (${clock(Math.max(a.stats.range.first, b.stats.range.first))}): that phone joined later, cleared the chat, or restored without full history. WhatsApp also caps exports at about 40,000 recent messages.`);
}
console.log(`Active days: A ${daysA.size}, B ${daysB.size}`);
const kinds = (x) => x.chat.messages.reduce((o, m) => ({ ...o, [m.kind]: (o[m.kind] ?? 0) + 1 }), {});
console.log("Message kinds A:", kinds(a), " B:", kinds(b));
console.log("\nThe AI verdict is written fresh for each set of numbers, so it will differ whenever anything above differs.\n");
