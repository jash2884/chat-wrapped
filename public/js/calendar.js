// GitHub-style calendar: one square per day, weeks as columns, darker = busier.
import { h } from "./dom.js";
import * as f from "./format.js";

const DAY = 86_400_000;

// The window shown: a calendar year when wrapping a year, otherwise the last 365 days.
export function calendarWindow(stats) {
  const last = Date.parse(stats.calendar.at(-1)[0]);
  if (stats.period && /^\d{4}$/.test(stats.period)) {
    const y = Number(stats.period);
    return { from: Date.UTC(y, 0, 1), to: Math.min(Date.UTC(y, 11, 31), last) };
  }
  return { from: Math.max(Date.parse(stats.calendar[0][0]), last - 364 * DAY), to: last };
}

export function calendarGrid(stats, { labels = false } = {}) {
  const { from, to } = calendarWindow(stats);
  const counts = new Map(stats.calendar);
  const max = Math.max(1, ...stats.calendar.filter(([d]) => Date.parse(d) >= from && Date.parse(d) <= to).map(([, n]) => n));
  // Start on the Monday on or before `from` so rows line up with weekdays.
  const start = from - ((new Date(from).getUTCDay() + 6) % 7) * DAY;
  const weeks = Math.ceil((to - start + DAY) / (7 * DAY));
  const cells = [];
  let active = 0;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const t = start + (w * 7 + d) * DAY;
      const iso = new Date(t).toISOString().slice(0, 10);
      const n = counts.get(iso) ?? 0;
      if (t < from || t > to) { cells.push(h("i", { class: "out" })); continue; }
      if (n) active++;
      cells.push(h("i", { class: n ? "on" : "", style: n ? `--o:${(0.25 + 0.75 * (n / max)).toFixed(2)}` : null, title: `${f.date(t)}: ${n ? f.int(n) : "no"} message${n === 1 ? "" : "s"}` }));
    }
  }
  const grid = h("div", { class: "cal", style: `--weeks:${weeks}`, role: "img", "aria-label": `Calendar of chat activity: ${active} active days between ${f.date(from)} and ${f.date(to)}` }, cells);
  if (!labels) return { el: grid, active, from, to };
  const months = [];
  for (let w = 0; w < weeks; w++) {
    const t = start + w * 7 * DAY, d = new Date(t);
    months.push(h("span", null, d.getUTCDate() <= 7 && t >= from - 6 * DAY ? f.monthLabel(d.toISOString().slice(0, 7)) : ""));
  }
  return { el: h("div", { class: "cal-wrap" }, h("div", { class: "cal-months", style: `--weeks:${weeks}` }, months), grid), active, from, to };
}

// Phone-friendly variant for the story: one small month calendar per month.
export function monthBlocks(stats) {
  const { from, to } = calendarWindow(stats);
  const counts = new Map(stats.calendar);
  const inWindow = stats.calendar.filter(([d]) => Date.parse(d) >= from && Date.parse(d) <= to);
  const max = Math.max(1, ...inWindow.map(([, n]) => n));
  const blocks = [];
  let active = 0;
  const first = new Date(from);
  for (let y = first.getUTCFullYear(), mo = first.getUTCMonth(); Date.UTC(y, mo, 1) <= to; mo === 11 ? (y++, mo = 0) : mo++) {
    const start = Date.UTC(y, mo, 1), days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    const lead = (new Date(start).getUTCDay() + 6) % 7;
    const cells = Array.from({ length: lead }, () => h("i", { class: "out" }));
    for (let d = 0; d < days; d++) {
      const t = start + d * DAY, iso = new Date(t).toISOString().slice(0, 10), n = counts.get(iso) ?? 0;
      if (t < from || t > to) { cells.push(h("i", { class: "out" })); continue; }
      if (n) active++;
      cells.push(h("i", { class: n ? "on" : "", style: n ? `--o:${(0.25 + 0.75 * (n / max)).toFixed(2)}` : null }));
    }
    blocks.push(h("div", { class: "month" }, h("span", null, f.monthLabel(`${y}-${String(mo + 1).padStart(2, "0")}`)), h("div", { class: "month-grid" }, cells)));
  }
  return { el: h("div", { class: "months", role: "img", "aria-label": `${active} active days, shown month by month` }, blocks), active };
}
