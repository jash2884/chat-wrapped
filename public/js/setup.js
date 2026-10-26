// "Before we wrap" sheet: who is the person exporting, and which year to wrap.
import { h } from "./dom.js";

export function defaultPeriod(result) {
  // Wrapped is a yearly ritual: default to the latest year if it has a real story to tell.
  const latest = result.years[0];
  return latest && result.byYear[latest]?.totals.messages >= 200 ? String(latest) : "all";
}

export function guessYou(result) {
  // Some Android exports label the exporter's own messages "You".
  return result.all.people.find((p) => p.name === "You")?.name ?? null;
}

export function askSetup(result) {
  const people = result.all.people;
  const needsPeriod = result.years.length > 1;
  return new Promise((resolve) => {
    let you = guessYou(result), period = defaultPeriod(result);
    const opener = document.activeElement;

    const chipGroup = (items, current, onPick) => {
      const group = h("div", { class: "chips", role: "group" });
      const render = (value) => group.replaceChildren(...items.map(([v, label]) =>
        h("button", { type: "button", class: "chip", "aria-pressed": String(v === value), onclick: () => { onPick(v); render(v); } }, label)));
      render(current);
      return group;
    };

    const shown = people.slice(0, 24);
    const sheet = h("div", { class: "setup", role: "dialog", "aria-modal": "true", "aria-labelledby": "setup-title" },
      h("div", { class: "setup-card" },
        h("div", null,
          h("p", { class: "eyebrow" }, "Before we wrap"),
          h("h2", { id: "setup-title" }, result.all.title)),
        h("div", null,
          h("h3", null, "Which one is you?"),
          chipGroup([...shown.map((p) => [p.name, p.name]), [null, "Skip"]], you, (v) => { you = v; }),
          people.length > shown.length ? h("p", { class: "muted" }, `Showing the 24 most active of ${people.length}. Everyone still appears in your Wrapped.`) : null),
        needsPeriod ? h("div", null,
          h("h3", null, "Which period?"),
          chipGroup([...result.years.map((y) => [String(y), `${y} Wrapped`]), ["all", "All time"]], period, (v) => { period = v; })) : null,
        h("button", { class: "btn primary", type: "button", onclick: () => { sheet.remove(); opener?.focus?.(); resolve({ you, period }); } }, "Start my Wrapped ▶")));
    document.body.append(sheet);
    sheet.querySelector(".chip")?.focus();
  });
}
