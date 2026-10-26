import assert from "node:assert/strict";
import { test } from "node:test";
import { deanonymize, insightsPayload } from "../public/js/payload.js";
import { analyze } from "../public/js/stats.js";

const MIN = 60_000;
const at = (day, h, m = 0) => Date.UTC(2026, 0, day, h, m);
const msg = (ts, author, text = "hello there", kind = "text") => ({ ts, author, text, kind });

test("reply times, conversation starts and night messages", () => {
  const messages = [];
  // Ten conversations a day apart: A opens, B replies after 2 min, A after 10 min.
  for (let d = 1; d <= 10; d++) {
    messages.push(msg(at(d, 1), "A", "you up? 😂"), msg(at(d, 1, 2), "B", "hahaha yes"), msg(at(d, 1, 12), "A", "ok"));
  }
  const s = analyze({ title: "t", platform: "whatsapp", messages });
  const [a, b] = s.people;
  assert.equal(a.name, "A");
  assert.equal(a.starts, 10);
  assert.equal(b.starts, 0);
  assert.equal(b.medianReply, 2 * MIN);
  assert.equal(a.medianReply, 10 * MIN);
  assert.equal(a.nightShare, 1);
  assert.equal(b.laughRate, 1);
  assert.equal(s.totals.conversations, 10);
  assert.equal(s.peakHour, 1);
  assert.equal(s.chronotype.label, "Night Owls");
  assert.deepEqual(s.topEmojis, [["😂", 10]]);
  assert.equal(s.isGroup, false);
});

test("streaks, silences, busiest day and a gap-filled timeline", () => {
  const days = [1, 2, 3, 4, 10, 11, 75]; // Jan 1–4 streak, 5-day gap, then March 16
  const messages = days.flatMap((d) => [msg(at(d, 12), "A"), msg(at(d, 12, 5), "B")]);
  messages.push(msg(at(10, 13), "A"), msg(at(10, 14), "A"));
  const s = analyze({ title: "t", platform: "whatsapp", messages });
  assert.deepEqual(s.streak, { days: 4, from: "2026-01-01", to: "2026-01-04" });
  assert.deepEqual(s.silence, { days: 63, from: "2026-01-12", to: "2026-03-15" });
  assert.deepEqual(s.busiestDay, { date: "2026-01-10", count: 4 });
  assert.deepEqual(s.timeline.map((m) => m.month), ["2026-01", "2026-02", "2026-03"]);
  assert.equal(s.timeline[1].count, 0);
});

test("top words skip stopwords, links and numbers", () => {
  const messages = Array.from({ length: 12 }, (_, i) =>
    msg(at(1, 10, i), i % 2 ? "A" : "B", "the pizza is https://example.com/pizza 2024 really good pizza"));
  const s = analyze({ title: "t", platform: "whatsapp", messages });
  assert.deepEqual(s.topWords.slice(0, 2), [["pizza", 24], ["good", 12]]);
});

test("awards need enough messages and pick sensible winners", () => {
  const messages = [];
  for (let d = 1; d <= 20; d++) {
    messages.push(msg(at(d, 9), "Fast", "short"), msg(at(d, 9, 1), "Slow", "a much longer considered message with many words in it"), msg(at(d, 9, 31), "Fast", "ok"));
  }
  messages.push(msg(at(21, 9), "Lurker", "hi"));
  const s = analyze({ title: "t", platform: "whatsapp", messages });
  const award = (id) => s.awards.find((a) => a.id === id)?.person;
  assert.equal(award("speed"), "Slow"); // Slow answers Fast within 1 min
  assert.equal(award("ghost"), "Fast"); // Fast takes 30 min to answer
  assert.equal(award("novelist"), "Slow");
  assert.ok(!s.awards.some((a) => a.person === "Lurker"));
});

test("too-small chats are rejected with a friendly message", () => {
  assert.throws(() => analyze({ title: "t", platform: "whatsapp", messages: [msg(1, "A")] }), /fewer than 10/);
});

