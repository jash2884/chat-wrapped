import { createInsights } from "./ai.js";
import { renderDashboard } from "./dashboard.js";
import { renderCard, sendToGroup, shareCard } from "./share.js";
import { askSetup } from "./setup.js";
import { buildSlides, playStory } from "./story.js";
import { track } from "./track.js";

const $ = (id) => document.getElementById(id);
const landing = $("landing"), dashboard = $("dashboard"), drop = $("drop"), fileInput = $("file");
const statusEl = $("status"), statusText = $("status-text"), errorEl = $("error");

let session = null; // { result, stats, you, period, ai, card: Promise<Blob> | null }
let busy = false;

function setBusy(on, text = "") {
  busy = on;
  drop.classList.toggle("is-busy", on);
  statusEl.hidden = !on;
  statusText.textContent = text;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function cardBlob() {
  // Re-render once the AI answers so the card carries its verdict.
  if (!session.card || (session.cardAi !== session.ai.get().status)) {
    session.cardAi = session.ai.get().status;
    session.card = renderCard(session.stats, session.ai.get());
  }
  return session.card;
}

const actions = {
  cardUrl: async () => URL.createObjectURL(await cardBlob()),
  share: async () => { track("save_image"); return shareCard(await cardBlob(), session.stats.title); },
  sendToGroup: async () => { track("share_group"); return sendToGroup(await cardBlob(), session.stats); },
  reachedEnd: () => { if (!session.ended) { session.ended = true; track("story_end"); } },
  dashboard: () => { track("dashboard"); story?.close(); },
  replay: () => { story?.close(); startStory(); },
  setPeriod: (period) => { applySelection({ period, you: session.you }); },
  reset: () => {
    session = null;
    dashboard.hidden = true;
    dashboard.replaceChildren();
    document.body.classList.remove("has-results");
    landing.scrollIntoView();
    drop.focus();
  },
};

let story = null;
function startStory() {
  story = playStory(buildSlides(session.stats, session.ai, actions, { you: session.you }), {
    onClose: () => {
      story = null;
      dashboard.scrollIntoView({ block: "start" });
    },
  });
}

// Picks the period (a year or all time) and who "you" are, then (re)builds the
// AI request and the dashboard for that view.
function applySelection({ period, you }) {
  const { result } = session;
  const stats = period !== "all" && result.byYear[period] ? result.byYear[period] : result.all;
  const ai = createInsights(stats, { enabled: $("ai").checked, includeWords: $("words").checked, you });
  Object.assign(session, { stats, ai, you, period: stats === result.all ? "all" : period, card: null, cardAi: null, ended: false });
  document.body.classList.add("has-results");
  renderDashboard(dashboard, stats, ai, actions, { years: result.years, period: session.period, you });
}

function run(message) {
  if (busy) return;
  showError("");
  setBusy(true, "Starting…");
  const worker = new Worker(new URL("./analyze.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = async ({ data }) => {
    if (data.type === "progress") { statusText.textContent = data.step; return; }
    worker.terminate();
    setBusy(false);
    if (data.type === "error") { track("parse_error"); showError(data.error); return; }
    const result = data.result;
    track(`wrapped_${result.all.platform}`);
    const needsSetup = result.all.people.length > 1 || result.years.length > 1;
    const choice = needsSetup ? await askSetup(result) : { you: null, period: "all" };
    session = { result };
    applySelection(choice);
    startStory();
  };
  worker.onerror = () => {
    worker.terminate();
    setBusy(false);
    showError("Something went wrong while reading that file. Try exporting the chat again.");
  };
  worker.postMessage(message);
}

function takeFile(file, { fromShare = false } = {}) {
  if (!file) return;
  // Share-sheet files sometimes arrive with generic names; the parser decides instead.
  if (!fromShare && !/\.(txt|zip|json)$/i.test(file.name)) {
    showError("Upload the .txt or .zip from WhatsApp, or result.json from Telegram.");
    return;
  }
  track(fromShare ? "share_received" : "upload");
  run({ file });
}

$("browse").addEventListener("click", () => fileInput.click());
$("demo").addEventListener("click", () => { if (!busy) track("demo"); run({ demo: true }); });
fileInput.addEventListener("change", () => { takeFile(fileInput.files[0]); fileInput.value = ""; });
drop.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target === drop) { e.preventDefault(); fileInput.click(); }
});
for (const type of ["dragenter", "dragover"]) {
  drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add("is-over"); });
}
for (const type of ["dragleave", "drop"]) {
  drop.addEventListener(type, () => drop.classList.remove("is-over"));
}
drop.addEventListener("drop", (e) => { e.preventDefault(); takeFile(e.dataTransfer.files[0]); });
// Dropping a file anywhere else shouldn't navigate away from the page.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

// Export instructions tabs.
for (const tab of document.querySelectorAll("[data-tab]")) {
  tab.addEventListener("click", () => {
    for (const t of document.querySelectorAll("[data-tab]")) t.setAttribute("aria-selected", String(t === tab));
    for (const p of document.querySelectorAll("[data-panel]")) p.hidden = p.dataset.panel !== tab.dataset.tab;
  });
}

// --- Installable app, share sheet and iPhone Shortcut ---------------------------

const notice = $("notice");
function showNotice(text) {
  notice.textContent = text;
  notice.hidden = !text;
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// Android: the chat was shared from WhatsApp straight into the installed app.
// The service worker parked it in Cache Storage on this device; pick it up once.
async function openSharedChat() {
  const params = new URLSearchParams(location.search);
  const shared = params.get("shared"), from = params.get("from");
  if (shared || from) history.replaceState(null, "", "/");
  if (from === "shortcut") {
    showNotice("Your chat export is saved in Files → Shortcuts → Chat Wrapped. Tap “Choose file” and pick it.");
    drop.scrollIntoView({ block: "center" });
    return;
  }
  if (!shared) return;
  if (shared !== "1") {
    showError(shared === "empty" ? "Nothing was shared. In WhatsApp, export the chat “Without media” and pick Chat Wrapped." : "Couldn't receive that share. Try choosing the file here instead.");
    return;
  }
  try {
    const cache = await caches.open("shared-chat");
    const res = await cache.match("/shared/latest");
    await cache.delete("/shared/latest");
    if (!res) { showError("That shared chat has already been opened. Share it again from WhatsApp."); return; }
    const name = decodeURIComponent(res.headers.get("X-Filename") ?? "chat.txt");
    takeFile(new File([await res.blob()], name, { type: res.headers.get("Content-Type") ?? "" }), { fromShare: true });
  } catch {
    showError("Couldn't open the shared chat. Try choosing the file here instead.");
  }
}
openSharedChat();

// Offer an install button where the browser supports it (Chrome/Edge on Android and desktop).
let installPrompt = null;
const installBtn = $("install");
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  installBtn.hidden = true;
});
window.addEventListener("appinstalled", () => {
  track("install");
  installBtn.hidden = true;
  showNotice("Installed! Next time, export a chat in WhatsApp and pick Chat Wrapped from the share menu.");
});

// The iPhone Shortcut link is published from a device; it appears once it's set in the page.
const shortcutLink = $("shortcut-link");
if (shortcutLink?.dataset.url) {
  shortcutLink.href = shortcutLink.dataset.url;
  shortcutLink.hidden = false;
}
