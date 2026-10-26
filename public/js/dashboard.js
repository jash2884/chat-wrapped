// The "every stat" view shown after the story.
import { h } from "./dom.js";
import * as f from "./format.js";

const card = (title, ...body) => h("section", { class: "panel" }, h("h3", null, title), ...body);
const tile = (label, value, note) => h("div", { class: "tile" }, h("span", null, label), h("b", null, value), note ? h("small", null, note) : null);

function aiPanel(ai) {
  const panel = h("section", { class: "panel ai-panel" });
  const render = (st) => {
    if (st.status === "off") { panel.hidden = true; return; }
    if (st.status === "loading") {
      panel.replaceChildren(h("h3", null, "The AI's verdict"), h("div", { class: "s-shimmer" }, h("i"), h("i")));
    } else if (st.status === "error") {
      panel.replaceChildren(h("h3", null, "The AI's verdict"), h("p", { class: "muted" }, st.error));
    } else {
      const d = st.data;
      panel.replaceChildren(
        h("h3", null, "The AI's verdict"),
        h("p", { class: "vibe" }, `“${d.vibe}”`),
        h("p", null, d.summary),
        h("div", { class: "personas" }, d.personas.map((p) =>
          h("div", null, h("b", null, p.name), h("em", null, p.title), h("span", null, p.line)))),
        h("p", { class: "muted" }, `🔮 ${d.prediction}`));
    }
  };
  render(ai.get());
  ai.subscribe(render);
  return panel;
}

// Every person gets a row and a card, however big the group; a search box
// narrows the cards down in large groups.
function people(stats, you) {
  const max = stats.people[0].messages;
  const shownName = (p) => (p.name === you ? `${p.name} (you)` : p.name);
  const rows = stats.people.map((p) => h("tr", { class: p.name === you ? "is-you" : null },
    h("th", { scope: "row" }, h("span", { class: "who" }, `#${p.rank} ${shownName(p)}`),
      h("span", { class: "meter" }, h("i", { style: `--w:${(p.messages / max) * 100}%` }))),
    h("td", null, f.int(p.messages), h("small", null, f.pct(p.share))),
    h("td", null, p.avgWords.toFixed(1)),
    h("td", null, p.medianReply == null ? "—" : f.duration(p.medianReply)),
    h("td", null, f.pct(p.startShare)),
    h("td", null, f.pct(p.nightShare)),
    h("td", null, p.topEmoji ?? "—"),
    h("td", null, f.int(p.media))));

  const cards = stats.people.map((p) => {
    const el = h("article", { class: `pcard${p.name === you ? " is-you" : ""}`, "data-name": p.name.toLowerCase() },
      h("header", null, h("b", null, shownName(p)), h("span", { class: "muted" }, `#${p.rank}`)),
      h("span", { class: "sig" }, `${p.signature.emoji} ${p.signature.title}`),
      h("span", { class: "muted" }, p.signature.detail),
      h("dl", null,
        h("dt", null, "Messages"), h("dd", null, `${f.int(p.messages)} (${f.pct(p.share)})`),
        h("dt", null, "Most active"), h("dd", null, f.hour(p.peakHour)),
        h("dt", null, "Reply time"), h("dd", null, p.medianReply == null ? "—" : f.duration(p.medianReply)),
        h("dt", null, "Starts chats"), h("dd", null, f.pct(p.startShare)),
        h("dt", null, "Top emoji"), h("dd", null, p.topEmoji ?? "—"),
        h("dt", null, "Top words"), h("dd", null, p.topWords.length ? p.topWords.slice(0, 3).map(([w]) => w).join(", ") : "—"),
        h("dt", null, "Bestie"), h("dd", null, p.bestBuddy ? `${p.bestBuddy.name === you ? "you" : p.bestBuddy.name} (${f.int(p.bestBuddy.replies)} replies)` : "—")));
    return el;
  });
  const grid = h("div", { class: "people-cards" }, cards);
  const search = stats.people.length > 8 ? h("input", {
    type: "search", placeholder: `Search ${stats.people.length} people…`, "aria-label": "Search people",
    oninput: (e) => {
      const q = e.target.value.trim().toLowerCase();
      for (const c of cards) c.hidden = q && !c.dataset.name.includes(q);
    },
  }) : null;

  return [
    card(`Everyone (${stats.people.length})`, search ? h("div", { class: "people-tools" }, search) : null, grid),
    card("Leaderboard",
      h("div", { class: "table-wrap tall" }, h("table", null,
        h("thead", null, h("tr", null, ["Person", "Messages", "Words / msg", "Reply time", "Starts chats", "After midnight", "Emoji", "Media"].map((t) => h("th", { scope: "col" }, t)))),
        h("tbody", null, rows)))),
  ];
}

function heatmap(stats) {
  const max = Math.max(...stats.heat.flat()) || 1;
  const grid = h("div", { class: "heatmap", role: "img", "aria-label": `Messages by weekday and hour. Busiest hour ${f.hour(stats.peakHour)}, busiest day ${f.WEEKDAYS[stats.peakWeekday]}.` },
    h("span"), Array.from({ length: 24 }, (_, hr) => h("span", { class: "hx" }, hr % 6 === 0 ? f.hour(hr).replace(" ", "") : "")),
    stats.heat.map((row, d) => [
      h("span", { class: "hy" }, f.WEEKDAYS[d].slice(0, 3)),
      row.map((v, hr) => h("i", { style: `--o:${(0.06 + 0.94 * (v / max)).toFixed(2)}`, title: `${f.WEEKDAYS[d]} ${f.hour(hr)}: ${f.int(v)} messages` })),
    ]));
  return card("When you talk", grid,
    h("p", { class: "muted" }, `${stats.chronotype.emoji} ${stats.chronotype.label}. Peak hour ${f.hour(stats.peakHour)}, busiest on ${f.WEEKDAYS[stats.peakWeekday]}s.`));
}

