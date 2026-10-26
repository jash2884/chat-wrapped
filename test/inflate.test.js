import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { inflateRaw } from "../public/js/inflate.js";
import { demoChat } from "../public/js/demo.js";

const roundTrip = (buf, level) => Buffer.from(inflateRaw(new Uint8Array(deflateRawSync(buf, { level })))).equals(buf);

test("decodes zlib output at every compression level (stored, fixed and dynamic blocks)", () => {
  const chat = Buffer.from(demoChat());
  for (const level of [0, 1, 6, 9]) assert.ok(roundTrip(chat, level), `level ${level}`);
});

test("random, repetitive, empty and emoji-heavy inputs", () => {
  let seed = 9;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 60; k++) {
    const n = Math.floor(rand() * 40000);
    const buf = Buffer.alloc(n);
    const alphabet = 1 + Math.floor(rand() * 255);
    for (let i = 0; i < n; i++) buf[i] = rand() < 0.3 && i > 300 ? buf[i - 1 - Math.floor(rand() * 300)] : Math.floor(rand() * alphabet);
    assert.ok(roundTrip(buf, k % 10), `case ${k}`);
  }
  assert.ok(roundTrip(Buffer.alloc(0), 6));
  assert.ok(roundTrip(Buffer.from("😂🔥 ".repeat(5000)), 9));
});

test("corrupt or truncated data fails with a readable message", () => {
  const good = deflateRawSync(Buffer.from(demoChat()));
  assert.throws(() => inflateRaw(new Uint8Array(good.subarray(0, good.length / 2))), /ended early|corrupt/);
});
