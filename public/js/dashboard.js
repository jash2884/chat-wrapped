// The "every stat" view shown after the story.
import { calendarGrid } from "./calendar.js";
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
function people(stats, you, actions) {
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
        h("dt", null, "Bestie"), h("dd", null, p.bestBuddy ? `${p.bestBuddy.name === you ? "you" : p.bestBuddy.name} (${f.int(p.bestBuddy.replies)} replies)` : "—")),
      h("button", { type: "button", class: "btn ghost small", onclick: () => actions.personCard(p.name) }, "Share their card"));
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

function age(a, b) {
  const days = Math.round((b - a) / 86_400_000);
  if (days < 60) return `${days} days`;
  const months = Math.round(days / 30.44);
  return months < 24 ? `${months} months` : `${Math.floor(months / 12)} years ${months % 12 ? `${months % 12} mo` : ""}`.trim();
}

function calendarPanel(s) {
  const cal = calendarGrid(s, { labels: true });
  return card("Every day, at a glance",
    h("div", { class: "cal-scroll" }, cal.el),
    h("p", { class: "muted" }, `${f.int(cal.active)} active days between ${f.date(cal.from)} and ${f.date(cal.to)}. Brighter means busier; hover a square for the count.`));
}

// "How many times did we say …?" The search runs in the worker that holds the chat.
function searchPanel(s, actions, you) {
  const out = h("div", { class: "search-out", "aria-live": "polite" });
  const input = h("input", { type: "search", placeholder: "Try: bro, pizza, 😂, love you", "aria-label": "Word or emoji to search for", maxlength: 60 });
  const name = (n) => (n === you ? "You" : n);
  const go = async (e) => {
    e?.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    out.replaceChildren(h("p", { class: "muted" }, "Searching…"));
    const r = await actions.search(q);
    if (!r || !r.total) { out.replaceChildren(h("p", { class: "muted" }, `Nobody said “${q}”. Not once.`)); return; }
    const max = r.people[0][1], monthMax = Math.max(...r.months.map(([, n]) => n));
    out.replaceChildren(
      h("p", { class: "search-total" }, h("b", null, f.int(r.total)), ` time${r.total === 1 ? "" : "s"} in ${f.int(r.messages)} message${r.messages === 1 ? "" : "s"}`),
      h("div", { class: "s-bars dash-bars" }, r.people.slice(0, 8).map(([n, c]) =>
        h("div", { class: "s-bar" }, h("span", { class: "s-bar-name" }, name(n)), h("span", { class: "s-bar-track" }, h("i", { style: `--w:${Math.max(3, (c / max) * 100)}%` })), h("b", null, f.int(c))))),
      r.months.length > 1 ? h("div", { class: "spark", role: "img", "aria-label": `Uses of ${q} per month` }, r.months.map(([m, n]) =>
        h("i", { style: `--h:${Math.max(4, (n / monthMax) * 100)}%`, title: `${f.monthLabel(m)} ${m.slice(0, 4)}: ${f.int(n)}` }))) : null,
      r.first ? h("p", { class: "muted" }, `First said by ${name(r.first.author)} on ${f.date(r.first.ts)}.`) : null);
  };
  return card("Search the chat",
    h("form", { class: "search-form", onsubmit: go }, input, h("button", { class: "btn primary small", type: "submit" }, "Search")),
    out,
    h("p", { class: "muted fine" }, "Searches run on your device."));
}

// "Guess who said it": ten real messages, pick the sender.
function quizPanel(s, actions, you) {
  const body = h("div", { class: "quiz" });
  const name = (n) => (n === you ? "You" : n);
  const intro = () => body.replaceChildren(
    h("p", null, "Ten real messages from this chat. Can you tell who sent each one?"),
    h("button", { class: "btn primary", type: "button", onclick: start }, "Start the quiz"));
  async function start() {
    body.replaceChildren(h("p", { class: "muted" }, "Picking messages…"));
    const questions = await actions.quiz();
    if (!questions?.length) { body.replaceChildren(h("p", { class: "muted" }, "Not enough messages to make a quiz.")); return; }
    let i = 0, score = 0;
    const ask = () => {
      const q = questions[i];
      const next = h("button", { class: "btn ghost small", type: "button", hidden: true, onclick: () => { i++; i < questions.length ? ask() : end(); } }, i === questions.length - 1 ? "See score" : "Next →");
      const options = q.options.map((o) => h("button", {
        type: "button", class: "quiz-option",
        onclick: (e) => {
          for (const b of options) { b.disabled = true; if (b.dataset.name === q.answer) b.classList.add("right"); }
          if (o === q.answer) score++; else e.currentTarget.classList.add("wrong");
          next.hidden = false;
          next.focus();
        },
        "data-name": o,
      }, name(o)));
      body.replaceChildren(
        h("p", { class: "muted" }, `Question ${i + 1} of ${questions.length} · score ${score}`),
        h("blockquote", null, `“${q.text}”`),
        h("p", { class: "muted fine" }, f.date(q.ts)),
        h("div", { class: "quiz-options" }, options),
        next);
    };
    const end = () => {
      actions.quizDone?.();
      const verdict = score >= 9 ? "You know this chat by heart. 🏆" : score >= 6 ? "Solid. You've been paying attention. 👀" : score >= 3 ? "Hmm, do you actually read the chat? 😅" : "Are you even in this group? 👻";
      body.replaceChildren(h("p", { class: "quiz-score" }, h("b", null, `${score}/${questions.length}`)), h("p", null, verdict),
        h("button", { class: "btn primary", type: "button", onclick: start }, "Play again"));
    };
    ask();
  }
  intro();
  return card("Guess who said it", body);
}

