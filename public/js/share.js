// Renders the 1080×1350 summary card that people save or post.
import * as f from "./format.js";

const W = 1080, H = 1350;
const DISPLAY = "'Bricolage Grotesque', 'Inter', system-ui, sans-serif";
const BODY = "'Inter', system-ui, sans-serif";

function fit(ctx, text, maxWidth, size, weight, family) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${family}`; s -= 2; } while (ctx.measureText(text).width > maxWidth && s > 20);
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

export async function renderCard(stats, aiState) {
  await Promise.all([
    document.fonts.load(`800 80px 'Bricolage Grotesque'`),
    document.fonts.load(`600 30px 'Inter'`),
  ]).catch(() => {});
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#ff4fa3");
  bg.addColorStop(0.5, "#6a2cf0");
  bg.addColorStop(1, "#14102a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // Soft glow blobs.
  for (const [x, y, r, c] of [[900, 180, 340, "rgba(255,197,61,.45)"], [120, 1150, 420, "rgba(31,196,255,.35)"]]) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  const year = new Date(stats.range.last).getUTCFullYear();
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = `700 30px ${BODY}`;
  ctx.fillText(`CHAT WRAPPED · ${year}`, 80, 120);
  ctx.fillStyle = "#fff";
  ctx.fillText(fit(ctx, stats.title, W - 160, 86, 800, DISPLAY), 80, 220);
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.font = `500 30px ${BODY}`;
  ctx.fillText(`${f.range(stats.range.first, stats.range.last)} · ${stats.people.length} people`, 80, 275);

  const ai = aiState?.status === "ready" ? aiState.data : null;
  const top = stats.people[0];
  const tiles = [
    ["Messages", f.int(stats.totals.messages)],
    ["Top talker", top.name.split(/\s+/)[0]],
    ["Prime time", f.hour(stats.peakHour)],
    ["Top emoji", stats.topEmojis[0]?.[0] ?? "—"],
    ["Longest streak", `${stats.streak.days} days`],
    ["Busiest day", f.date(Date.parse(stats.busiestDay.date), false)],
  ];
  const tw = (W - 160 - 30) / 2, th = 190;
  tiles.forEach(([label, value], i) => {
    const x = 80 + (i % 2) * (tw + 30), y = 340 + Math.floor(i / 2) * (th + 30);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    roundRect(ctx, x, y, tw, th, 32);
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.font = `600 28px ${BODY}`;
    ctx.fillText(label.toUpperCase(), x + 36, y + 62);
    ctx.fillStyle = "#fff";
    ctx.fillText(fit(ctx, value, tw - 72, 72, 800, DISPLAY), x + 36, y + 148);
  });

  const vibeY = 340 + 3 * (th + 30) + 10;
  ctx.fillStyle = "rgba(10,6,24,.45)";
  roundRect(ctx, 80, vibeY, W - 160, 200, 32);
  ctx.fillStyle = "rgba(255,255,255,.75)";
  ctx.font = `600 28px ${BODY}`;
  ctx.fillText(ai ? "THE AI'S VERDICT" : "CHAT PERSONALITY", 116, vibeY + 62);
  ctx.fillStyle = "#fff";
  const vibe = ai ? `“${ai.vibe}”` : `${stats.chronotype.emoji} ${stats.chronotype.label}`;
  ctx.fillText(fit(ctx, vibe, W - 232, 62, 800, DISPLAY), 116, vibeY + 146);

  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.font = `600 28px ${BODY}`;
  ctx.fillText("wrapped.jashparmar.com", 80, H - 70);
  ctx.textAlign = "right";
  ctx.fillText("made on-device 🔒", W - 80, H - 70);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

const SITE = "https://wrapped.jashparmar.com";
const cardFile = (blob, title) =>
  new File([blob], `${title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "chat"}-wrapped.png`, { type: "image/png" });

// Only totals go in the caption, never names or message text.
export function groupCaption(stats) {
  const who = stats.isGroup ? "Our group chat" : "Our chat";
  return `${who}, wrapped 🎁 ${f.int(stats.totals.messages)} messages, peak hour ${f.hour(stats.peakHour)}, top emoji ${stats.topEmojis[0]?.[0] ?? "💬"}. Make yours in 30 seconds (it never leaves your phone): ${SITE}`;
}

// Opens the share sheet with the card and a caption so it can go straight into the
// WhatsApp group. Where files can't be shared (most desktops), it saves the card
// and opens WhatsApp with the caption instead.
export async function sendToGroup(blob, stats) {
  const file = cardFile(blob, stats.title), text = groupCaption(stats);
  if (navigator.canShare?.({ files: [file], text })) {
    try {
      await navigator.share({ files: [file], text });
      return "shared";
    } catch (e) {
      if (e.name === "AbortError") return "cancelled";
    }
  }
  download(file);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  return "whatsapp-link";
}

function download(file) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function shareCard(blob, title) {
  const file = cardFile(blob, title);
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "My chat, wrapped" });
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }
  download(file);
}
