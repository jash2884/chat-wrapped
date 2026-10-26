// What the AI is allowed to see: anonymous aggregates only.
// Names become P1..P8 and are swapped back on this device; no message text is sent.
import { WEEKDAYS } from "./format.js";

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

export function insightsPayload(stats, { includeWords = false, you = null } = {}) {
  const people = stats.people.slice(0, 8);
  const ids = new Map(people.map((p, i) => [p.name, `P${i + 1}`]));
  const payload = {
    kind: stats.isGroup ? "group" : "direct",
    people: stats.people.length,
    days: stats.totals.days,
    activeDays: stats.totals.activeDays,
    messages: stats.totals.messages,
    perDay: r1(stats.totals.perDay),
    peakHour: stats.peakHour,
    peakWeekday: WEEKDAYS[stats.peakWeekday],
    chronotype: stats.chronotype.label,
    streakDays: stats.streak.days,
    longestSilenceDays: stats.silence?.days ?? 0,
    busiestDayMessages: stats.busiestDay.count,
    topEmojis: stats.topEmojis.slice(0, 8).map(([e]) => e),
    topWords: includeWords ? stats.topWords.slice(0, 20).map(([w]) => w) : [],
    members: people.map((p) => ({
      id: ids.get(p.name),
      share: r2(p.share),
      avgWords: r1(p.avgWords),
      nightShare: r2(p.nightShare),
      medianReplyMin: p.medianReply == null ? null : r1(p.medianReply / 60_000),
      startShare: r2(p.startShare),
      laughRate: r2(p.laughRate),
      emojiRate: r2(p.emojiRate),
      mediaShare: r2(p.media / p.messages),
      topEmoji: p.topEmoji,
    })),
    awards: stats.awards.filter((a) => ids.has(a.person)).map((a) => ({ award: a.title, id: ids.get(a.person) })),
    you: ids.get(you) ?? null,
  };
  // The person who exported the chat is shown as "You".
  return { payload, names: people.map((p) => (p.name === you ? "You" : p.name)) };
}

export const deanonymize = (text, names) => fixYou(text.replace(/\bP([1-8])\b/g, (m, n) => names[n - 1] ?? m));

// "You" replaced a third-person id, so fix the grammar: "You keeps" -> "You keep",
// "You is" -> "You are", "You's" -> "Your".
const IRREGULAR = { is: "are", has: "have", does: "do", was: "were", goes: "go" };
export function fixYou(text) {
  return text
    .replace(/\bYou's\b/g, "Your")
    .replace(/\b(You) (always |never |often |usually |clearly |also |still |really )?([a-z]+)\b/g, (m, you, adverb = "", verb) => {
      let v = verb;
      if (IRREGULAR[verb]) v = IRREGULAR[verb];
      else if (/[^aeiou]ies$/.test(verb)) v = verb.slice(0, -3) + "y";
      else if (/(ss|sh|ch|x|o)es$/.test(verb)) v = verb.slice(0, -2);
      else if (/[^s]s$/.test(verb) && verb.length > 3) v = verb.slice(0, -1);
      return `${you} ${adverb}${v}`;
    });
}
