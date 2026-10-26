// What the AI is allowed to see: anonymous aggregates only.
// Names become P1..P8 and are swapped back on this device; no message text is sent.
import { WEEKDAYS } from "./format.js";

const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;

export function insightsPayload(stats, { includeWords = false } = {}) {
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
  };
  return { payload, names: people.map((p) => p.name) };
}

export const deanonymize = (text, names) => text.replace(/\bP([1-8])\b/g, (m, n) => names[n - 1] ?? m);
