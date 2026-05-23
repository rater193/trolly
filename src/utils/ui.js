/**
 * Popover & toast helpers.
 *
 * Popovers anchor to an element and close on outside click/Esc.
 * They're rendered into #popover-host.
 *
 * Toasts go into #toast-host with auto-dismiss.
 */

import { h, icon, clear } from "./dom.js";

let openPopover = null;

export function openPopover_(anchor, content, { title = "", width } = {}) {
  closePopover();
  const host = document.getElementById("popover-host");
  const pop = h("div", { class: "popover" }, [
    title ? h("div", { class: "popover__header" }, [
      h("div", { class: "popover__title" }, title),
      h("button", { class: "popover__close", onClick: () => closePopover() }, icon("close")),
    ]) : null,
    h("div", { class: "popover__body" }, content),
  ]);
  if (width) pop.style.width = width + "px";
  host.appendChild(pop);

  // Position
  const rect = anchor.getBoundingClientRect();
  const popRect = pop.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 6;
  if (left + popRect.width > window.innerWidth - 8) left = window.innerWidth - popRect.width - 8;
  if (top + popRect.height > window.innerHeight - 8) top = rect.top - popRect.height - 6;
  if (top < 8) top = 8;
  if (left < 8) left = 8;
  pop.style.left = left + "px";
  pop.style.top = top + "px";

  // Outside close
  const onDown = (e) => {
    if (pop.contains(e.target) || anchor.contains(e.target)) return;
    closePopover();
  };
  const onKey = (e) => { if (e.key === "Escape") closePopover(); };
  setTimeout(() => {
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
  }, 0);

  openPopover = { el: pop, cleanup: () => {
    document.removeEventListener("mousedown", onDown);
    document.removeEventListener("keydown", onKey);
  } };
  return pop;
}

export function closePopover() {
  if (!openPopover) return;
  openPopover.cleanup();
  openPopover.el.remove();
  openPopover = null;
}

export { openPopover_ as openPopover };

/* --------------------------------- Toast --------------------------------- */
export function toast(msg, { action = null, kind = "info", duration = 3000 } = {}) {
  const host = document.getElementById("toast-host");
  if (!host) return;
  const t = h("div", { class: "toast" }, [
    h("div", { class: "toast__icon" }, icon(kind === "ok" ? "check" : kind === "warn" ? "flag" : "sparkle")),
    h("div", { class: "toast__msg" }, msg),
    action ? h("button", { class: "toast__action", onClick: () => { action.onClick(); dismiss(); } }, action.label) : null,
  ]);
  host.appendChild(t);
  const dismiss = () => {
    t.classList.add("is-hiding");
    setTimeout(() => t.remove(), 220);
  };
  setTimeout(dismiss, duration);
  return { dismiss };
}

/* ------------------------------- Confirm ------------------------------- */
export function confirmDialog({ title, msg, confirmLabel = "Confirm", danger = false, onConfirm }) {
  const host = document.getElementById("modal-host");
  clear(host);
  host.classList.add("is-open");
  const dlg = h("div", { class: "confirm" }, [
    h("div", { class: "confirm__title" }, title),
    h("div", { class: "confirm__msg" }, msg),
    h("div", { class: "confirm__actions" }, [
      h("button", { class: "btn btn-ghost", onClick: close }, "Cancel"),
      h("button", { class: danger ? "btn btn-danger" : "btn btn-primary", onClick: () => { onConfirm?.(); close(); } }, confirmLabel),
    ]),
  ]);
  host.appendChild(dlg);
  function close() { host.classList.remove("is-open"); clear(host); document.removeEventListener("keydown", onKey); }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
}

/* ------------------------------- Prompt ------------------------------- */
export function promptDialog({ title, value = "", placeholder = "", confirmLabel = "Save", onConfirm }) {
  const host = document.getElementById("modal-host");
  clear(host);
  host.classList.add("is-open");
  const input = h("input", { class: "input", value, placeholder });
  const submit = () => {
    const v = input.value.trim();
    if (!v) { input.classList.add("shake"); setTimeout(() => input.classList.remove("shake"), 400); input.focus(); return; }
    onConfirm?.(v);
    close();
  };
  const dlg = h("div", { class: "confirm" }, [
    h("div", { class: "confirm__title" }, title),
    h("div", { style: { marginBottom: "var(--sp-5)" } }, input),
    h("div", { class: "confirm__actions" }, [
      h("button", { class: "btn btn-ghost", onClick: close }, "Cancel"),
      h("button", { class: "btn btn-primary", onClick: submit }, confirmLabel),
    ]),
  ]);
  host.appendChild(dlg);
  function close() { host.classList.remove("is-open"); clear(host); document.removeEventListener("keydown", onKey); }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
  setTimeout(() => { input.focus(); input.select(); }, 0);
}

/* ------------------------------- Choice ------------------------------- */
export function choiceDialog({ title, msg = "", choices = [] }) {
  const host = document.getElementById("modal-host");
  clear(host);
  host.classList.add("is-open");
  const dlg = h("div", { class: "confirm" }, [
    h("div", { class: "confirm__title" }, title),
    msg ? h("div", { class: "confirm__msg" }, msg) : null,
    h("div", { class: "confirm__actions" }, choices.map((c) =>
      h("button", { class: "btn " + (c.class || "btn-ghost"), onClick: () => { close(); c.onClick?.(); } }, c.label)
    )),
  ]);
  host.appendChild(dlg);
  function close() { host.classList.remove("is-open"); clear(host); document.removeEventListener("keydown", onKey); }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
}
