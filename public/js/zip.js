// Minimal zip reader: finds the chat text inside a WhatsApp/Telegram export.
// It reads only the central directory and the one entry it needs, so a 2 GB
// export full of photos never gets loaded into memory.

const EOCD = 0x06054b50, CENTRAL = 0x02014b50, LOCAL = 0x04034b50;

// source: a Blob/File, or bytes (Uint8Array/ArrayBuffer) in tests.
function reader(source) {
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    return { size: source.size, read: async (at, len) => new Uint8Array(await source.slice(at, at + len).arrayBuffer()) };
  }
  const u8 = source instanceof Uint8Array ? source : new Uint8Array(source);
  return { size: u8.length, read: async (at, len) => u8.subarray(at, at + len) };
}

const view = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

export async function isZip(source) {
  const r = reader(source);
  if (r.size < 4) return false;
  return view(await r.read(0, 4)).getUint32(0, true) === LOCAL;
}

export async function extractChat(source) {
  const r = reader(source);
  const tailLen = Math.min(r.size, 65_557);
  const tail = await r.read(r.size - tailLen, tailLen), tv = view(tail);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tv.getUint32(i, true) === EOCD) { eocd = i; break; }
  if (eocd < 0) throw new Error("This zip file looks incomplete or damaged.");

  const count = tv.getUint16(eocd + 10, true);
  const dirSize = tv.getUint32(eocd + 12, true), dirAt = tv.getUint32(eocd + 16, true);
  const dir = await r.read(dirAt, dirSize), dv = view(dir), names = new TextDecoder();
  const entries = [];
  for (let p = 0, n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== CENTRAL) throw new Error("This zip file looks damaged.");
    const nameLen = dv.getUint16(p + 28, true);
    entries.push({
      method: dv.getUint16(p + 10, true),
      size: dv.getUint32(p + 20, true),
      local: dv.getUint32(p + 42, true),
      name: names.decode(dir.subarray(p + 46, p + 46 + nameLen)),
    });
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }

  const usable = entries.filter((e) => !e.name.startsWith("__MACOSX/") && !e.name.endsWith("/"));
  const entry = usable.find((e) => /(^|\/)_chat\.txt$/i.test(e.name))
    ?? usable.find((e) => /\.txt$/i.test(e.name))
    ?? usable.find((e) => /\.json$/i.test(e.name));
  if (!entry) throw new Error("No chat file found in this zip. Expected a .txt (WhatsApp) or .json (Telegram) file.");

  const head = view(await r.read(entry.local, 30));
  if (head.getUint32(0, true) !== LOCAL) throw new Error("This zip file looks damaged.");
  const start = entry.local + 30 + head.getUint16(26, true) + head.getUint16(28, true);
  const data = await r.read(start, entry.size);
  if (entry.method === 0) return { name: entry.name, bytes: data };
  if (entry.method !== 8) throw new Error("This zip uses an unsupported compression method.");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return { name: entry.name, bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
}
