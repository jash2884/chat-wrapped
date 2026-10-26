// Interactive queries over the chat: word search and the "guess who said it" quiz.
// They need message text, so they run in the Web Worker that holds the chat;
// nothing here ever leaves the device.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whole-word match for words, plain substring for emoji and other symbols.
export function matcher(query) {
  const q = query.trim().toLowerCase().slice(0, 60);
  if (!q) return null;
  return /^[\p{L}\p{N}][\p{L}\p{N}' ]*$/u.test(q)
    ? new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(q)}(?![\\p{L}\\p{N}])`, "giu")
    : new RegExp(escapeRe(q), "giu");
}

export function searchChat(messages, query) {
  const re = matcher(query);
  if (!re) return null;
  const byPerson = new Map(), byMonth = new Map();
  let total = 0, messagesWith = 0, first = null;
  for (const m of messages) {
    if (m.kind !== "text") continue;
    const hits = m.text.match(re)?.length ?? 0;
    if (!hits) continue;
    total += hits;
    messagesWith++;
    byPerson.set(m.author, (byPerson.get(m.author) ?? 0) + hits);
    const month = new Date(m.ts).toISOString().slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + hits);
    if (!first || m.ts < first.ts) first = { author: m.author, ts: m.ts };
  }
  return {
    query: query.trim(),
    total,
    messages: messagesWith,
    people: [...byPerson].sort((a, b) => b[1] - a[1]),
    months: [...byMonth].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    first,
  };
}

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Picks messages that are fun to guess: real sentences, no links, no long
// numbers (phone numbers, OTPs), from people who talk enough to be guessable.
export function quiz(messages, people, { count = 10, seed = Date.now() } = {}) {
  const candidates = people.slice(0, 8).map((p) => p.name);
  if (candidates.length < 2) return [];
  const allowed = new Set(candidates);
  const pool = messages.filter((m) => {
    if (m.kind !== "text" || !allowed.has(m.author)) return false;
    const words = m.text.split(/\s+/).length;
    return words >= 4 && words <= 30 && !/https?:\/\/|www\.|\d{5,}|@\S+\.\S+/i.test(m.text);
  });
  const r = rng(seed);
  const picked = [], used = new Set();
  // Spread questions across people so one chatterbox doesn't take every round.
  for (let i = 0; i < count * 20 && picked.length < Math.min(count, pool.length); i++) {
    const author = candidates[Math.floor(r() * candidates.length)];
    const theirs = pool.filter((m) => m.author === author);
    if (!theirs.length) continue;
    const m = theirs[Math.floor(r() * theirs.length)];
    if (used.has(m)) continue;
    used.add(m);
    const others = candidates.filter((n) => n !== author).sort(() => r() - 0.5).slice(0, 3);
    picked.push({ text: m.text, ts: m.ts, answer: author, options: [author, ...others].sort(() => r() - 0.5) });
  }
  return picked;
}
