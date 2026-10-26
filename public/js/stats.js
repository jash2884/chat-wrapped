// Turns parsed messages into the numbers behind every slide.
// Pure and synchronous so it runs the same in a Web Worker and in Node tests.
import { duration, pct, WEEKDAYS } from "./format.js";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const CONVO_GAP = 6 * HOUR; // silence this long means the next message starts a new conversation
const NOVEL_WORDS = 90_000;

const EMOJI = /\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic}️?)*/gu;
const LAUGH = /(?:^|[^\p{L}])(?:a?h[ae]h[ae][ha]*|lo+l+|lmf?ao+|rofl)(?!\p{L})|[😂🤣]/iu;
const LINK = /https?:\/\/\S+|www\.\S+/gi;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu;
const STOP = new Set(`the and you that was for are with his they this have from one had word but not what all were when your can said there use each which she how their will other about out many then them these some her would make like him into has look two more write see number way could people than first been who its now find long down day did get come made may part also too just very really yeah yes okay ok its it's i'm im don't dont can't cant i'll ill i've ive you're youre that's thats what's whats didn't didnt doesn't doesnt isn't isnt wasn't wasnt won't wont let's lets got going know think want need much well only even still back here because should over our off any why where after before again being both down few own same such through while those then been has having does doing until against between into during above below again further once let him her hers its ours them theirs what whom yours yourself myself himself herself ourselves themselves media omitted message deleted edited http https www com last anyone someone everyone please who's whos thing things lot gonna wanna gotta guys
hai hain nahi nhi kya toh bhi aur mai main mein tha thi the hum tum aap ko se ka ki ke ho na haan han ye yeh wo woh jo kar karo kuch abhi bas sab koi kaise kyu kyun raha rahi rahe hoga hogi diya liya`.split(/\s+/));

const bump = (map, key, n = 1) => map.set(key, (map.get(key) ?? 0) + n);
const top = (map, n) => [...map].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b), mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const dayIso = (day) => new Date(day * DAY).toISOString().slice(0, 10);

function newPerson(name) {
  return { name, messages: 0, texts: 0, words: 0, media: 0, deleted: 0, emojis: 0, laughs: 0, questions: 0, night: 0, starts: 0, replies: [], emojiMap: new Map(), wordMap: new Map(), replyTo: new Map(), hours: Array(24).fill(0) };
}

