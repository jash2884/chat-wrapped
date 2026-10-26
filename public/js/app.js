import { createInsights } from "./ai.js";
import { renderDashboard } from "./dashboard.js";
import { renderCard, shareCard } from "./share.js";
import { buildSlides, playStory } from "./story.js";

const $ = (id) => document.getElementById(id);
const landing = $("landing"), dashboard = $("dashboard"), drop = $("drop"), fileInput = $("file");
const statusEl = $("status"), statusText = $("status-text"), errorEl = $("error");

let session = null; // { stats, ai, card: Promise<Blob> | null }
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
  share: async () => shareCard(await cardBlob(), session.stats.title),
  dashboard: () => { story?.close(); },
  replay: () => { story?.close(); startStory(); },
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
  story = playStory(buildSlides(session.stats, session.ai, actions), {
    onClose: () => {
      story = null;
      dashboard.scrollIntoView({ block: "start" });
    },
  });
}

function run(message) {
  if (busy) return;
  showError("");
  setBusy(true, "Starting…");
  const worker = new Worker(new URL("./analyze.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }) => {
    if (data.type === "progress") { statusText.textContent = data.step; return; }
    worker.terminate();
    setBusy(false);
    if (data.type === "error") { showError(data.error); return; }
    const stats = data.stats;
    const ai = createInsights(stats, { enabled: $("ai").checked, includeWords: $("words").checked });
    session = { stats, ai, card: null };
    document.body.classList.add("has-results");
    renderDashboard(dashboard, stats, ai, actions);
    startStory();
  };
  worker.onerror = () => {
    worker.terminate();
    setBusy(false);
    showError("Something went wrong while reading that file. Try exporting the chat again.");
  };
  worker.postMessage(message);
}

function takeFile(file) {
  if (!file) return;
  if (!/\.(txt|zip|json)$/i.test(file.name)) {
    showError("Upload the .txt or .zip from WhatsApp, or result.json from Telegram.");
    return;
  }
  run({ file });
}

$("browse").addEventListener("click", () => fileInput.click());
$("demo").addEventListener("click", () => run({ demo: true }));
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
