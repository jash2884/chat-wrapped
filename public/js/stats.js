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
  return { name, messages: 0, texts: 0, words: 0, media: 0, deleted: 0, emojis: 0, laughs: 0, questions: 0, night: 0, starts: 0, replies: [], emojiMap: new Map() };
}

export function analyze({ title, platform, messages }) {
  const msgs = [...messages].sort((a, b) => a.ts - b.ts);
  if (msgs.length < 10) throw new Error("This chat has fewer than 10 messages. Not quite enough to wrap.");

  const people = new Map(), days = new Map(), months = new Map(), words = new Map(), emojis = new Map();
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0)); // Monday-first × hour
  const totals = { messages: msgs.length, words: 0, media: 0, deleted: 0 };
  let prev = null, conversations = 0;

  for (const m of msgs) {
    let p = people.get(m.author);
    if (!p) people.set(m.author, (p = newPerson(m.author)));
    const d = new Date(m.ts), hr = d.getUTCHours();
    p.messages++;
    heat[(d.getUTCDay() + 6) % 7][hr]++;
    bump(days, Math.floor(m.ts / DAY));
    bump(months, d.toISOString().slice(0, 7));
    if (hr < 5) p.night++;
    if (!prev || m.ts - prev.ts >= CONVO_GAP) { p.starts++; conversations++; }
    else if (prev.author !== m.author) p.replies.push(m.ts - prev.ts);
    prev = m;

    if (m.kind === "media") { p.media++; totals.media++; continue; }
    if (m.kind === "deleted") { p.deleted++; totals.deleted++; continue; }
    p.texts++;
    const text = m.text.replace(LINK, " ");
    for (const e of text.match(EMOJI) ?? []) { bump(emojis, e); bump(p.emojiMap, e); p.emojis++; }
    if (LAUGH.test(text)) p.laughs++;
    if (text.includes("?")) p.questions++;
    let n = 0;
    for (const raw of text.toLowerCase().match(WORD) ?? []) {
      n++;
      const w = raw.replace(/['’]+$/, "");
      if (w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)) bump(words, w);
    }
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
  }));

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
    topEmojis: top(emojis, 12),
    firstMessage: { author: first.author, ts: first.ts, text: first.kind === "text" ? first.text.slice(0, 160) : first.kind === "media" ? "📎 (a photo or file)" : "(deleted)" },
    awards: awards(list, total),
  };
}

export function chronotype(peakHour, nightShare) {
  if (nightShare >= 0.12 || peakHour < 4) return { label: "Night Owls", emoji: "🦉", line: `${pct(nightShare)} of messages land between midnight and 5 AM.` };
  if (peakHour < 11) return { label: "Early Birds", emoji: "🌅", line: "Good morning texts are your love language." };
  if (peakHour < 17) return { label: "Office-Hours Chatters", emoji: "☕", line: "Suspiciously active during working hours." };
  return { label: "Evening People", emoji: "🌆", line: "The day's real business starts after dinner." };
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