export function analyze({ title, platform, messages }) {
  const msgs = [...messages].sort((a, b) => a.ts - b.ts);
  if (msgs.length < 10) throw new Error("This chat has fewer than 10 messages. Not quite enough to wrap.");

  const people = new Map(), days = new Map(), months = new Map(), words = new Map(), emojis = new Map(), phrases = new Map(), duos = new Map();
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0)); // Monday-first × hour
  const totals = { messages: msgs.length, words: 0, media: 0, deleted: 0 };
  let prev = null, conversations = 0;

  for (const m of msgs) {
    let p = people.get(m.author);
    if (!p) people.set(m.author, (p = newPerson(m.author)));
    const d = new Date(m.ts), hr = d.getUTCHours();
    p.messages++;
    p.hours[hr]++;
    heat[(d.getUTCDay() + 6) % 7][hr]++;
    bump(days, Math.floor(m.ts / DAY));
    bump(months, d.toISOString().slice(0, 7));
    if (hr < 5) p.night++;
    if (!prev || m.ts - prev.ts >= CONVO_GAP) { p.starts++; conversations++; }
    else if (prev.author !== m.author) {
      p.replies.push(m.ts - prev.ts);
      bump(p.replyTo, prev.author);
      bump(duos, [m.author, prev.author].sort().join("\u0000"));
    }
    prev = m;

    if (m.kind === "media") { p.media++; totals.media++; continue; }
    if (m.kind === "deleted") { p.deleted++; totals.deleted++; continue; }
    p.texts++;
    const text = m.text.replace(LINK, " ");
    for (const e of text.match(EMOJI) ?? []) { bump(emojis, e); bump(p.emojiMap, e); p.emojis++; }
    if (LAUGH.test(text)) p.laughs++;
    if (text.includes("?")) p.questions++;
    const tokens = (text.toLowerCase().match(WORD) ?? []).map((raw) => raw.replace(/['’]+$/, ""));
    for (const w of tokens) {
      if (w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)) { bump(words, w); bump(p.wordMap, w); }
    }
    countPhrases(tokens, phrases);
    const n = tokens.length;
    p.words += n;
    totals.words += n;
  }

  const total = msgs.length;
  const list = [...people.values()].sort((a, b) => b.messages - a.messages).map((p) => ({
    name: p.name,
    messages: p.messages,
    share: p.messages / total,
    words: p.words,
    avgWords: p.texts ? p.words / p.texts : 0,
    media: p.media,
    deleted: p.deleted,
    emojis: p.emojis,
    emojiRate: p.texts ? p.emojis / p.texts : 0,
    topEmoji: top(p.emojiMap, 1)[0]?.[0] ?? null,
    laughs: p.laughs,
    laughRate: p.texts ? p.laughs / p.texts : 0,
    questions: p.questions,
    nightShare: p.night / p.messages,
    starts: p.starts,
    startShare: p.starts / conversations,
    medianReply: p.replies.length >= 5 ? median(p.replies) : null,
    topWords: top(p.wordMap, 5),
    peakHour: p.hours.indexOf(Math.max(...p.hours)),
    bestBuddy: top(p.replyTo, 1).map(([name, replies]) => ({ name, replies }))[0] ?? null,
  }));
  list.forEach((p, i) => { p.rank = i + 1; });
  signatures(list, total);

  // Day-level patterns: streaks, silences, the busiest day.
  const dayKeys = [...days.keys()].sort((a, b) => a - b);
  let streak = { days: 1, from: dayKeys[0], to: dayKeys[0] }, run = 1;
  let silence = { days: 0, from: null, to: null };
  for (let i = 1; i < dayKeys.length; i++) {
    const gap = dayKeys[i] - dayKeys[i - 1];
    run = gap === 1 ? run + 1 : 1;
    if (run > streak.days) streak = { days: run, from: dayKeys[i] - run + 1, to: dayKeys[i] };
    if (gap - 1 > silence.days) silence = { days: gap - 1, from: dayKeys[i - 1] + 1, to: dayKeys[i] - 1 };
  }
  const [busiestKey, busiestCount] = top(days, 1)[0];

  // Timeline with empty months filled in, so quiet stretches show up.
  const monthKeys = [...months.keys()].sort();
  const timeline = [];
  for (let [y, mo] = monthKeys[0].split("-").map(Number); ; mo++) {
    if (mo > 12) { y++; mo = 1; }
    const key = `${y}-${String(mo).padStart(2, "0")}`;
    timeline.push({ month: key, count: months.get(key) ?? 0 });
    if (key === monthKeys.at(-1)) break;
  }

  const hours = Array.from({ length: 24 }, (_, h) => heat.reduce((s, row) => s + row[h], 0));
  const weekdays = heat.map((row) => row.reduce((s, x) => s + x, 0));
  const peakHour = hours.indexOf(Math.max(...hours));
  const nightShare = hours.slice(0, 5).reduce((s, x) => s + x, 0) / total;

  const first = msgs[0], last = msgs.at(-1);
  const span = Math.floor(last.ts / DAY) - Math.floor(first.ts / DAY) + 1;
  return {
    title,
    platform,
    isGroup: list.length > 2,
    range: { first: first.ts, last: last.ts },
    totals: {
      ...totals,
      days: span,
      activeDays: dayKeys.length,
      perDay: total / span,
      conversations,
      novels: totals.words / NOVEL_WORDS,
    },
    people: list,
    heat,
    hours,
    weekdays,
    peakHour,
    peakWeekday: weekdays.indexOf(Math.max(...weekdays)),
    chronotype: chronotype(peakHour, nightShare),
    timeline,
    busiestDay: { date: dayIso(busiestKey), count: busiestCount },
    streak: { days: streak.days, from: dayIso(streak.from), to: dayIso(streak.to) },
    silence: silence.days ? { days: silence.days, from: dayIso(silence.from), to: dayIso(silence.to) } : null,
    topWords: top(words, 30),
    phrases: topPhrases(phrases),
    duos: top(duos, 5).filter(([, n]) => n >= 5).map(([key, n]) => ({ people: key.split("\u0000"), replies: n })),
    topEmojis: top(emojis, 12),
    firstMessage: { author: first.author, ts: first.ts, text: first.kind === "text" ? first.text.slice(0, 160) : first.kind === "media" ? "📎 (a photo or file)" : "(deleted)" },
    awards: awards(list, total),
  };
}

// Two- and three-word phrases said in at least 3 messages, e.g. "good night".
// A phrase needs at least one meaningful word, so "and the" never wins.
function countPhrases(tokens, phrases) {
  const seen = new Set();
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const gram = tokens.slice(i, i + n);
      if (!gram.some((w) => w.length >= 3 && !STOP.has(w)) || gram.some((w) => /^\d+$/.test(w))) continue;
      if (EDGE.has(gram[0]) || EDGE.has(gram[n - 1])) continue;
      seen.add(gram.join(" "));
    }
  }
  for (const g of seen) bump(phrases, g);
}

