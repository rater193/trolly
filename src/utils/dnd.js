/**
 * Drag-and-drop manager.
 *
 * Supports two drag types:
 *   - "card": move a card between/within lists
 *   - "list": reorder lists within a board
 *
 * Uses pointer events with a custom ghost (the actual element is hidden
 * during drag); placeholders are inserted to show where the item will land.
 *
 * This is not HTML5 DnD — pointer events give much smoother and more
 * controllable animations, especially across overflow containers.
 */

import { throttle } from "./dom.js";

export class DragManager {
  constructor({ onCardDrop, onListDrop, onChecklistItemDrop } = {}) {
    this.onCardDrop = onCardDrop || (() => {});
    this.onListDrop = onListDrop || (() => {});
    this.onChecklistItemDrop = onChecklistItemDrop || (() => {});
    this.active = null;
    this.pending = null;
    this._onMove = throttle(this._onMove.bind(this), 16);
    this._onUp = this._onUp.bind(this);
    document.addEventListener("pointermove", this._onMove);
    document.addEventListener("pointerup", this._onUp);
    document.addEventListener("pointercancel", this._onUp);
  }

  /** Arm a card drag — does not actually start dragging until movement
   *  exceeds the threshold. This lets quiet clicks pass through. */
  startCard(e, { el, cardId, listId, boardId }) {
    if (e.button !== 0) return;
    if (this.active || this.pending) return;
    const rect = el.getBoundingClientRect();
    this.pending = {
      type: "card",
      el, cardId, fromListId: listId, boardId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX, startY: e.clientY,
      rect,
    };
  }

  /** Arm a checklist-item drag — same defer pattern. */
  startChecklistItem(e, { el, itemId, fromChecklistId, cardId }) {
    if (e.button !== 0) return;
    if (this.active || this.pending) return;
    const rect = el.getBoundingClientRect();
    this.pending = {
      type: "checklistItem",
      el, itemId, fromChecklistId, cardId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX, startY: e.clientY,
      rect,
    };
  }

  /** Arm a list drag — same defer pattern. */
  startList(e, { el, listId, boardId }) {
    if (e.button !== 0) return;
    if (this.active || this.pending) return;
    const rect = el.getBoundingClientRect();
    this.pending = {
      type: "list",
      el, listId, boardId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX, startY: e.clientY,
      rect,
    };
  }

  /** Promote pending → active once movement threshold is crossed. */
  _commitPending(e) {
    const p = this.pending;
    this.pending = null;
    const { el, rect, type } = p;

    const ghost = el.cloneNode(true);
    ghost.classList.add("is-drag-ghost");
    ghost.style.position = "fixed";
    ghost.style.left = rect.left + "px";
    ghost.style.top = rect.top + "px";
    ghost.style.width = rect.width + "px";
    if (type === "list") ghost.style.height = rect.height + "px";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "9999";
    document.body.appendChild(ghost);

    const placeholder = document.createElement("div");
    if (type === "card") {
      placeholder.className = "card-placeholder";
      placeholder.style.setProperty("--ph-h", rect.height + "px");
    } else if (type === "checklistItem") {
      placeholder.className = "checklist-item-placeholder";
      placeholder.style.height = rect.height + "px";
    } else {
      placeholder.className = "list";
      placeholder.style.height = rect.height + "px";
      placeholder.style.background = "rgba(255,255,255,0.05)";
      placeholder.style.border = "1px dashed rgba(255,255,255,0.20)";
      placeholder.style.boxShadow = "none";
    }
    el.parentNode.insertBefore(placeholder, el);
    el.classList.add("is-dragging");
    el.style.display = "none";

    this.active = { ...p, ghost, placeholder, moved: true };
  }

  _onMove(e) {
    // Promote pending drag if movement crosses threshold
    if (this.pending) {
      if (Math.hypot(e.clientX - this.pending.startX, e.clientY - this.pending.startY) < 5) return;
      this._commitPending(e);
    }
    if (!this.active) return;
    const a = this.active;
    // Position ghost
    a.ghost.style.left = (e.clientX - a.offsetX) + "px";
    a.ghost.style.top = (e.clientY - a.offsetY) + "px";

    if (a.type === "card") this._updateCardTarget(e);
    else if (a.type === "list") this._updateListTarget(e);
    else if (a.type === "checklistItem") this._updateChecklistItemTarget(e);
  }

  _updateCardTarget(e) {
    const a = this.active;
    // Find list under pointer
    const targetList = elementUnderExcludingGhost(e.clientX, e.clientY, ".list:not(.is-dragging)", a.ghost);
    if (!targetList) return;
    const body = targetList.querySelector(".list__body");
    if (!body) return;

    // All current cards in this list (excluding the placeholder + hidden el)
    const cards = Array.from(body.querySelectorAll(".card:not(.is-dragging)"));
    let insertBefore = null;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { insertBefore = c; break; }
    }

