// Validation and prompt for the AI insights endpoint. The browser only ever
// sends anonymous aggregates (see public/js/payload.js); this re-checks every
// field so nothing else can be smuggled through to the model.

export type Member = {
  id: string; share: number; avgWords: number; nightShare: number; medianReplyMin: number | null;
  startShare: number; laughRate: number; emojiRate: number; mediaShare: number; topEmoji: string | null;
};
export type Payload = {
  kind: "group" | "direct"; people: number; days: number; activeDays: number; messages: number; perDay: number;
  peakHour: number; peakWeekday: string; chronotype: string; streakDays: number; longestSilenceDays: number;
  busiestDayMessages: number; topEmojis: string[]; topWords: string[]; members: Member[];
  awards: { award: string; id: string }[];
  you: string | null;
};
export type Insights = { vibe: string; summary: string; personas: { id: string; title: string; line: string }[]; prediction: string };

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CHRONOTYPES = ["Night Owls", "Early Birds", "Office-Hours Chatters", "Evening People"];
const AWARDS = ["The Chatterbox", "Speed Demon", "The Ghost", "Conversation Starter", "Night Owl", "The Novelist", "Emoji Royalty", "The Laugh Track", "The Photographer"];
const EMOJI = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️]{1,16}$/u;
const WORD = /^[\p{L}\p{N}'’]{1,24}$/u;
const ID = /^P[1-8]$/;

class Invalid extends Error {}

function num(v: unknown, min: number, max: number, field: string): number {
  const n = typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n < min || n > max) throw new Invalid(`${field} is out of range.`);
  return n;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (!allowed.includes(v as T)) throw new Invalid(`${field} is not recognised.`);
  return v as T;
}
function list<T>(v: unknown, max: number, field: string, each: (x: unknown) => T): T[] {
  if (!Array.isArray(v) || v.length > max) throw new Invalid(`${field} must be a list of at most ${max}.`);
  return v.map(each);
}
const emoji = (x: unknown) => { if (typeof x !== "string" || !EMOJI.test(x)) throw new Invalid("Unexpected emoji value."); return x; };

export function sanitize(input: unknown): Payload {
  if (!input || typeof input !== "object") throw new Invalid("Expected a JSON object.");
  const p = input as Record<string, unknown>;
  const members = list(p.members, 8, "members", (m) => {
    const o = (m ?? {}) as Record<string, unknown>;
    if (typeof o.id !== "string" || !ID.test(o.id)) throw new Invalid("Member ids must look like P1..P8.");
    return {
      id: o.id,
      share: num(o.share, 0, 1, "share"),
      avgWords: num(o.avgWords, 0, 500, "avgWords"),
      nightShare: num(o.nightShare, 0, 1, "nightShare"),
      medianReplyMin: o.medianReplyMin == null ? null : num(o.medianReplyMin, 0, 10_000, "medianReplyMin"),
      startShare: num(o.startShare, 0, 1, "startShare"),
      laughRate: num(o.laughRate, 0, 1, "laughRate"),
      emojiRate: num(o.emojiRate, 0, 100, "emojiRate"),
      mediaShare: num(o.mediaShare, 0, 1, "mediaShare"),
      topEmoji: o.topEmoji == null ? null : emoji(o.topEmoji),
    };
  });
  if (members.length < 1) throw new Invalid("At least one member is required.");
  const ids = new Set(members.map((m) => m.id));
  return {
    kind: oneOf(p.kind, ["group", "direct"] as const, "kind"),
    people: num(p.people, 1, 100_000, "people"),
    days: num(p.days, 1, 100_000, "days"),
    activeDays: num(p.activeDays, 1, 100_000, "activeDays"),
    messages: num(p.messages, 1, 1e8, "messages"),
    perDay: num(p.perDay, 0, 1e6, "perDay"),
    peakHour: num(p.peakHour, 0, 23, "peakHour"),
    peakWeekday: oneOf(p.peakWeekday, WEEKDAYS, "peakWeekday"),
    chronotype: oneOf(p.chronotype, CHRONOTYPES, "chronotype"),
    streakDays: num(p.streakDays, 0, 100_000, "streakDays"),
    longestSilenceDays: num(p.longestSilenceDays, 0, 100_000, "longestSilenceDays"),
    busiestDayMessages: num(p.busiestDayMessages, 0, 1e7, "busiestDayMessages"),
    topEmojis: list(p.topEmojis, 8, "topEmojis", emoji),
    topWords: list(p.topWords, 20, "topWords", (w) => {
      if (typeof w !== "string" || !WORD.test(w)) throw new Invalid("Unexpected word value.");
      return w;
    }),
    members,
    awards: list(p.awards, 12, "awards", (a) => {
      const o = (a ?? {}) as Record<string, unknown>;
      if (typeof o.id !== "string" || !ids.has(o.id)) throw new Invalid("Award refers to an unknown member.");
      return { award: oneOf(o.award, AWARDS, "award"), id: o.id };
    }),
    you: youId(p.you, ids),
  };
}
function youId(v: unknown, ids: Set<string>): string | null {
  if (v == null) return null;
  if (typeof v === "string" && ids.has(v)) return v;
  throw new Invalid("you must be a member id.");
}
export const isInvalid = (e: unknown): e is Error => e instanceof Invalid;