const EDGE = new Set("a an the and or but to of in on at for with from by is was are were be been it this that so".split(" "));

function topPhrases(phrases) {
  // On a tie, prefer the phrase made of more meaningful words ("happy birthday" over "birthday to you").
  const density = (g) => { const w = g.split(" "); return w.filter((x) => !STOP.has(x)).length / w.length; };
  const ranked = top(phrases, 80).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1] || density(b[0]) - density(a[0]));
  const kept = [];
  for (const [g, n] of ranked) {
    // Prefer the longer phrase when it covers most uses of a shorter one ("happy birthday maya" over "happy birthday").
    if (ranked.some(([h, m]) => h !== g && h.includes(g) && m >= n * 0.7)) continue;
    // Skip fragments of a sentence we already have: similar count and a shared meaningful word.
    const words = g.split(" ").filter((w) => !STOP.has(w));
    if (kept.some(([h, m]) => Math.abs(m - n) <= Math.max(1, m * 0.1) && h.split(" ").some((w) => words.includes(w)))) continue;
    kept.push([g, n]);
    if (kept.length === 10) break;
  }
  return kept;
}

// Splits a chat into calendar years (when there's enough to wrap) and adds a
// year-over-year comparison, so people can choose "Wrapped 2026" or all time.
export function analyzeAll(chat, minMessages = 30) {
  const all = analyze(chat);
  const counts = new Map();
  for (const m of chat.messages) bump(counts, new Date(m.ts).getUTCFullYear());
  const years = [...counts].filter(([, n]) => n >= minMessages).map(([y]) => y).sort((a, b) => b - a);
  const byYear = {};
  if (years.length > 1) {
    for (const y of years) {
      byYear[y] = analyze({ ...chat, messages: chat.messages.filter((m) => new Date(m.ts).getUTCFullYear() === y) });
      byYear[y].period = String(y);
    }
    for (const y of years) {
      const prev = counts.get(y - 1);
      if (prev) byYear[y].previous = { year: y - 1, messages: prev };
    }
  }
  all.period = "All time";
  return { all, years, byYear };
}

export function chronotype(peakHour, nightShare) {
  if (nightShare >= 0.12 || peakHour < 4) return { label: "Night Owls", emoji: "🦉", line: `${pct(nightShare)} of messages land between midnight and 5 AM.` };
  if (peakHour < 11) return { label: "Early Birds", emoji: "🌅", line: "Good morning texts are your love language." };
  if (peakHour < 17) return { label: "Office-Hours Chatters", emoji: "☕", line: "Suspiciously active during working hours." };
  return { label: "Evening People", emoji: "🌆", line: "The day's real business starts after dinner." };
}

