/**
 * Card detail modal.
 *
 * Sections: cover, title, labels/due/members bar, description, checklists,
 * activity (+comment), sidebar actions.
 */

import { h, icon, clear, formatRel, formatDue, makeInlineEditable, initials } from "../utils/dom.js";
import { openPopover, closePopover, confirmDialog, toast } from "../utils/ui.js";
import { LabelPicker, DuePicker, CoverPicker } from "./pickers.js";

export class CardModal {
  constructor({ state, board, list, card, dnd }) {
    this.state = state;
    this.board = board;
    this.list = list;
    this.card = card;
    this.dnd = dnd;
    this.editingDesc = false;
    this.unsub = null;
  }

  open() {
    const host = document.getElementById("modal-host");
    clear(host);
    host.classList.add("is-open");
    this.host = host;
    this.host.dataset.cardId = this.card.id;

    this.modal = h("div", { class: "card-modal" });
    host.appendChild(this.modal);

    // Close on overlay or esc
    this._onOverlay = (e) => { if (e.target === host) this.close(); };
    this._onKey = (e) => { if (e.key === "Escape") this.close(); };
    host.addEventListener("click", this._onOverlay);
    document.addEventListener("keydown", this._onKey);

    // Subscribe to updates of this card
    this.unsub = this.state.bus.on("*", (evt, payload) => {
      if (evt === "card:updated" && payload?.card?.id === this.card.id) {
        this.card = this.state.findCard(this.board.id, this.list.id, this.card.id);
        if (!this.card) return this.close();
        this.render();
      }
      if (evt === "card:deleted" && payload?.cardId === this.card.id) this.close();
      if (evt === "board:updated" && payload?.id === this.board.id) {
        this.board = this.state.findBoard(this.board.id);
        this.render();
      }
    });

    this.render();
  }

  close() {
    this.host?.removeEventListener("click", this._onOverlay);
    document.removeEventListener("keydown", this._onKey);
    this.unsub?.();
    this.host?.classList.remove("is-open");
    clear(this.host);
    delete this.host?.dataset.cardId;
  }

  render() {
    clear(this.modal);

    /* Cover */
    if (this.card.cover) {
      const cover = h("div", { class: "card-modal__cover", style: { background: this.card.cover.color } });
      cover.appendChild(h("div", { class: "card-modal__cover-actions" }, [
        h("button", { class: "btn btn-sm", onClick: (e) => this._openCoverPicker(e.currentTarget) }, [icon("picture"), "Cover"]),
      ]));
      this.modal.appendChild(cover);
    }

    /* Head */
    const head = h("div", { class: "card-modal__head" });
    const title = h("h2", { class: "card-modal__title" }, this.card.title);
    makeInlineEditable(title, { onCommit: (v) => this.state.updateCard(this.board.id, this.list.id, this.card.id, { title: v }) });
    head.appendChild(title);
    head.appendChild(h("div", { class: "card-modal__sub" }, [
      "in list ",
      h("a", {}, this.list.name),
    ]));
    head.appendChild(h("button", { class: "card-modal__close", title: "Close (Esc)", onClick: () => this.close() }, icon("close")));
    this.modal.appendChild(head);

    /* Body */
    const body = h("div", { class: "card-modal__body" });
    body.appendChild(this._renderMain());
    body.appendChild(this._renderSide());
    this.modal.appendChild(body);
  }

