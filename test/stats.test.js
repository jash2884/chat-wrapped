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
