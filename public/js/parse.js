// Parsers for chat exports. Everything here runs on the user's device.
// Output: { title, platform, messages: [{ ts, author, text, kind }] }
//   ts   wall-clock time encoded as UTC milliseconds (deliberately timezone-free)
//   kind "text" | "media" | "deleted"; system notices are dropped

const BIDI = /[‎‏‪-‮⁦-⁩﻿]/g;
const ODD_SPACES = /[   ]/g;
// [12/03/2024, 21:15:03] Name: hi          (iOS)
// 12/03/24, 9:15 pm - Name: hi             (Android)
const HEADER = /^[‎‏﻿]*\[?(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s*([ap])\.?\s?m\.?)?\]?(?:\s+-)?\s+(.+)$/i;
const MEDIA = /^<media omitted>$|\bomitted>?$|\(file attached\)$|^<attached: .+>$|^null$/i;
const DELETED = /^(?:this message was deleted|you deleted this message|message deleted)\.?$/i;
const EDITED = /\s*<this message was edited>$/i;
const ENCRYPTION = /messages and calls are end-to-end encrypted/i;

function titleFromFilename(name) {
  const base = name.split(/[\\/]/).pop().replace(/\.(txt|zip|json)$/i, "").trim();
  const m = /^whatsapp chat (?:with|-)\s*(.+)$/i.exec(base);
  if (m) return m[1].trim();
  return base && !/^_?chat$|^result$/i.test(base) ? base : null;
}

function pickDateOrder(dates, items) {
  if (dates.some((d) => d[0] > 31)) return "ymd";
  const valid = ["dmy", "mdy"].filter((o) =>
    dates.every(([a, b]) => (o === "dmy" ? a <= 31 && b <= 12 : a <= 12 && b <= 31)));
  if (valid.length < 2) return valid[0] ?? "dmy";
  // Both readings are possible: pick the one that keeps the chat in chronological order.
  const inversions = (o) => {
    let n = 0, last = -Infinity;
    for (const it of items) {
      const ts = toTs(it, o);
      if (ts != null) { if (ts < last) n++; last = ts; }
    }
    return n;
  };
  return inversions("mdy") < inversions("dmy") ? "mdy" : "dmy";
}

function toTs({ d, h, mi, s, ap }, order) {
  let [y, mo, day] = order === "ymd" ? d : order === "dmy" ? [d[2], d[1], d[0]] : [d[2], d[0], d[1]];
  if (y < 100) y += 2000;
  let hour = h;
  if (ap) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (ap === "p" ? 12 : 0);
  }
  if (mo < 1 || mo > 12 || day < 1 || day > 31 || hour > 23 || mi > 59 || s > 59) return null;
  return Date.UTC(y, mo - 1, day, hour, mi, s);
}

export function parseWhatsApp(raw, filename = "") {
  const items = [];
  let cur = null;
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const clean = line.replace(ODD_SPACES, " ");
    const m = HEADER.exec(clean);
    if (m) {
      cur = { d: [+m[1], +m[2], +m[3]], h: +m[4], mi: +m[5], s: m[6] ? +m[6] : 0, ap: m[7]?.toLowerCase(), rest: m[8] };
      items.push(cur);
    } else if (cur) {
      cur.rest += "\n" + clean.replace(BIDI, "");
    }
  }
  if (items.length === 0) throw new Error("This doesn't look like a WhatsApp chat export. Export the chat \"Without media\" and upload the .txt or .zip file.");

  const order = pickDateOrder(items.map((i) => i.d), items);
  let title = titleFromFilename(filename);
  const messages = [];
  for (const it of items) {
    const ts = toTs(it, order);
    if (ts == null) continue;
    const sep = it.rest.indexOf(": ");
    if (sep < 1 || sep > 60) {
      // Android system notice, e.g. `Maya created group "Trip"`.
      const g = /created group [“"](.+)[”"]/.exec(it.rest.replace(BIDI, ""));
      if (g && !title) title = g[1];
      continue;
    }
    const author = it.rest.slice(0, sep).replace(BIDI, "").trim();
    let body = it.rest.slice(sep + 2);
    const marked = /^[‎‏]/.test(body); // iOS prefixes notices with a direction mark
    body = body.replace(BIDI, "").replace(EDITED, "").trim();
    if (!author || !body) continue;
    let kind = "text";
    if (MEDIA.test(body)) kind = "media";
    else if (DELETED.test(body)) kind = "deleted";
    else if (marked || ENCRYPTION.test(body)) continue;
    messages.push({ ts, author, text: kind === "text" ? body : "", kind });
  }
  return { title: title ?? "Your chat", platform: "whatsapp", messages };
}

export function parseTelegram(data) {
  let chat = data;
  if (Array.isArray(data?.chats?.list)) {
    // Full account export: wrap the busiest chat.
    chat = data.chats.list.reduce((a, b) => ((b?.messages?.length ?? 0) > (a?.messages?.length ?? 0) ? b : a), null);
  }
  if (!chat || !Array.isArray(chat.messages)) throw new Error("This JSON doesn't look like a Telegram chat export (result.json).");
  const messages = [];
  for (const m of chat.messages) {
    if (m?.type !== "message") continue;
    const ts = Date.parse(String(m.date).slice(0, 19) + "Z");
    if (!Number.isFinite(ts)) continue;
    const text = (typeof m.text === "string" ? m.text
      : Array.isArray(m.text) ? m.text.map((t) => (typeof t === "string" ? t : t?.text ?? "")).join("") : "").trim();
    const media = Boolean(m.photo || m.file || m.media_type || m.sticker_emoji);
    if (!text && !media) continue;
    messages.push({ ts, author: String(m.from ?? "Deleted Account").trim() || "Unknown", text, kind: text ? "text" : "media" });
  }
  return { title: chat.name || "Telegram chat", platform: "telegram", messages };
}

export function parseChat(text, filename = "") {
  const body = text.replace(/^﻿/, "");
  if (/^\s*\{/.test(body)) {
    let data;
    try { data = JSON.parse(body); } catch { throw new Error("That JSON file couldn't be read. Is it a complete Telegram export?"); }
    return parseTelegram(data);
  }
  return parseWhatsApp(body, filename);
}
