// The Wrapped-style story: full-screen slides with auto-advance, tap and keyboard navigation.
import { countUp, h, reducedMotion, stagger } from "./dom.js";
import * as f from "./format.js";

const DURATION = 7000;
const firstName = (n) => n.split(/\s+/)[0];

// [from, to, ink]
const THEMES = {
  intro: ["#ff4fa3", "#6a2cf0", "light"],
  total: ["#d4ff3a", "#18b36b", "dark"],
  people: ["#ffc53d", "#ff5e1a", "dark"],
  time: ["#3d7bff", "#7a2cf0", "light"],
  busiest: ["#ff1f7a", "#ffb020", "light"],
  streak: ["#3df2c0", "#1279b8", "dark"],
  words: ["#fff04d", "#ff5cb8", "dark"],
  emoji: ["#a35cff", "#1fc4ff", "light"],
  speed: ["#ff4d6d", "#ffd166", "dark"],
  starter: ["#5ff5de", "#4b5cf0", "dark"],
  awards: ["#ff6a1a", "#e8125c", "light"],
  ai: ["#2a0a5e", "#c4185c", "light"],
  outro: ["#17112b", "#3a1f6b", "light"],
};

const big = (value, decimals = 0) => h("span", { "data-count": value, "data-decimals": decimals }, "0");

function bars(rows, max) {
  return h("div", { class: "s-bars" }, rows.map((r) =>
    h("div", { class: "s-bar" },
      h("span", { class: "s-bar-name" }, r.label),
      h("span", { class: "s-bar-track" }, h("i", { style: `--w:${Math.max(3, (r.value / max) * 100)}%` })),
      h("b", null, r.text))));
}

function heatGrid(heat) {
  const max = Math.max(...heat.flat()) || 1;
  return h("div", { class: "s-heat", "aria-hidden": "true" },
    heat.flatMap((row) => row.map((v) => h("i", { style: `--o:${(0.12 + 0.88 * (v / max)).toFixed(2)}` }))));
}