  _renderMain() {
    const main = h("div", { class: "card-modal__main" });

    /* Bar: labels, due */
    const bar = h("div", { class: "cm-bar" });

    /* Labels group */
    if (this.card.labelIds.length) {
      const grp = h("div", { class: "cm-bar__group" }, [ h("div", { class: "cm-bar__label" }, "Labels") ]);
      const row = h("div", { class: "cm-bar__row" });
      for (const lid of this.card.labelIds) {
        const lb = this.board.labels.find(l => l.id === lid);
        if (!lb) continue;
        const chip = h("button", { class: "label-chip", style: { background: `var(--label-${lb.color})` }, onClick: (e) => this._openLabelPicker(e.currentTarget) }, lb.name || " ");
        row.appendChild(chip);
      }
      row.appendChild(h("button", { class: "pill-add", onClick: (e) => this._openLabelPicker(e.currentTarget), title: "Add label" }, icon("plus")));
      grp.appendChild(row);
      bar.appendChild(grp);
    }

    /* Due group */
    if (this.card.dueAt) {
      const due = this.card.dueState();
      const cls = due === "overdue" ? " is-overdue" : due === "soon" ? " is-soon" : due === "done" ? " is-done" : "";
      const grp = h("div", { class: "cm-bar__group" }, [ h("div", { class: "cm-bar__label" }, "Due date") ]);
      const pill = h("button", { class: "due-pill" + cls, onClick: (e) => this._openDuePicker(e.currentTarget) }, [
        h("div", { class: "due-pill__check", onClick: (e) => { e.stopPropagation(); this.state.toggleCardDueDone(this.board.id, this.list.id, this.card.id); } }, this.card.dueDone ? icon("check") : ""),
        h("span", {}, formatDue(this.card.dueAt) + (due === "overdue" ? " · Overdue" : due === "soon" ? " · Soon" : "")),
        icon("chevronD"),
      ]);
      grp.appendChild(pill);
      bar.appendChild(grp);
    }

    if (bar.children.length) main.appendChild(bar);

    /* Description */
    const descSection = h("div", { class: "cm-section" }, [
      h("div", { class: "cm-section__head" }, [
        h("div", { class: "cm-section__icon" }, icon("list")),
        h("div", { class: "cm-section__title" }, "Description"),
        !this.editingDesc && this.card.description ? h("div", { class: "cm-section__actions" }, [
          h("button", { class: "btn btn-sm btn-ghost", style: { background: "var(--bg-input)" }, onClick: () => { this.editingDesc = true; this.render(); } }, "Edit"),
        ]) : null,
      ]),
    ]);
    if (this.editingDesc) {
      const ta = h("textarea", { class: "desc-editor__textarea", placeholder: "Add a more detailed description…" });
      ta.value = this.card.description || "";
      const editor = h("div", { class: "desc-editor" }, [
        ta,
        h("div", { class: "desc-editor__actions" }, [
          h("button", { class: "btn btn-primary", onClick: () => {
            this.state.updateCard(this.board.id, this.list.id, this.card.id, { description: ta.value });
            this.editingDesc = false;
            this.render();
          } }, "Save"),
          h("button", { class: "btn btn-ghost", onClick: () => { this.editingDesc = false; this.render(); } }, "Cancel"),
        ]),
      ]);
      descSection.appendChild(editor);
      setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 20);
    } else {
      const disp = h("div", { class: "desc-display" + (this.card.description ? "" : " is-placeholder"), onClick: () => { this.editingDesc = true; this.render(); } },
        this.card.description || "Add a more detailed description…");
      descSection.appendChild(disp);
    }
    main.appendChild(descSection);

    /* Checklists */
    for (const cl of this.card.checklists) {
      main.appendChild(this._renderChecklist(cl));
    }

    /* Activity / comments */
    main.appendChild(this._renderActivity());

