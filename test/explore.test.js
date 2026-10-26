import assert from "node:assert/strict";
import { test } from "node:test";
import { matcher, quiz, searchChat } from "../public/js/explore.js";
import { parseWhatsApp } from "../public/js/parse.js";
import { analyze } from "../public/js/stats.js";

const at = (day, h, m = 0) => Date.UTC(2026, 0, day, h, m);
const msg = (ts, author, text, kind = "text", extra = {}) => ({ ts, author, text, kind, ...extra });

test("word search matches whole words, emoji and is case-insensitive", () => {
  const messages = [
    msg(at(1, 9), "A", "Bro what"), msg(at(1, 10), "B", "brother is here"), msg(at(2, 9), "B", "bro bro 😂"),
    msg(at(40, 9), "A", "😂😂"), msg(at(41, 9), "A", "", "media"),
  ];
  const bro = searchChat(messages, "bro");
  assert.equal(bro.total, 3);
  assert.equal(bro.messages, 2);
  assert.deepEqual(bro.people, [["B", 2], ["A", 1]]);
  assert.deepEqual(bro.first, { author: "A", ts: at(1, 9) });
  assert.equal(searchChat(messages, "😂").total, 3);
  assert.deepEqual(searchChat(messages, "😂").months.map(([m]) => m), ["2026-01", "2026-02"]);
  assert.equal(searchChat(messages, "   "), null);
  assert.ok(matcher("a.b*").test("a.b*"), "regex characters are escaped");
});

test("quiz questions are real, guessable and safe to show", () => {
  const messages = [];
  for (let i = 0; i < 40; i++) {
    messages.push(msg(at(1 + i, 9), "A", "who is coming for dinner tonight then"));
    messages.push(msg(at(1 + i, 10), "B", "my number is 9876543210 call me now"));
    messages.push(msg(at(1 + i, 11), "B", "check this https://example.com out now please"));
    messages.push(msg(at(1 + i, 12), "C", "i will bring the cake for everyone"));
    messages.push(msg(at(1 + i, 13), "D", "ok"));
  }
  const people = [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }];
  const qs = quiz(messages, people, { count: 10, seed: 42 });
  assert.equal(qs.length, 10);
  for (const q of qs) {
    assert.ok(["A", "C"].includes(q.answer), "B only has phone numbers and links; D only short replies");
    assert.ok(q.options.includes(q.answer));
    assert.equal(new Set(q.options).size, q.options.length);
    assert.ok(!/\d{5,}|https?:/.test(q.text));
  }
  assert.deepEqual(quiz(messages, people, { count: 10, seed: 42 }), qs, "same seed, same quiz");
});

test("group habits: conversation killers, double texts, links, gm/gn, edits and media types", () => {
  const raw = [];
  const line = (d, h, m, who, text) => raw.push(`${String(d).padStart(2, "0")}/01/2026, ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} - ${who}: ${text}`);
  for (let d = 1; d <= 12; d++) {
    line(d, 8, 0, "Asha", "good morning ☀️");
    line(d, 8, 1, "Ben", "hey https://www.instagram.com/reel/abc look");
    line(d, 8, 2, "Ben", "this one too https://youtu.be/xyz");
    line(d, 8, 3, "Ben", "lol <This message was edited>");
    line(d, 8, 4, "Asha", "❤️❤️ good night");
    line(d, 8, 5, "Cara", "ok bye");
  }
  const stats = analyze(parseWhatsApp(raw.join("\n")));
  const quirk = (id) => stats.quirks.find((q) => q.id === id);
  assert.equal(quirk("killer").person, "Cara");
  assert.equal(quirk("double").person, "Ben");
  assert.equal(quirk("links").person, "Ben");
  assert.equal(quirk("gm").person, "Asha");
  assert.equal(quirk("edits").person, "Ben");
  assert.deepEqual(stats.sites, [["Instagram", 12], ["YouTube", 12]]);
  assert.equal(stats.marathon.messages, 6);
  assert.equal(stats.people.find((p) => p.name === "Asha").hearts, 24);
  assert.deepEqual(stats.replyMatrix.names.length, 3);
});

test("iPhone media types are recognised", () => {
  const raw = [
    "[14/03/2024, 21:05:12] A: ‎image omitted", "[14/03/2024, 21:06:12] B: ‎audio omitted",
    "[14/03/2024, 21:07:12] A: ‎sticker omitted", "[14/03/2024, 21:08:12] B: ‎GIF omitted",
  ].join("\n");
  assert.deepEqual(parseWhatsApp(raw).messages.map((m) => m.media), ["photo", "voice", "sticker", "gif"]);
});
