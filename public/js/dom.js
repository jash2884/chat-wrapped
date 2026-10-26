// Tiny DOM helpers. Strings always go in as text nodes, so names and words
// from an uploaded chat can never be interpreted as HTML.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of kids.flat(Infinity)) {
    if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Animates every [data-count] inside root from 0 to its value.
export function countUp(root, ms = 1100) {
  for (const el of root.querySelectorAll("[data-count]")) {
    const target = Number(el.dataset.count), decimals = Number(el.dataset.decimals ?? 0);
    const fmt = (x) => x.toLocaleString("en", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (reducedMotion()) { el.textContent = fmt(target); continue; }
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), eased = 1 - (1 - k) ** 3;
      el.textContent = fmt(target * eased);
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// Staggered entrance for direct children of root.
export function stagger(root) {
  [...root.children].forEach((c, i) => c.style.setProperty("--i", i));
  return root;
}