// Gives every person a title from the habit where they stand out most against the
// group average, so even the quietest member of a 50-person group gets one.
export function signatures(list, total) {
  const avg = (fn, xs = list) => xs.reduce((sum, p) => sum + fn(p), 0) / Math.max(1, xs.length);
  const repliers = list.filter((p) => p.medianReply != null);
  const traits = [
    { emoji: "🦉", title: "Night Owl", value: (p) => p.nightShare, detail: (p) => `${pct(p.nightShare)} of their messages after midnight` },
    { emoji: "✨", title: "Emoji Enthusiast", value: (p) => p.emojiRate, detail: (p) => `${p.emojis.toLocaleString("en")} emojis${p.topEmoji ? `, mostly ${p.topEmoji}` : ""}` },
    { emoji: "📚", title: "The Novelist", value: (p) => p.avgWords, detail: (p) => `${p.avgWords.toFixed(1)} words per message` },
    { emoji: "🎬", title: "Conversation Starter", value: (p) => p.startShare / Math.max(p.share, 0.01), detail: (p) => `starts ${pct(p.startShare)} of conversations` },
    { emoji: "😂", title: "The Laugh Track", value: (p) => p.laughRate, detail: (p) => `laughs at ${pct(p.laughRate)} of messages` },
    { emoji: "📸", title: "The Photographer", value: (p) => p.media / p.messages, detail: (p) => `${p.media.toLocaleString("en")} photos, videos & files` },
    { emoji: "❓", title: "The Question Asker", value: (p) => p.questions / Math.max(1, p.messages), detail: (p) => `${p.questions.toLocaleString("en")} questions asked` },
    { emoji: "👻", title: "The Ghost", value: (p) => p.medianReply ?? 0, detail: (p) => `takes ${duration(p.medianReply)} to reply`, pool: repliers },
    { emoji: "⚡", title: "Speed Demon", value: (p) => (p.medianReply == null ? 0 : 1 / Math.max(p.medianReply, 30_000)), detail: (p) => `replies in ${duration(p.medianReply)}`, pool: repliers },
  ].map((t) => ({ ...t, mean: avg(t.value, t.pool ?? list) || 1 }));

  for (const p of list) {
    if (p.messages < Math.max(5, total * 0.005)) {
      p.signature = { emoji: "👀", title: "The Lurker", detail: `only ${p.messages} message${p.messages === 1 ? "" : "s"}, but definitely reading` };
      continue;
    }
    const best = traits.map((t) => ({ t, score: t.value(p) / t.mean })).sort((a, b) => b.score - a.score)[0];
    p.signature = best && best.score >= 1.2
      ? { emoji: best.t.emoji, title: best.t.title, detail: best.t.detail(p) }
      : { emoji: "🧩", title: "The Glue", detail: "right in the middle of every conversation" };
  }
}

// Deterministic awards; they work even when the AI is switched off.
export function awards(list, total) {
  const eligible = list.filter((p) => p.messages >= Math.max(15, total * 0.02));
  if (eligible.length < 2) return [];
  const pickBy = (score, filter = () => true) => {
    const c = eligible.filter(filter);
    return c.length ? c.reduce((a, b) => (score(b) > score(a) ? b : a)) : null;
  };
  const out = [];
  const add = (id, emoji, title, p, detail) => { if (p) out.push({ id, emoji, title, person: p.name, detail }); };

  add("chatterbox", "📣", "The Chatterbox", eligible[0], `${pct(eligible[0].share)} of all messages`);
  const hasReply = (p) => p.medianReply != null;
  const fast = pickBy((p) => -p.medianReply, hasReply);
  add("speed", "⚡", "Speed Demon", fast, fast && `replies in ${duration(fast.medianReply)}`);
  const slow = pickBy((p) => p.medianReply, hasReply);
  if (slow && slow !== fast) add("ghost", "👻", "The Ghost", slow, `takes ${duration(slow.medianReply)} to reply`);
  const starter = pickBy((p) => p.startShare);
  add("starter", "🎬", "Conversation Starter", starter, `starts ${pct(starter.startShare)} of chats`);
  const owl = pickBy((p) => p.nightShare);
  if (owl.nightShare >= 0.04) add("owl", "🦉", "Night Owl", owl, `${pct(owl.nightShare)} of messages after midnight`);
  const novelist = pickBy((p) => p.avgWords);
  add("novelist", "📚", "The Novelist", novelist, `${novelist.avgWords.toFixed(1)} words per message`);
  const emoji = pickBy((p) => p.emojiRate);
  if (emoji.emojis > 0) add("emoji", "✨", "Emoji Royalty", emoji, `${emoji.topEmoji ?? ""} ${emoji.emojis.toLocaleString("en")} emojis sent`.trim());
  const laugh = pickBy((p) => p.laughRate);
  if (laugh.laughs > 0) add("laugh", "😂", "The Laugh Track", laugh, `laughs at ${pct(laugh.laughRate)} of messages`);
  const media = pickBy((p) => p.media);
  if (media.media > 0) add("media", "📸", "The Photographer", media, `${media.media.toLocaleString("en")} photos, videos & files`);
  return out;
}