    return main;
  }

  _renderChecklist(cl) {
    const total = cl.items.length;
    const done = cl.items.filter(i => i.done).length;
    const pct = total ? Math.round(done / total * 100) : 0;

    const sec = h("div", { class: "checklist cm-section", dataset: { checklistId: cl.id } });
    sec.appendChild(h("div", { class: "checklist__head" }, [
      h("div", { class: "cm-section__icon" }, icon("checklist")),
      (() => {
        const t = h("div", { class: "checklist__title" }, cl.title);
        makeInlineEditable(t, { onCommit: (v) => this.state.renameChecklist(this.board.id, this.list.id, this.card.id, cl.id, v) });
        return t;
      })(),
      h("button", { class: "btn btn-sm btn-ghost", style: { background: "var(--bg-input)" }, onClick: () => {
        confirmDialog({
          title: `Delete "${cl.title}"?`,
          msg: "This checklist and its items will be removed.",
          confirmLabel: "Delete",
          danger: true,
          onConfirm: () => this.state.deleteChecklist(this.board.id, this.list.id, this.card.id, cl.id),
        });
      } }, "Delete"),
    ]));
    sec.appendChild(h("div", { class: "checklist__progress" }, [
      h("div", { class: "checklist__pct" }, pct + "%"),
      h("div", { class: "checklist__bar" }, h("div", { class: "checklist__bar-fill" + (pct === 100 && total > 0 ? " is-complete" : ""), style: { width: pct + "%" } })),
    ]));

    const items = h("div", { class: "checklist__items" });
    for (const it of cl.items) items.appendChild(this._renderChecklistItem(cl, it));
    sec.appendChild(items);

    // Add item composer
    const composerBtn = h("button", { class: "checklist__add-btn", onClick: () => {
      const inp = h("input", { class: "input", placeholder: "Add an item…" });
      const commit = () => {
        const v = inp.value.trim();
        if (v) {
          this.state.addChecklistItem(this.board.id, this.list.id, this.card.id, cl.id, v);
          inp.value = "";
          setTimeout(() => inp.focus(), 20);
        }
      };
      const cancel = () => { wrap.replaceWith(composerBtn); };
      const wrap = h("div", { class: "checklist__add" }, [
        inp,
        h("button", { class: "btn btn-primary", onClick: commit }, "Add"),
        h("button", { class: "btn btn-ghost", onClick: cancel }, "Cancel"),
      ]);
      composerBtn.replaceWith(wrap);
      setTimeout(() => inp.focus(), 20);
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") cancel();
      });
    } }, "+ Add an item");
    sec.appendChild(composerBtn);

    return sec;
  }

  _renderChecklistItem(cl, it) {
    const row = h("div", { class: "checklist-item" + (it.done ? " is-done" : ""), dataset: { itemId: it.id } });
    const check = h("button", { class: "checklist-item__check" + (it.done ? " is-checked" : ""), onClick: () => {
      this.state.updateChecklistItem(this.board.id, this.list.id, this.card.id, cl.id, it.id, { done: !it.done });
    } }, icon("check"));
    const text = h("div", { class: "checklist-item__text" }, it.text);
    makeInlineEditable(text, { onCommit: (v) => this.state.updateChecklistItem(this.board.id, this.list.id, this.card.id, cl.id, it.id, { text: v }) });
    const del = h("button", { class: "checklist-item__delete", onClick: () => {
      this.state.deleteChecklistItem(this.board.id, this.list.id, this.card.id, cl.id, it.id);
    } }, icon("trash"));
    row.appendChild(check);
    row.appendChild(text);
    row.appendChild(del);
    // Drag affordance — start drag on pointerdown anywhere except interactive controls
    row.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button,a,input,textarea")) return;
      this.dnd?.startChecklistItem(e, {
        el: row,
        itemId: it.id,
        fromChecklistId: cl.id,
        cardId: this.card.id,
      });
    });
    return row;
  }

  _renderActivity() {
    const sec = h("div", { class: "cm-section" });
    sec.appendChild(h("div", { class: "cm-section__head" }, [
      h("div", { class: "cm-section__icon" }, icon("comment")),
      h("div", { class: "cm-section__title" }, "Activity"),
    ]));

    // Composer
    const inp = h("input", { class: "input", placeholder: "Write a comment…" });
    const send = () => {
      const v = inp.value.trim();
      if (!v) return;
      this.state.addComment(this.board.id, this.list.id, this.card.id, v);
      inp.value = "";
    };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });
    sec.appendChild(h("div", { class: "comment-composer" }, [
      h("div", { class: "avatar", style: { background: "var(--accent)", color: "var(--text-on-accent)" } }, "Me"),
      inp,
      h("button", { class: "btn btn-primary", onClick: send }, icon("send")),
    ]));

    // Comments (newest first)
    const comments = [...this.card.comments].sort((a, b) => b.ts - a.ts);
    for (const c of comments) {
      sec.appendChild(h("div", { class: "activity-item is-comment" }, [
        h("div", { class: "avatar", style: { background: "var(--label-blue)" } }, "Me"),
        h("div", { class: "activity-item__body" }, [
          c.text,
          h("div", { class: "activity-item__time" }, formatRel(c.ts)),
        ]),
        h("button", { class: "btn-icon", title: "Delete comment", onClick: () => this.state.deleteComment(this.board.id, this.list.id, this.card.id, c.id) }, icon("trash")),
      ]));
    }

    // System activity (board-level mentions)
    const recent = (this.board.activity || []).filter(a => a.text.includes('"' + this.card.title + '"')).slice(0, 5);
    for (const a of recent) {
      sec.appendChild(h("div", { class: "activity-item" }, [
        h("div", { class: "avatar", style: { background: "var(--text-4)" } }, "·"),
        h("div", { class: "activity-item__body" }, [
          h("b", {}, "You "), a.text,
          h("span", { class: "activity-item__time" }, formatRel(a.ts)),
        ]),
      ]));
    }

    return sec;
  }

  _renderSide() {
    const side = h("div", { class: "cm-side" });
    side.appendChild(h("div", { class: "cm-side__label" }, "Add to card"));
    const grp = h("div", { class: "cm-side__group" }, [
      h("button", { class: "cm-side__btn", onClick: (e) => this._openLabelPicker(e.currentTarget) }, [icon("tag"), "Labels"]),
      h("button", { class: "cm-side__btn", onClick: (e) => this._openDuePicker(e.currentTarget) }, [icon("calendar"), this.card.dueAt ? "Edit due date" : "Due date"]),
      h("button", { class: "cm-side__btn", onClick: () => {
        this.state.addChecklist(this.board.id, this.list.id, this.card.id, "Checklist");
      } }, [icon("checklist"), "Checklist"]),
      h("button", { class: "cm-side__btn", onClick: (e) => this._openCoverPicker(e.currentTarget) }, [icon("picture"), "Cover"]),
    ]);
    side.appendChild(grp);

    side.appendChild(h("div", { class: "cm-side__label", style: { marginTop: "12px" } }, "Actions"));
    const acts = h("div", { class: "cm-side__group" }, [
      h("button", { class: "cm-side__btn", onClick: (e) => this._openMoveMenu(e.currentTarget) }, [icon("send"), "Move"]),
      h("button", { class: "cm-side__btn", onClick: () => this._duplicateCard() }, [icon("copy"), "Duplicate"]),
      h("button", { class: "cm-side__btn is-danger", onClick: () => {
        confirmDialog({
          title: "Delete this card?",
          msg: "It will be removed permanently.",
          confirmLabel: "Delete card",
          danger: true,
          onConfirm: () => { this.state.deleteCard(this.board.id, this.list.id, this.card.id); this.close(); toast("Card deleted"); },
        });
      } }, [icon("trash"), "Delete"]),
    ]);
    side.appendChild(acts);
    return side;
  }

  /* ---------------------- Popovers ---------------------- */
  _openLabelPicker(anchor) {
    const picker = new LabelPicker({ board: this.board, card: this.card, state: this.state });
    openPopover(anchor, picker.el, { title: "Labels", width: 280 });
  }
  _openDuePicker(anchor) {
    const picker = new DuePicker({ card: this.card, board: this.board, state: this.state });
    openPopover(anchor, picker.el, { title: "Due date", width: 280 });
  }
  _openCoverPicker(anchor) {
    const picker = new CoverPicker({ card: this.card, board: this.board, state: this.state });
    openPopover(anchor, picker.el, { title: "Cover", width: 280 });
  }
  _openMoveMenu(anchor) {
    const board = this.board;
    const items = [];
    for (const l of board.lists) {
      items.push(h("button", {
        class: "menu-item" + (l.id === this.list.id ? " is-current" : ""),
        onClick: () => {
          if (l.id !== this.list.id) {
            this.state.moveCard(board.id, this.list.id, this.card.id, l.id, l.cards.length);
            this.list = this.state.findList(board.id, l.id);
            closePopover();
            this.render();
          } else closePopover();
        },
      }, [
        h("span", { class: "menu-item__icon" }, icon(l.id === this.list.id ? "check" : "list")),
        l.name + (l.id === this.list.id ? "  (current)" : ""),
      ]));
    }
    openPopover(anchor, items, { title: "Move to list", width: 240 });
  }
  _duplicateCard() {
    const copy = { ...this.card.toJSON() };
    copy.id = undefined; copy.title = this.card.title + " (copy)";
    this.state.createCard(this.board.id, this.list.id, copy.title, copy);
    toast("Card duplicated", { kind: "ok" });
  }
}
