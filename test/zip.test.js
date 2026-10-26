import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { extractChat, isZip } from "../public/js/zip.js";

// Builds a real zip archive (stored or deflated entries) for the reader to open.
function makeZip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data, deflate } of files) {
    const nameBytes = Buffer.from(name), raw = Buffer.from(data);
    const body = deflate ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, body);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const dir = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, dir, end]));
}

const text = (bytes) => new TextDecoder().decode(bytes);

test("finds _chat.txt among media files in an iPhone export", async () => {
  const zip = makeZip([
    { name: "00000012-PHOTO-2024-03-14.jpg", data: "not really a jpeg" },
    { name: "_chat.txt", data: "[14/03/2024, 21:05:12] A: hi 👋\n".repeat(50), deflate: true },
  ]);
  assert.equal(await isZip(zip), true);
  const entry = await extractChat(zip);
  assert.equal(entry.name, "_chat.txt");
  assert.match(text(entry.bytes), /^\[14\/03\/2024, 21:05:12\] A: hi 👋/);
});

test("reads stored entries and skips macOS metadata", async () => {
  const zip = makeZip([
    { name: "__MACOSX/._chat.txt", data: "junk" },
    { name: "WhatsApp Chat with Leo.txt", data: "01/01/2025, 10:00 - Leo: yo" },
  ]);
  const entry = await extractChat(zip);
  assert.equal(entry.name, "WhatsApp Chat with Leo.txt");
  assert.equal(text(entry.bytes), "01/01/2025, 10:00 - Leo: yo");
});

test("explains what's wrong with unusable zips", async () => {
  await assert.rejects(extractChat(makeZip([{ name: "photo.jpg", data: "x" }])), /No chat file found/);
  await assert.rejects(extractChat(new Uint8Array(100)), /incomplete or damaged/);
  assert.equal(await isZip(new TextEncoder().encode("12/03/2024, 21:15 - A: hi")), false);
});