export function buildSlides(stats, ai, actions) {
  const s = stats, people = s.people;
  const slides = [];
  const add = (id, make) => slides.push({ id, theme: THEMES[id], make });

  add("intro", () => h("div", { class: "s-center" },
    h("p", { class: "s-eyebrow" }, `${s.platform === "telegram" ? "Telegram" : "WhatsApp"} · Wrapped`),
    h("h2", { class: "s-title xl" }, s.title),
    h("p", { class: "s-sub" }, `${f.range(s.range.first, s.range.last)}`),
    h("p", { class: "s-sub" }, `${people.length} ${people.length === 1 ? "person" : "people"} · ${f.int(s.totals.days)} days`),
    h("p", { class: "s-hint" }, "Tap to start →")));

  const pages = Math.round(s.totals.words / 250);
  add("total", () => h("div", null,
    h("p", { class: "s-eyebrow" }, "Together you sent"),
    h("p", { class: "s-big" }, big(s.totals.messages)),
    h("p", { class: "s-title" }, "messages"),
    h("p", { class: "s-sub" }, `That's ${s.totals.perDay.toFixed(1)} a day, with chats on ${f.int(s.totals.activeDays)} of ${f.int(s.totals.days)} days.`),
    h("p", { class: "s-note" }, s.totals.novels >= 1
      ? `${f.int(s.totals.words)} words: about ${s.totals.novels.toFixed(1)} novels' worth.`
      : `${f.int(s.totals.words)} words: about ${f.int(Math.max(1, pages))} pages of a book.`)));

  add("people", () => {
    if (!s.isGroup && people.length === 2) {
      const [a, b] = people;
      return h("div", null,
        h("p", { class: "s-eyebrow" }, "Who carried the conversation?"),
        h("h2", { class: "s-title" }, a.share > 0.55 ? `${firstName(a.name)} did the heavy lifting.` : "Pretty evenly matched."),
        h("div", { class: "s-split" },
          h("i", { style: `--w:${(a.share * 100).toFixed(1)}%` })),
        h("div", { class: "s-split-legend" },
          h("span", null, h("b", null, f.pct(a.share)), ` ${a.name}`),
          h("span", null, `${b.name} `, h("b", null, f.pct(b.share)))),
        h("p", { class: "s-note" }, `${f.int(a.messages)} vs ${f.int(b.messages)} messages.`));
    }
    const shown = people.slice(0, 6);
    return h("div", null,
      h("p", { class: "s-eyebrow" }, "The loudest voices"),
      h("h2", { class: "s-title" }, `${firstName(people[0].name)} never stopped typing.`),
      bars(shown.map((p) => ({ label: p.name, value: p.messages, text: f.pct(p.share) })), shown[0].messages),
      people.length > 6 ? h("p", { class: "s-note" }, `+ ${people.length - 6} more people`) : null);
  });

  add("time", () => h("div", null,
    h("p", { class: "s-eyebrow" }, "Your prime time"),
    h("p", { class: "s-big" }, f.hour(s.peakHour)),
    h("h2", { class: "s-title" }, `${s.chronotype.emoji} ${s.chronotype.label}`),
    h("p", { class: "s-sub" }, s.chronotype.line),
    heatGrid(s.heat),
    h("p", { class: "s-note" }, `${f.WEEKDAYS[s.peakWeekday]}s were the busiest.`)));

  add("busiest", () => h("div", null,
    h("p", { class: "s-eyebrow" }, "Your biggest day"),
    h("p", { class: "s-big md" }, f.date(Date.parse(s.busiestDay.date))),
    h("p", { class: "s-title" }, h("span", null, big(s.busiestDay.count)), " messages in one day."),
    h("p", { class: "s-sub" }, "Whatever happened that day, you all had a lot to say about it.")));

  add("streak", () => h("div", null,
    h("p", { class: "s-eyebrow" }, "Longest streak"),
    h("p", { class: "s-big" }, big(s.streak.days)),
    h("p", { class: "s-title" }, `day${s.streak.days === 1 ? "" : "s"} in a row`),
    h("p", { class: "s-sub" }, f.range(Date.parse(s.streak.from), Date.parse(s.streak.to))),
    s.silence
      ? h("p", { class: "s-note" }, `Longest silence: ${s.silence.days} day${s.silence.days === 1 ? "" : "s"} (${f.range(Date.parse(s.silence.from), Date.parse(s.silence.to))}).`)
      : h("p", { class: "s-note" }, "You never went a full day without talking.")));

  if (s.topWords.length >= 5) {
    add("words", () => {
      const words = s.topWords.slice(0, 14), max = words[0][1];
      return h("div", null,
        h("p", { class: "s-eyebrow" }, "Your vocabulary"),
        h("h2", { class: "s-title" }, `You said “${words[0][0]}” ${f.int(words[0][1])} times.`),
        h("div", { class: "s-words" }, words.map(([w, c]) =>
          h("span", { style: `--s:${(0.85 + 1.4 * (c / max)).toFixed(2)}` }, w))));
    });
  }

  if (s.topEmojis.length >= 3) {
    add("emoji", () => h("div", { class: "s-center" },
      h("p", { class: "s-eyebrow" }, "Your emoji language"),
      h("p", { class: "s-emoji-hero" }, s.topEmojis[0][0]),
      h("p", { class: "s-title" }, `sent ${f.int(s.topEmojis[0][1])} times`),
      h("div", { class: "s-emoji-row" }, s.topEmojis.slice(1, 6).map(([e, c]) =>
        h("span", null, h("i", null, e), h("small", null, f.int(c)))))));
  }

  const repliers = people.filter((p) => p.medianReply != null).slice(0, 6).sort((a, b) => a.medianReply - b.medianReply);
  if (repliers.length >= 2) {
    const fast = repliers[0], slow = repliers.at(-1), max = slow.medianReply;
    add("speed", () => h("div", null,
      h("p", { class: "s-eyebrow" }, "Reply speed"),
      h("h2", { class: "s-title" }, `⚡ ${firstName(fast.name)} replies in ${f.duration(fast.medianReply)}.`),
      h("p", { class: "s-sub" }, `🐢 ${firstName(slow.name)} takes ${f.duration(slow.medianReply)}. Typically.`),
      bars(repliers.map((p) => ({ label: p.name, value: p.medianReply, text: f.duration(p.medianReply) })), max),
      h("p", { class: "s-note" }, "Median time to answer someone else's message.")));
  }

  if (people.length >= 2) {
    const starters = [...people].slice(0, 6).sort((a, b) => b.startShare - a.startShare);
    add("starter", () => h("div", null,
      h("p", { class: "s-eyebrow" }, "Who texts first?"),
      h("h2", { class: "s-title" }, `${firstName(starters[0].name)} breaks the silence ${f.pct(starters[0].startShare)} of the time.`),
      bars(starters.map((p) => ({ label: p.name, value: p.startShare, text: f.pct(p.startShare) })), starters[0].startShare),
      h("p", { class: "s-note" }, `Across ${f.int(s.totals.conversations)} conversations (6+ hours of quiet starts a new one).`)));
  }

  if (s.awards.length) {
    add("awards", () => h("div", null,
      h("p", { class: "s-eyebrow" }, "And the awards go to…"),
      stagger(h("div", { class: "s-awards" }, s.awards.slice(0, 8).map((a) =>
        h("div", { class: "s-award" },
          h("span", { class: "s-award-emoji" }, a.emoji),
          h("b", null, a.title),
          h("span", null, a.person),
          h("small", null, a.detail)))))));
  }

  if (ai.get().status !== "off") {
    add("ai", () => {
      const body = h("div", { class: "s-ai" });
      const render = (st) => {
        if (st.status === "loading") {
          body.replaceChildren(h("p", { class: "s-eyebrow" }, "The AI's verdict"),
            h("div", { class: "s-shimmer" }, h("i"), h("i"), h("i")),
            h("p", { class: "s-note" }, "Reading the numbers (never your messages)…"));
        } else if (st.status === "error") {
          body.replaceChildren(h("p", { class: "s-eyebrow" }, "The AI's verdict"),
            h("h2", { class: "s-title" }, "The AI is speechless."),
            h("p", { class: "s-sub" }, st.error));
        } else {
          const d = st.data;
          body.replaceChildren(
            h("p", { class: "s-eyebrow" }, "The AI's verdict"),
            h("h2", { class: "s-title xl quote" }, d.vibe),
            h("p", { class: "s-sub" }, d.summary),
            stagger(h("div", { class: "s-personas" }, d.personas.slice(0, 4).map((p) =>
              h("div", null, h("b", null, `${p.name}: ${p.title}`), h("span", null, p.line))))),
            h("p", { class: "s-note" }, `🔮 ${d.prediction}`));
        }
      };
      render(ai.get());
      body.cleanup = ai.subscribe(render);
      return body;
    });
  }

  add("outro", () => {
    const img = h("img", { class: "s-card-img", alt: "Summary card for this chat" });
    actions.cardUrl().then((url) => { img.src = url; });
    return h("div", { class: "s-center" },
      h("p", { class: "s-eyebrow" }, "That's a wrap"),
      img,
      h("div", { class: "s-actions" },
        h("button", { class: "btn light", onclick: actions.share }, "Save / share card"),
        h("button", { class: "btn outline", onclick: actions.dashboard }, "See every stat"),
        h("button", { class: "btn outline", onclick: actions.replay }, "Replay")));
  });

  return slides;
}