export const SYSTEM = `You write playful, warm "Wrapped"-style insights about a chat, using only the anonymous statistics provided.
Refer to people only by their ids (P1, P2, ...) exactly as written; the app swaps in real names afterwards.
If "you" is set, that member is the reader: write about them in the second person with the word "You" instead of their id, with matching verbs (e.g. "You reply fastest and never miss a joke").
Be funny but kind. Tease habits (slow replies, emoji addiction, 2 AM messages) and never appearance, identity, health, money or relationships.
Ground every claim in the numbers. Do not invent events. Keep the language simple and global (no slang that needs explaining).
Lengths: "vibe" is a 3-6 word title, not a sentence. "summary" is two short sentences. Each persona "title" is 2-4 words and each "line" is one sentence under 20 words. Don't quote raw percentages or decimals; translate them ("a third of all messages", "replies within a minute").`;

export const SCHEMA = {
  type: "object",
  properties: {
    vibe: { type: "string", description: "3 to 6 word title capturing the chat's energy" },
    summary: { type: "string", description: "Two short sentences describing the chat's personality" },
    personas: {
      type: "array",
      description: "One entry per member id",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Member id such as P1" },
          title: { type: "string", description: "2 to 4 word nickname" },
          line: { type: "string", description: "One playful sentence, at most 20 words, mentioning the id" },
        },
        required: ["id", "title", "line"],
      },
    },
    prediction: { type: "string", description: "One playful prediction for this chat's next year" },
  },
  required: ["vibe", "summary", "personas", "prediction"],
};

// Trims to max characters, backing up to a word boundary rather than cutting mid-word.
function text(v: unknown, max: number) {
  if (typeof v !== "string") return "";
  const s = v.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const space = s.lastIndexOf(" ", max - 1);
  const cut = space > max * 0.6 ? s.slice(0, space) : s.slice(0, max - 1);
  return `${cut.replace(/[,;:.!?-]+$/, "")}…`;
}

// Never trust model output: trim it, cap lengths and drop personas for unknown ids.
export function cleanOutput(raw: unknown, payload: Payload): Insights {
  const o = (raw ?? {}) as Record<string, unknown>;
  const ids = new Set(payload.members.map((m) => m.id));
  const seen = new Set<string>();
  const personas = (Array.isArray(o.personas) ? o.personas : [])
    .map((x) => (x ?? {}) as Record<string, unknown>)
    .filter((x) => typeof x.id === "string" && ids.has(x.id) && !seen.has(x.id) && seen.add(x.id))
    .map((x) => ({ id: x.id as string, title: text(x.title, 40), line: text(x.line, 180) }))
    .filter((x) => x.title && x.line);
  const out = { vibe: text(o.vibe, 60), summary: text(o.summary, 360), personas, prediction: text(o.prediction, 220) };
  if (!out.vibe || !out.summary) throw new Error("The model returned an incomplete answer.");
  return out;
}
