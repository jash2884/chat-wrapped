// Formatting helpers shared by the analysis, the UI and the share image.
// Timestamps are wall-clock times stored as UTC, so every getter here is UTC.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const int = (n) => Math.round(n).toLocaleString("en");
export const pct = (x) => `${Math.round(x * 100)}%`;

export function duration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} sec`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function date(ts, withYear = true) {
  const d = new Date(ts);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ""}`;
}

export function range(a, b) {
  const sameYear = new Date(a).getUTCFullYear() === new Date(b).getUTCFullYear();
  return `${date(a, !sameYear)} – ${date(b)}`;
}

export function hour(h) {
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 || 12} ${suffix}`;
}

export const monthLabel = (key) => MONTHS[Number(key.slice(5, 7)) - 1];