function habitsPanel(s, you) {
  return card("Group habits", s.quirks?.length
    ? h("div", { class: "awards" }, s.quirks.map((q) =>
      h("div", { class: "award" }, h("span", { class: "a-emoji" }, q.emoji), h("b", null, q.title), h("span", null, q.person === you ? "You" : q.person), h("small", null, q.detail))))
    : h("p", { class: "muted" }, "No standout habits yet."));
}

const MEDIA_LABELS = { photo: "📷 Photos", video: "🎬 Videos", voice: "🎙️ Voice notes", sticker: "🧸 Stickers", gif: "🎞️ GIFs", document: "📄 Documents", other: "📎 Media" };
function feedPanel(s) {
  const sites = s.sites ?? [], media = s.mediaTypes ?? [];
  return card("Your feed",
    sites.length ? h("ol", { class: "phrase-list" }, sites.map(([site, n]) => h("li", null, h("span", null, site), h("b", null, `${f.int(n)} link${n === 1 ? "" : "s"}`)))) : h("p", { class: "muted" }, "No links shared."),
    media.length ? h("ol", { class: "phrase-list media-list" }, media.map(([t, n]) => h("li", null, h("span", null, MEDIA_LABELS[t] ?? t), h("b", null, f.int(n))))) : null,
    media.length === 1 && media[0][0] === "other" ? h("p", { class: "muted fine" }, "Android exports don't say what kind of media was sent; iPhone exports do.") : null);
}

// Rows reply to columns: how often each person answers each other person.
function matrixPanel(s, you) {
  const { names, counts } = s.replyMatrix;
  const max = Math.max(1, ...counts.flat());
  const label = (n) => (n === you ? "You" : n.split(/\s+/)[0]);
  return card("Who replies to whom",
    h("div", { class: "table-wrap" }, h("table", { class: "matrix" },
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "↓ replies to →"), names.map((n) => h("th", { scope: "col", title: n }, label(n))))),
      h("tbody", null, names.map((a, i) => h("tr", null,
        h("th", { scope: "row", title: a }, label(a)),
        counts[i].map((n, j) => h("td", { style: i === j ? null : `--o:${(n / max).toFixed(2)}`, class: i === j ? "self" : null, title: i === j ? "" : `${a} → ${names[j]}: ${f.int(n)} replies` }, i === j ? "" : f.int(n)))))))),
    h("p", { class: "muted fine" }, `Brighter cells are stronger pairs.${s.people.length > 12 ? " Showing the 12 most active people." : ""}`));
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
        h("button", { class: "btn ghost", onclick: actions.exportCsv }, "Export CSV"),
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
    ...people(s, you, actions),
    h("div", { class: "grid-2" }, heatmap(s), timeline(s)),
    s.calendar?.length >= 7 ? calendarPanel(s) : null,
    h("div", { class: "grid-2" }, searchPanel(s, actions, you), quizPanel(s, actions, you)),
    h("div", { class: "grid-2" }, habitsPanel(s, you), feedPanel(s)),
    s.people.length > 2 ? matrixPanel(s, you) : null,
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
        s.marathon ? h("div", null, h("span", null, "Longest conversation"), h("b", null, `${f.int(s.marathon.messages)} messages`), h("small", null, `${f.date(s.marathon.start)} · ${f.duration(s.marathon.end - s.marathon.start)}`)) : null,
        h("div", null, h("span", null, "Chat age"), h("b", null, age(s.range.first, s.range.last)), h("small", null, `${f.pct(s.weekendShare)} of messages on weekends`)),
        s.longestMessage ? h("div", { class: "first" }, h("span", null, "The longest message"), h("b", null, `“${s.longestMessage.text}${s.longestMessage.text.length >= 280 ? "…" : ""}”`), h("small", null, `${s.longestMessage.author === you ? "You" : s.longestMessage.author}, ${f.int(s.longestMessage.words)} words, ${f.date(s.longestMessage.ts)}`)) : null,
        h("div", { class: "first" }, h("span", null, "Where it all began"), h("b", null, `“${s.firstMessage.text}”`), h("small", null, `${s.firstMessage.author}, ${f.date(s.firstMessage.ts)}`)))),
  );
  el.hidden = false;
}
