/**
 * Tiny DOM helper functions.
 * - h(tag, attrs, children) — virtual create, no framework
 * - $ / $$ — querySelector helpers
 * - on — addEventListener with cleanup token
 */

export function h(tag, attrs = {}, children = null) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "dataset") {
        for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
      } else if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "html") {
        el.innerHTML = v;
      } else if (k in el && k !== "list") {
        try { el[k] = v; } catch (e) { el.setAttribute(k, v); }
      } else {
        el.setAttribute(k, v);
      }
    }
  }
  if (children != null) appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  if (Array.isArray(children)) {
    for (const c of children) appendChildren(el, c);
  } else if (children instanceof Node) {
    el.appendChild(children);
  } else if (typeof children === "string" || typeof children === "number") {
    el.appendChild(document.createTextNode(String(children)));
  }
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

/** Lightweight inline-edit: turn a node into an editable input on click. */
export function makeInlineEditable(el, { multiline = false, onCommit, placeholder = "" } = {}) {
  el.addEventListener("click", (e) => {
    if (el.querySelector("input,textarea")) return;
    e.stopPropagation();
    const current = el.textContent;
    const input = document.createElement(multiline ? "textarea" : "input");
    input.value = current;
    if (placeholder) input.placeholder = placeholder;
    input.className = el.className + " inline-input";
    el.replaceChildren(input);
    input.focus();
    input.select();
    const commit = () => {
      const v = input.value.trim();
      el.textContent = v || current;
      if (v && v !== current) onCommit?.(v);
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && (!multiline || !ev.shiftKey)) { ev.preventDefault(); input.blur(); }
      if (ev.key === "Escape") { input.value = current; input.blur(); }
    });
  });
}

/** Icon SVG library — a small curated set. Returns an SVG element. */
const ICONS = {
  plus:     '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  close:    '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  search:   '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  star:     '<path d="M12 3l2.65 5.95L21 9.75l-4.7 4.27L17.6 21 12 17.77 6.4 21l1.3-6.98L3 9.75l6.35-.8L12 3z" fill="currentColor"/>',
  starO:    '<path d="M12 3l2.65 5.95L21 9.75l-4.7 4.27L17.6 21 12 17.77 6.4 21l1.3-6.98L3 9.75l6.35-.8L12 3z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>',
  more:     '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  check:    '<path d="M5 12l4.5 4.5L19 7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  chevron:  '<path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  chevronD: '<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  trash:    '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  edit:     '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>',
  list:     '<path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  board:    '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M9 4v16M15 4v16" stroke="currentColor" stroke-width="2"/>',
  user:     '<circle cx="12" cy="8" r="3.6" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M4 20c1.5-3.5 4.5-5.5 8-5.5s6.5 2 8 5.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  users:    '<circle cx="9" cy="9" r="3" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M2.5 19c1.2-2.8 3.7-4.5 6.5-4.5s5.3 1.7 6.5 4.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="17" cy="7" r="2.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14 12.5c.9-.3 1.9-.5 3-.5 2.4 0 4.4 1.3 5.5 3.3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  tag:      '<path d="M21 12L12 21l-9-9 9-9h9v9z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><circle cx="16.5" cy="7.5" r="1.3" fill="currentColor"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  checklist:'<path d="M3 6h2l1 1 2-3M3 12h2l1 1 2-3M3 18h2l1 1 2-3M11 6h10M11 12h10M11 18h7" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  comment:  '<path d="M21 12.5C21 17 17 20 12 20c-1.3 0-2.5-.2-3.6-.6L3 21l1.5-4.8C3.6 15 3 13.8 3 12.5 3 8 7 5 12 5s9 3 9 7.5z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>',
  archive:  '<rect x="3" y="4" width="18" height="4" rx="1" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M9 13h6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  copy:     '<rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>',
  picture:  '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="9" cy="10" r="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 17l5-5 4 4 3-3 6 6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  filter:   '<path d="M4 5h16l-6 8v6l-4-2v-4L4 5z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>',
  sidebar:  '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M9 4v16" stroke="currentColor" stroke-width="1.8"/>',
  sun:      '<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  moon:     '<path d="M21 14a8 8 0 1 1-10-10 7 7 0 0 0 10 10z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>',
  globe:    '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  download: '<path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  upload:   '<path d="M12 20V8m0 0l-4 4m4-4l4 4M4 4h16" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  sparkle:  '<path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3z" fill="currentColor"/>',
  flag:     '<path d="M5 21V4m0 0h11l-2 3 2 3H5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  send:     '<path d="M3 11l18-7-7 18-2-8-9-3z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>',
  drag:     '<circle cx="9" cy="6" r="1.4" fill="currentColor"/><circle cx="9" cy="12" r="1.4" fill="currentColor"/><circle cx="9" cy="18" r="1.4" fill="currentColor"/><circle cx="15" cy="6" r="1.4" fill="currentColor"/><circle cx="15" cy="12" r="1.4" fill="currentColor"/><circle cx="15" cy="18" r="1.4" fill="currentColor"/>',
  reset:    '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
};

export function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name] || ICONS.more;
  return svg;
}

/** Format a date relative to now: "Today at 4:23 PM", "Yesterday", "Mar 12". */
export function formatRel(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = diffMs / 60000;
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${Math.floor(diffMin)}m ago`;
  const isSameDay = d.toDateString() === now.toDateString();
  if (isSameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

export function formatDue(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const opts = { month: "short", day: "numeric" };
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  if (hasTime) {
    opts.hour = "numeric";
    opts.minute = "2-digit";
  }
  return d.toLocaleString([], opts);
}

/** Animate a node out, then remove. */
export function removeWithAnim(node, anim = "fadeOut") {
  if (!node) return;
  node.style.transition = "opacity var(--t-med) var(--ease-out), transform var(--t-med) var(--ease-out)";
  node.style.opacity = "0";
  node.style.transform = "translateY(-4px)";
  setTimeout(() => node.remove(), 220);
}

/** Throttle helper. */
export function throttle(fn, ms = 50) {
  let t = 0;
  return function(...a) {
    const now = Date.now();
    if (now - t > ms) { t = now; fn.apply(this, a); }
  };
}

/** Initials from a string. */
export function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0] || "").join("").toUpperCase();
}

/** Stable color from a string (for workspace avatars). */
export function colorFromStr(str) {
  const palette = ["#4dd6c1","#7fb6ff","#c79bff","#ff8fcb","#ffd56b","#ff9f6b","#6ddc9c","#80e2f0","#c7e96a","#ff7a8a"];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