export function playStory(slides, { onClose }) {
  const opener = document.activeElement;
  const segs = slides.map(() => h("span", null, h("i")));
  const stage = h("div", { class: "story-stage" });
  const close = h("button", { class: "story-close", "aria-label": "Close story", onclick: () => finish() }, "✕");
  const pauseFlag = h("div", { class: "story-paused", "aria-hidden": "true" }, "❚❚ Paused");
  const card = h("div", { class: "story-card" }, h("div", { class: "story-bars" }, segs), close, stage, pauseFlag);
  const root = h("div", { class: "story", role: "dialog", "aria-modal": "true", "aria-label": "Your chat, wrapped" }, card);
  document.body.append(root);
  document.body.classList.add("no-scroll");

  let index = -1, elapsed = 0, last = performance.now(), paused = false, held = false, raf = 0, current = null, downAt = 0;
  const auto = !reducedMotion();

  function show(n) {
    if (n < 0 || n >= slides.length) return;
    current?.cleanup?.();
    index = n;
    elapsed = 0;
    const slide = slides[n], [from, to, ink] = slide.theme;
    card.style.setProperty("--from", from);
    card.style.setProperty("--to", to);
    card.dataset.ink = ink;
    card.dataset.slide = slide.id;
    current = slide.make();
    stage.replaceChildren(h("div", { class: "story-slide" }, current));
    stagger(current);
    countUp(current);
    segs.forEach((seg, i) => seg.firstChild.style.width = i < n ? "100%" : "0%");
  }
  const next = () => (index < slides.length - 1 ? show(index + 1) : null);
  const prev = () => show(Math.max(0, index - 1));

  function tick(now) {
    if (!paused && !held && auto && index < slides.length - 1) elapsed += now - last;
    last = now;
    segs[index].firstChild.style.width = index === slides.length - 1 ? "100%" : `${Math.min(100, (elapsed / DURATION) * 100)}%`;
    if (elapsed >= DURATION) next();
    raf = requestAnimationFrame(tick);
  }

  function setPaused(p) { paused = p; card.classList.toggle("is-paused", p); }

  card.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, a")) return;
    downAt = performance.now();
    held = true;
  });
  card.addEventListener("pointerup", (e) => {
    held = false;
    if (e.target.closest("button, a") || !downAt) return;
    const tap = performance.now() - downAt < 300;
    downAt = 0;
    if (!tap) return; // a long press just pauses while held
    const r = card.getBoundingClientRect();
    if (e.clientX - r.left < r.width * 0.3) prev(); else next();
  });
  card.addEventListener("pointercancel", () => { held = false; downAt = 0; });

  function onKey(e) {
    if (e.key === "Escape") finish();
    else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") prev();
    else if (e.key === " " && !e.target.closest?.("button")) { e.preventDefault(); setPaused(!paused); }
  }
  const onVisibility = () => { if (document.hidden) setPaused(true); };
  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);

  function finish() {
    cancelAnimationFrame(raf);
    current?.cleanup?.();
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("visibilitychange", onVisibility);
    root.remove();
    document.body.classList.remove("no-scroll");
    opener?.focus?.();
    onClose?.();
  }

  show(0);
  close.focus();
  raf = requestAnimationFrame(tick);
  return { close: finish };
}
