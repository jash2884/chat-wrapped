import assert from "node:assert/strict";
import { test } from "node:test";
import { demoChat } from "../public/js/demo.js";
import { parseChat, parseTelegram, parseWhatsApp } from "../public/js/parse.js";

const LRM = "‎", NNBSP = " ";

test("iPhone export: 12-hour clock, direction marks, media and system notices", () => {
  const raw = [
    `[3/14/24, 9:05:10${NNBSP}PM] Kabir: ${LRM}Messages and calls are end-to-end encrypted. No one outside of this chat can read them.`,
    `[3/14/24, 9:05:12${NNBSP}PM] Kabir: hey!`,
    `[3/14/24, 9:06:00${NNBSP}PM] Aanya: hi 😊`,
    `this is a second line`,
    `${LRM}[3/14/24, 9:07:00${NNBSP}PM] Aanya: ${LRM}image omitted`,
    `[3/14/24, 12:01:00${NNBSP}AM] Kabir: ${LRM}This message was deleted.`,
    `[3/15/24, 12:30:00${NNBSP}PM] Kabir: lunch? <This message was edited>`,
  ].join("\n");
  const chat = parseWhatsApp(raw, "WhatsApp Chat - Aanya.zip");
  assert.equal(chat.title, "Aanya");
  assert.deepEqual(chat.messages.map((m) => [m.author, m.kind, m.text]), [
    ["Kabir", "text", "hey!"],
    ["Aanya", "text", "hi 😊\nthis is a second line"],
    ["Aanya", "media", ""],
    ["Kabir", "deleted", ""],
    ["Kabir", "text", "lunch?"],
  ]);
  // Month-first because 14 can't be a month; 9:05 PM is 21:05; 12:01 AM is 00:01.
  assert.equal(new Date(chat.messages[0].ts).toISOString(), "2024-03-14T21:05:00.000Z");
  assert.equal(new Date(chat.messages[3].ts).toISOString(), "2024-03-14T00:01:00.000Z");
});

test("Android export: 24-hour clock, day-first dates and group notices", () => {
  const raw = [
    "02/01/2025, 18:30 - Messages and calls are end-to-end encrypted.",
    '02/01/2025, 18:30 - Maya created group "Weekend Crew"',
    "02/01/2025, 18:31 - Maya added Leo",
    "02/01/2025, 18:32 - Maya: who's free saturday",
    "13/01/2025, 07:05 - +44 7700 900123: <Media omitted>",
    "13/01/2025, 07:06 - Leo: ratio: 2:1 in favour",
  ].join("\r\n");
  const chat = parseWhatsApp(raw, "_chat.txt");
  assert.equal(chat.title, "Weekend Crew");
  assert.equal(chat.messages.length, 3);
  assert.equal(new Date(chat.messages[0].ts).toISOString(), "2025-01-02T18:32:00.000Z");
  assert.equal(chat.messages[1].author, "+44 7700 900123");
  assert.equal(chat.messages[1].kind, "media");
  assert.equal(chat.messages[2].text, "ratio: 2:1 in favour");
});

test("ambiguous dates fall back to the reading that keeps messages in order", () => {
  // Every number is <= 12, so both day-first and month-first are possible.
  const raw = ["1/2/24, 10:00 - A: one", "1/3/24, 10:00 - B: two", "1/4/24, 10:00 - A: three", "2/1/24, 10:00 - B: four"].join("\n");
  const months = parseWhatsApp(raw).messages.map((m) => new Date(m.ts).getUTCMonth() + 1);
  assert.deepEqual(months, [1, 1, 1, 2]); // month-first: Jan 2, Jan 3, Jan 4, Feb 1
});

test("rejects text that isn't a chat export", () => {
  assert.throws(() => parseWhatsApp("hello\nworld"), /doesn't look like a WhatsApp/);
});

test("Telegram JSON: rich text arrays, media and service messages", () => {
  const chat = parseTelegram({
    name: "Book Club",
    messages: [
      { type: "service", date: "2024-05-01T10:00:00", actor: "Zoe", action: "create_group" },
      { type: "message", date: "2024-05-01T10:01:00", from: "Zoe", text: ["read ", { type: "bold", text: "chapter 3" }, " yet?"] },
      { type: "message", date: "2024-05-01T10:02:00", from: "Leo", text: "", photo: "photos/1.jpg" },
      { type: "message", date: "2024-05-01T10:03:00", from: null, text: "hi" },
    ],
  });
  assert.equal(chat.title, "Book Club");
  assert.deepEqual(chat.messages.map((m) => [m.author, m.kind, m.text]), [
    ["Zoe", "text", "read chapter 3 yet?"],
    ["Leo", "media", ""],
    ["Deleted Account", "text", "hi"],
  ]);
});

test("Telegram full-account export picks the busiest chat", () => {
  const msg = (text) => ({ type: "message", date: "2024-01-01T00:00:00", from: "A", text });
  const chat = parseChat(JSON.stringify({ chats: { list: [{ name: "Small", messages: [msg("a")] }, { name: "Big", messages: [msg("a"), msg("b")] }] } }));
  assert.equal(chat.title, "Big");
});

test("the demo chat is deterministic and parses cleanly", () => {
  const a = demoChat();
  assert.equal(a, demoChat());
  const chat = parseChat(a);
  assert.equal(chat.title, "The Group Chat 🍕");
  assert.ok(chat.messages.length > 3000);
  assert.deepEqual(new Set(chat.messages.map((m) => m.author)), new Set(["Maya", "Arjun", "Zoe", "Leo"]));
});