function timeline(stats) {
  const max = Math.max(...stats.timeline.map((m) => m.count)) || 1;
  const many = stats.timeline.length > 18;
  return card("Month by month",
    h("div", { class: "timeline", role: "img", "aria-label": "Messages per month" }, stats.timeline.map((m, i) =>
      h("div", { class: "tl-col", title: `${f.monthLabel(m.month)} ${m.month.slice(0, 4)}: ${f.int(m.count)} messages` },
        h("i", { style: `--h:${Math.max(2, (m.count / max) * 100)}%` }),
        h("span", null, !many || i % 3 === 0 ? f.monthLabel(m.month) : "")))));
}

export function renderDashboard(el, stats, ai, actions, { years = [], period = "all", you = null } = {}) {
  const s = stats;
  el.replaceChildren(
    h("div", { class: "dash-head" },
      h("div", null,
        h("p", { class: "eyebrow" }, `${s.platform === "telegram" ? "Telegram" : "WhatsApp"} · ${f.range(s.range.first, s.range.last)}`),
        h("h2", null, s.title),
        years.length > 1 ? h("div", { class: "period", role: "group", "aria-label": "Period" },
          [...years.map(String), "all"].map((y) => h("button", {
            type: "button", class: "chip", "aria-pressed": String(y === period),
            onclick: () => actions.setPeriod(y),
          }, y === "all" ? "All time" : `${y}`))) : null),
      h("div", { class: "dash-actions" },
        h("button", { class: "btn primary", onclick: actions.replay }, "▶ Replay story"),
        h("button", { class: "btn ghost", onclick: actions.sendToGroup }, "💬 Send to group"),
        h("button", { class: "btn ghost", onclick: actions.share }, "Save card"),
        h("button", { class: "btn ghost", onclick: actions.reset }, "New chat"))),
    h("div", { class: "tiles" },
      tile("Messages", f.int(s.totals.messages), s.previous
        ? `${s.totals.messages >= s.previous.messages ? "+" : "−"}${f.pct(Math.abs(s.totals.messages - s.previous.messages) / s.previous.messages)} vs ${s.previous.year}`
        : `${s.totals.perDay.toFixed(1)} per day`),
      tile("Words", f.int(s.totals.words), s.totals.novels >= 1 ? `${s.totals.novels.toFixed(1)} novels` : `${f.int(s.totals.words / 250)} book pages`),
      tile("Active days", f.int(s.totals.activeDays), `of ${f.int(s.totals.days)}`),
      tile("Conversations", f.int(s.totals.conversations)),
      tile("Longest streak", `${s.streak.days} days`),
      tile("Media shared", f.int(s.totals.media), s.totals.deleted ? `${f.int(s.totals.deleted)} deleted messages` : null)),
    aiPanel(ai),
    ...people(s, you),
    h("div", { class: "grid-2" }, heatmap(s), timeline(s)),
    h("div", { class: "grid-2" },
      card("Top words", s.topWords.length
        ? h("div", { class: "cloud" }, s.topWords.slice(0, 30).map(([w, c]) => h("span", { title: `${f.int(c)} times`, style: `--s:${(0.8 + 1.1 * (c / s.topWords[0][1])).toFixed(2)}` }, w)))
        : h("p", { class: "muted" }, "Not enough text to rank words.")),
      card("Top emojis", s.topEmojis.length
        ? h("ol", { class: "emoji-list" }, s.topEmojis.slice(0, 10).map(([e, c]) => h("li", null, h("span", null, e), h("b", null, f.int(c)))))
        : h("p", { class: "muted" }, "No emojis. A serious chat."))),
    h("div", { class: "grid-2" },
      card("Catchphrases", s.phrases?.length
        ? h("ol", { class: "phrase-list" }, s.phrases.map(([g, n]) => h("li", null, h("span", null, `“${g}”`), h("b", null, f.int(n)))))
        : h("p", { class: "muted" }, "No phrase came up 3 or more times.")),
      card("Dynamic duos", s.duos?.length && s.people.length > 2
        ? h("ol", { class: "duo-list" }, s.duos.map((d) => h("li", null, h("span", null, d.people.map((n) => (n === you ? "You" : n)).join(" & ")), h("b", null, `${f.int(d.replies)} replies`))))
        : h("p", { class: "muted" }, s.people.length > 2 ? "Not enough back-and-forth yet." : "It's just the two of you."))),
    s.awards.length ? card("Awards", h("div", { class: "awards" }, s.awards.map((a) =>
      h("div", { class: "award" }, h("span", { class: "a-emoji" }, a.emoji), h("b", null, a.title), h("span", null, a.person), h("small", null, a.detail))))) : null,
    card("Moments",
      h("div", { class: "moments" },
        h("div", null, h("span", null, "Biggest day"), h("b", null, f.date(Date.parse(s.busiestDay.date))), h("small", null, `${f.int(s.busiestDay.count)} messages`)),
        h("div", null, h("span", null, "Longest streak"), h("b", null, `${s.streak.days} days`), h("small", null, f.range(Date.parse(s.streak.from), Date.parse(s.streak.to)))),
        h("div", null, h("span", null, "Longest silence"), h("b", null, s.silence ? `${s.silence.days} days` : "None"), h("small", null, s.silence ? f.range(Date.parse(s.silence.from), Date.parse(s.silence.to)) : "Not a single quiet day")),
        h("div", { class: "first" }, h("span", null, "Where it all began"), h("b", null, `“${s.firstMessage.text}”`), h("small", null, `${s.firstMessage.author}, ${f.date(s.firstMessage.ts)}`)))),
  );
  el.hidden = false;
}