    // Move placeholder to that location
    if (insertBefore) {
      if (a.placeholder.nextElementSibling !== insertBefore || a.placeholder.parentNode !== body) {
        body.insertBefore(a.placeholder, insertBefore);
      }
    } else {
      if (a.placeholder.parentNode !== body || a.placeholder !== body.lastElementChild) {
        body.appendChild(a.placeholder);
      }
    }
    a.toListId = targetList.dataset.listId;
  }

  _updateChecklistItemTarget(e) {
    const a = this.active;
    const targetChecklist = elementUnderExcludingGhost(e.clientX, e.clientY, ".checklist", a.ghost);
    if (!targetChecklist) return;
    const body = targetChecklist.querySelector(".checklist__items");
    if (!body) return;
    const items = Array.from(body.querySelectorAll(".checklist-item:not(.is-dragging)"));
    let insertBefore = null;
    for (const c of items) {
      const r = c.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { insertBefore = c; break; }
    }
    if (insertBefore) {
      if (a.placeholder.nextElementSibling !== insertBefore || a.placeholder.parentNode !== body) {
        body.insertBefore(a.placeholder, insertBefore);
      }
    } else {
      if (a.placeholder.parentNode !== body || a.placeholder !== body.lastElementChild) {
        body.appendChild(a.placeholder);
      }
    }
    a.toChecklistId = targetChecklist.dataset.checklistId;
  }

  _updateListTarget(e) {
    const a = this.active;
    const lists = Array.from(document.querySelectorAll(".lists > .list:not(.is-dragging)"));
    let insertBefore = null;
    for (const l of lists) {
      if (l === a.placeholder) continue;
      const r = l.getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) { insertBefore = l; break; }
    }
    const parent = document.querySelector(".lists");
    if (!parent) return;
    if (insertBefore) {
      if (a.placeholder.nextElementSibling !== insertBefore) parent.insertBefore(a.placeholder, insertBefore);
    } else {
      // Insert before the add-list pseudo-button if present
      const addBtn = parent.querySelector(".add-list");
      if (addBtn) {
        if (a.placeholder.nextElementSibling !== addBtn) parent.insertBefore(a.placeholder, addBtn);
      } else {
        parent.appendChild(a.placeholder);
      }
    }
  }

  _onUp() {
    // If pending but never crossed threshold → it was a click. Do nothing.
    if (this.pending) { this.pending = null; return; }
    if (!this.active) return;
    const a = this.active;
    if (a.moved) {
      if (a.type === "card") {
        const body = a.placeholder.parentNode;
        const toListId = body?.closest(".list")?.dataset.listId || a.fromListId;
        const siblings = Array.from(body.children).filter(c => c.classList.contains("card") || c === a.placeholder);
        const toIndex = siblings.indexOf(a.placeholder);
        this.onCardDrop({
          boardId: a.boardId,
          fromListId: a.fromListId,
          toListId,
          cardId: a.cardId,
          toIndex,
        });
      } else if (a.type === "list") {
        const parent = a.placeholder.parentNode;
        const siblings = Array.from(parent.children).filter(c => c.classList.contains("list"));
        const toIndex = siblings.indexOf(a.placeholder);
        this.onListDrop({ boardId: a.boardId, listId: a.listId, toIndex });
      } else if (a.type === "checklistItem") {
        const body = a.placeholder.parentNode;
        const toChecklistId = body?.closest(".checklist")?.dataset.checklistId || a.fromChecklistId;
        const siblings = Array.from(body.children).filter(c => c.classList.contains("checklist-item") || c === a.placeholder);
        const toIndex = siblings.indexOf(a.placeholder);
        this.onChecklistItemDrop({
          cardId: a.cardId,
          fromChecklistId: a.fromChecklistId,
          toChecklistId,
          itemId: a.itemId,
          toIndex,
        });
      }
    }
    // Restore
    a.ghost.remove();
    a.placeholder.remove();
    a.el.style.display = "";
    a.el.classList.remove("is-dragging");
    this.active = null;
    // Suppress any synthetic click that fires immediately after a real drag,
    // but only for a brief window so it can't stick around and eat other clicks.
    if (a.moved) this._suppressNextClick();
  }

  _suppressNextClick() {
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener("click", swallow, true);
    setTimeout(() => window.removeEventListener("click", swallow, true), 50);
  }
}

/** querySelector descendants under (x,y), excluding the drag ghost. */
function elementUnderExcludingGhost(x, y, sel, ghost) {
  const prevPe = ghost.style.pointerEvents;
  ghost.style.pointerEvents = "none";
  const el = document.elementFromPoint(x, y);
  ghost.style.pointerEvents = prevPe;
  if (!el) return null;
  return el.closest(sel);
}