test("the AI payload is anonymous and names are restored locally", () => {
  const messages = [];
  for (let d = 1; d <= 10; d++) messages.push(msg(at(d, 20), "Priya Sharma", "secret plans 🎉"), msg(at(d, 20, 3), "Rahul", "noted"));
  const s = analyze({ title: "Family", platform: "whatsapp", messages });
  const { payload, names } = insightsPayload(s);
  const sent = JSON.stringify(payload);
  assert.ok(!sent.includes("Priya") && !sent.includes("Rahul") && !sent.includes("secret") && !sent.includes("Family"));
  assert.deepEqual(payload.members.map((m) => m.id), ["P1", "P2"]);
  assert.deepEqual(payload.topWords, []);
  assert.deepEqual(insightsPayload(s, { includeWords: true }).payload.topWords, ["noted", "plans", "secret"]); // ties sort alphabetically
  assert.equal(deanonymize("P1 plans, P2 replies, P9 is unknown", names), "Priya Sharma plans, Rahul replies, P9 is unknown");
});

test("the WhatsApp caption shares totals only", async () => {
  const { groupCaption } = await import("../public/js/share.js");
  const messages = [];
  for (let d = 1; d <= 10; d++) messages.push(msg(at(d, 21), "Priya Sharma", "secret plans 🎉"), msg(at(d, 21, 3), "Rahul", "noted"));
  const caption = groupCaption(analyze({ title: "Sharma Family", platform: "whatsapp", messages }));
  assert.equal(caption, "Our chat, wrapped 🎁 20 messages, peak hour 9 PM, top emoji 🎉. Make yours in 30 seconds (it never leaves your phone): https://wrapped.jashparmar.com");
});

test("every person gets a title, including lurkers in a big group", async () => {
  const { analyzeAll } = await import("../public/js/stats.js");
  const messages = [];
  for (let d = 1; d <= 20; d++) {
    for (let k = 0; k < 30; k++) messages.push(msg(at(d, 12, k), `Person ${k % 30}`, k % 5 ? "sounds good" : "who is up for dinner tonight? 🍕"));
  }
  messages.push(msg(at(21, 23), "Quiet One", "hi"));
  const { all } = analyzeAll({ title: "Big", platform: "whatsapp", messages });
  assert.equal(all.people.length, 31);
  assert.ok(all.people.every((p) => p.signature?.title && p.rank >= 1));
  assert.equal(all.people.find((p) => p.name === "Quiet One").signature.title, "The Lurker");
});

test("catchphrases, duos and per-year wraps with a comparison", async () => {
  const { analyzeAll } = await import("../public/js/stats.js");
  const messages = [];
  const y = (year, day, h, m) => Date.UTC(year, 0, day, h, m);
  for (let d = 1; d <= 20; d++) {
    messages.push(msg(y(2025, d, 22, 0), "A", "good night everyone"), msg(y(2025, d, 22, 1), "B", "good night"), msg(y(2025, d, 22, 2), "C", "ok"));
  }
  for (let d = 1; d <= 30; d++) {
    messages.push(msg(y(2026, d, 9, 0), "A", "happy birthday to you"), msg(y(2026, d, 9, 1), "B", "thanks so much"), msg(y(2026, d, 9, 2), "A", "see you"));
  }
  const r = analyzeAll({ title: "t", platform: "whatsapp", messages }, 30);
  assert.deepEqual(r.years, [2026, 2025]);
  assert.equal(r.byYear[2026].totals.messages, 90);
  assert.deepEqual(r.byYear[2026].previous, { year: 2025, messages: 60 });
  assert.equal(r.byYear[2026].period, "2026");
  assert.ok(r.all.phrases.some(([g]) => g === "good night"));
  assert.ok(r.all.phrases.some(([g]) => g === "happy birthday"));
  assert.deepEqual(r.all.duos[0].people, ["A", "B"]);
  assert.equal(r.all.people.find((p) => p.name === "B").bestBuddy.name, "A");
});

test("the person who exported shows as You with correct grammar", async () => {
  const { fixYou } = await import("../public/js/payload.js");
  assert.equal(fixYou("You keeps the group alive"), "You keep the group alive");
  assert.equal(fixYou("You is the night owl and You's emojis rule"), "You are the night owl and Your emojis rule");
  const messages = [];
  for (let d = 1; d <= 10; d++) messages.push(msg(at(d, 20), "Priya", "hey"), msg(at(d, 20, 3), "Rahul", "hello"));
  const { payload, names } = insightsPayload(analyze({ title: "t", platform: "whatsapp", messages }), { you: "Rahul" });
  assert.equal(payload.you, "P2");
  assert.deepEqual(names, ["Priya", "You"]);
});
