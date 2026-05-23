/**
 * Reusable picker components used in popovers.
 *
 *   LabelPicker         - choose labels for a card (also creates/edits/deletes)
 *   DuePicker           - pick a due date/time
 *   CoverPicker         - color cover for a card
 *   BackgroundPicker    - board background
 *   FilterPanel         - filter cards by label / due / search
 */

import { h, icon, clear } from "../utils/dom.js";

/* ---------------------------- LabelPicker ---------------------------- */
const LABEL_COLORS = ["green","yellow","orange","red","purple","blue","sky","pink","lime","gray"];

export class LabelPicker {
  constructor({ board, card, state }) {
    this.board = board;
    this.card = card;
    this.state = state;
    this.el = h("div", { class: "label-picker" });
    this._mode = "list";
    this._editing = null;
    this.render();
  }
  render() {
    clear(this.el);
    if (this._mode === "list") this._renderList();
    else this._renderEdit();
  }
  _renderList() {
    const list = h("div", { class: "label-picker__list" });
    for (const lb of this.board.labels) {
      const c = `var(--label-${lb.color})`;
      const isOn = this.card.labelIds.includes(lb.id);
      const check = h("div", { class: "label-picker__check" + (isOn ? " is-checked" : "") }, icon("check"));
      const toggle = () => {
        this.state.toggleCardLabel(this.board.id, this.card.listId, this.card.id, lb.id);
        this.card = this.state.findCard(this.board.id, this.card.listId, this.card.id);
        this.render();
      };
      const row = h("div", { class: "label-picker__row", onClick: toggle, style: { cursor: "pointer" } }, [
        check,
        h("div", { class: "label-picker__chip", style: { background: c } }, [ h("span", {}, lb.name || " ") ]),
        h("button", { class: "label-picker__edit", title: "Edit label", onClick: (e) => { e.stopPropagation(); this._editing = lb; this._mode = "edit"; this.render(); } }, icon("edit")),
      ]);
      list.appendChild(row);
    }
    this.el.appendChild(list);
    this.el.appendChild(h("button", {
      class: "menu-item",
      onClick: () => { this._editing = null; this._mode = "edit"; this.render(); },
      style: { marginTop: "8px" },
    }, [ h("span", { class: "menu-item__icon" }, icon("plus")), "Create new label" ]));
  }
  _renderEdit() {
    const lb = this._editing;
    const nameInput = h("input", { class: "input", value: lb?.name || "", placeholder: "Label name" });
    let pickColor = lb?.color || "blue";
    const preview = h("div", { class: "label-chip", style: { background: `var(--label-${pickColor})`, marginBottom: "10px" } }, nameInput.value || "Label preview");
    nameInput.addEventListener("input", () => { preview.textContent = nameInput.value || "Label preview"; });

    const swatchGrid = h("div", { class: "swatch-grid" });
    for (const c of LABEL_COLORS) {
      const sw = h("button", { class: "swatch" + (c === pickColor ? " is-selected" : ""), style: { background: `var(--label-${c})` }, onClick: () => {
        pickColor = c;
        preview.style.background = `var(--label-${c})`;
        for (const s of swatchGrid.children) s.classList.remove("is-selected");
        sw.classList.add("is-selected");
      } });
      swatchGrid.appendChild(sw);
    }

    this.el.appendChild(h("div", { class: "menu-label" }, lb ? "Edit label" : "Create label"));
    this.el.appendChild(preview);
    this.el.appendChild(nameInput);
    this.el.appendChild(h("div", { style: { height: "8px" } }));
    this.el.appendChild(h("div", { class: "menu-label" }, "Color"));
    this.el.appendChild(swatchGrid);
    this.el.appendChild(h("div", { style: { height: "10px" } }));
    const actions = h("div", { style: { display: "flex", gap: "8px" } }, [
      h("button", { class: "btn btn-ghost", onClick: () => { this._mode = "list"; this._editing = null; this.render(); } }, "Back"),
      h("button", { class: "btn btn-primary", style: { flex: "1" }, onClick: () => {
        this.state.upsertLabel(this.board.id, { id: lb?.id, name: nameInput.value.trim(), color: pickColor });
        this.board = this.state.findBoard(this.board.id);
        this.card = this.state.findCard(this.board.id, this.card.listId, this.card.id);
        this._mode = "list"; this._editing = null; this.render();
      } }, lb ? "Save" : "Create"),
    ]);
    if (lb) actions.appendChild(h("button", { class: "btn btn-danger", onClick: () => {
      this.state.deleteLabel(this.board.id, lb.id);
      this.board = this.state.findBoard(this.board.id);
      this.card = this.state.findCard(this.board.id, this.card.listId, this.card.id);
      this._mode = "list"; this._editing = null; this.render();
    } }, icon("trash")));
    this.el.appendChild(actions);
  }
}

/* ---------------------------- DuePicker ---------------------------- */
export class DuePicker {
  constructor({ card, board, state }) {
    this.card = card; this.board = board; this.state = state;
    this.el = h("div", { class: "date-picker" });
    this.render();
  }
  render() {
    clear(this.el);
    const initialDate = this.card.dueAt ? new Date(this.card.dueAt) : new Date();
    const dateStr = initialDate.toISOString().slice(0, 10);
    const timeStr = this.card.dueAt
      ? initialDate.toTimeString().slice(0, 5)
      : "17:00";

    const dInput = h("input", { type: "date", value: dateStr });
    const tInput = h("input", { type: "time", value: timeStr });

    this.el.appendChild(h("div", { class: "date-picker__row" }, [
      h("div", { class: "menu-label" }, "Date"),
      dInput,
    ]));
    this.el.appendChild(h("div", { class: "date-picker__row" }, [
      h("div", { class: "menu-label" }, "Time"),
      tInput,
    ]));

    const save = () => {
      if (!dInput.value) return;
      const dt = new Date(dInput.value + "T" + (tInput.value || "17:00"));
      this.state.setCardDue(this.board.id, this.card.listId, this.card.id, dt.getTime());
    };
    const remove = () => this.state.setCardDue(this.board.id, this.card.listId, this.card.id, null);

    this.el.appendChild(h("div", { style: { display: "flex", gap: "8px", marginTop: "12px" } }, [
      h("button", { class: "btn btn-primary", style: { flex: "1" }, onClick: save }, "Set due date"),
      this.card.dueAt ? h("button", { class: "btn btn-danger", onClick: remove }, icon("trash")) : null,
    ]));

    // Quick presets
    const presets = [
      { label: "Today 5pm", days: 0, hour: 17 },
      { label: "Tomorrow 9am", days: 1, hour: 9 },
      { label: "+3 days", days: 3, hour: 17 },
      { label: "+1 week", days: 7, hour: 17 },
    ];
    const ph = h("div", { class: "menu-label", style: { marginTop: "12px" } }, "Quick set");
    this.el.appendChild(ph);
    const row = h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } });
    for (const p of presets) {
      row.appendChild(h("button", { class: "btn btn-sm btn-ghost", style: { background: "var(--bg-input)" }, onClick: () => {
        const d = new Date();
        d.setDate(d.getDate() + p.days);
        d.setHours(p.hour, 0, 0, 0);
        this.state.setCardDue(this.board.id, this.card.listId, this.card.id, d.getTime());
      } }, p.label));
    }
    this.el.appendChild(row);
  }
}

/* ---------------------------- CoverPicker ---------------------------- */
const COVER_COLORS = ["#4dd6c1","#7fb6ff","#c79bff","#ff8fcb","#ffd56b","#ff9f6b","#6ddc9c","#80e2f0","#c7e96a","#ff7a8a","#94a4be","#5b6a83"];
export class CoverPicker {
  constructor({ card, board, state }) {
    this.card = card; this.board = board; this.state = state;
    this.el = h("div", { class: "bg-picker" });
    this.render();
  }
  render() {
    clear(this.el);
    this.el.appendChild(h("div", { class: "menu-label" }, "Color cover"));
    const grid = h("div", { class: "bg-picker__grid" });
    for (const c of COVER_COLORS) {
      const isOn = this.card.cover && this.card.cover.color === c;
      const sw = h("button", { class: "bg-tile" + (isOn ? " is-selected" : ""), style: { background: c }, onClick: () => {
        const full = this.card.cover?.full || false;
        this.state.updateCard(this.board.id, this.card.listId, this.card.id, { cover: { color: c, full } });
        this.card = this.state.findCard(this.board.id, this.card.listId, this.card.id);
        this.render();
      } });
      grid.appendChild(sw);
    }
    this.el.appendChild(grid);

    this.el.appendChild(h("div", { class: "menu-label", style: { marginTop: "10px" } }, "Size"));
    const row = h("div", { style: { display: "flex", gap: "6px" } }, [
      h("button", {
        class: "btn btn-sm" + (!this.card.cover?.full ? " btn-primary" : " btn-ghost"),
        onClick: () => { if (!this.card.cover) return; this.state.updateCard(this.board.id, this.card.listId, this.card.id, { cover: { ...this.card.cover, full: false } }); this.card = this.state.findCard(this.board.id, this.card.listId, this.card.id); this.render(); },
        style: { flex: "1", background: this.card.cover?.full ? "var(--bg-input)" : "" },
      }, "Half"),
      h("button", {
        class: "btn btn-sm" + (this.card.cover?.full ? " btn-primary" : " btn-ghost"),
        onClick: () => { if (!this.card.cover) return; this.state.updateCard(this.board.id, this.card.listId, this.card.id, { cover: { ...this.card.cover, full: true } }); this.card = this.state.findCard(this.board.id, this.card.listId, this.card.id); this.render(); },
        style: { flex: "1", background: !this.card.cover?.full ? "var(--bg-input)" : "" },
      }, "Full"),
    ]);
    this.el.appendChild(row);
    if (this.card.cover) {
      this.el.appendChild(h("div", { style: { height: "8px" } }));
      this.el.appendChild(h("button", { class: "btn btn-danger btn-block", onClick: () => {
        this.state.updateCard(this.board.id, this.card.listId, this.card.id, { cover: null });
        this.card = this.state.findCard(this.board.id, this.card.listId, this.card.id);
        this.render();
      } }, [icon("trash"), "Remove cover"]));
    }
  }
}

/* -------------------------- BackgroundPicker --------------------------- */
export const BG_GRADIENTS = [
  "linear-gradient(135deg, #1b3a5f 0%, #4f3573 100%)",
  "linear-gradient(135deg, #3a2a5e 0%, #d54e6d 100%)",
  "linear-gradient(135deg, #0d3b3a 0%, #1e8a72 100%)",
  "linear-gradient(135deg, #1a1f3a 0%, #2c5364 100%)",
  "linear-gradient(135deg, #3a3a5e 0%, #b46060 100%)",
  "linear-gradient(135deg, #2a4365 0%, #1a2942 100%)",
  "linear-gradient(135deg, #5a2c7a 0%, #1c2c4f 100%)",
  "linear-gradient(135deg, #5e2c52 0%, #d5984e 100%)",
  "linear-gradient(135deg, #0b5d57 0%, #134e85 100%)",
];
export const BG_COLORS = ["#4dd6c1","#7fb6ff","#c79bff","#ff8fcb","#ffd56b","#ff9f6b","#6ddc9c","#80e2f0","#5b6a83"];

export class BackgroundPicker {
  constructor({ current, onChange }) {
    this.current = current;
    this.onChange = onChange;
    this.el = h("div", { class: "bg-picker" });
    this.render();
  }
  render() {
    clear(this.el);
    this.el.appendChild(h("div", { class: "menu-label" }, "Gradients"));
    const grad = h("div", { class: "bg-picker__grid" });
    for (const g of BG_GRADIENTS) {
      const isOn = this.current?.type === "gradient" && this.current?.value === g;
      grad.appendChild(h("button", { class: "bg-tile" + (isOn ? " is-selected" : ""), style: { background: g }, onClick: () => {
        this.current = { type: "gradient", value: g };
        this.onChange?.(this.current);
        this.render();
      } }));
    }
    this.el.appendChild(grad);
    this.el.appendChild(h("div", { class: "menu-label", style: { marginTop: "10px" } }, "Solid colors"));
    const grid = h("div", { class: "bg-picker__grid" });
    for (const c of BG_COLORS) {
      const isOn = this.current?.type === "color" && this.current?.value === c;
      grid.appendChild(h("button", { class: "bg-tile" + (isOn ? " is-selected" : ""), style: { background: c }, onClick: () => {
        this.current = { type: "color", value: c };
        this.onChange?.(this.current);
        this.render();
      } }));
    }
    this.el.appendChild(grid);
  }
}

/* ---------------------------- FilterPanel ---------------------------- */
export class FilterPanel {
  constructor({ board, state }) {
    this.board = board; this.state = state;
    this.el = h("div", { class: "filter-panel" });
    this._mode = "filter";
    this._editing = null;
    this.render();
  }
  render() {
    clear(this.el);
    if (this._mode === "edit") return this._renderEditLabel();
    this._renderFilter();
  }
  _renderFilter() {
    const s = this.state;
    /* Search row */
    const search = h("input", { class: "input", placeholder: "Search cards…", value: s.filter.search });
    search.addEventListener("input", () => s.setFilter({ search: search.value }));
    this.el.appendChild(h("div", { class: "filter-group" }, [
      h("div", { class: "filter-group__title" }, "Keyword"),
      search,
    ]));

    /* Labels */
    const lbsGroup = h("div", { class: "filter-group" }, [ h("div", { class: "filter-group__title" }, "Labels") ]);
    // Refresh board ref in case labels changed
    this.board = s.findBoard(this.board.id) || this.board;
    for (const lb of this.board.labels) {
      const on = s.filter.labelIds.has(lb.id);
      const chip = h("div", { class: "label-picker__chip", style: { background: `var(--label-${lb.color})` } }, lb.name || " ");
      const row = h("div", { class: "filter-row", onClick: () => { s.toggleFilterLabel(lb.id); this.render(); } }, [
        h("div", { class: "label-picker__check" + (on ? " is-checked" : "") }, icon("check")),
        h("div", { class: "filter-row__text" + (on ? " is-checked" : ""), style: { display: "flex", minWidth: "0" } }, [chip]),
        h("button", { class: "label-picker__edit", title: "Edit label", onClick: (e) => { e.stopPropagation(); this._editing = lb; this._mode = "edit"; this.render(); } }, icon("edit")),
      ]);
      lbsGroup.appendChild(row);
    }
    // Create label
    lbsGroup.appendChild(h("button", {
      class: "menu-item", style: { marginTop: "4px" },
      onClick: () => { this._editing = null; this._mode = "edit"; this.render(); },
    }, [ h("span", { class: "menu-item__icon" }, icon("plus")), "Create new label" ]));
    this.el.appendChild(lbsGroup);

    /* Due */
    const dueGroup = h("div", { class: "filter-group" }, [ h("div", { class: "filter-group__title" }, "Due date") ]);
    for (const opt of [
      { id: "overdue", label: "Overdue" },
      { id: "soon", label: "Due within 24h" },
      { id: "done", label: "Completed" },
      { id: "none", label: "No due date" },
    ]) {
      const on = s.filter.due === opt.id;
      dueGroup.appendChild(h("button", { class: "filter-row", onClick: () => { s.setFilter({ due: on ? null : opt.id }); this.render(); } }, [
        h("div", { class: "label-picker__check" + (on ? " is-checked" : "") }, icon("check")),
        h("div", { class: "filter-row__text" + (on ? " is-checked" : "") }, opt.label),
      ]));
    }
    this.el.appendChild(dueGroup);

    /* Clear */
    if (s.hasActiveFilter()) {
      this.el.appendChild(h("button", { class: "btn btn-ghost btn-block", style: { background: "var(--bg-input)" }, onClick: () => { s.clearFilter(); this.render(); } }, "Clear all filters"));
    }
  }
  _renderEditLabel() {
    const lb = this._editing;
    const nameInput = h("input", { class: "input", value: lb?.name || "", placeholder: "Label name" });
    let pickColor = lb?.color || "blue";
    const preview = h("div", { class: "label-chip", style: { background: `var(--label-${pickColor})`, marginBottom: "10px" } }, nameInput.value || "Label preview");
    nameInput.addEventListener("input", () => { preview.textContent = nameInput.value || "Label preview"; });

    const swatchGrid = h("div", { class: "swatch-grid" });
    for (const c of LABEL_COLORS) {
      const sw = h("button", { class: "swatch" + (c === pickColor ? " is-selected" : ""), style: { background: `var(--label-${c})` }, onClick: () => {
        pickColor = c;
        preview.style.background = `var(--label-${c})`;
        for (const s of swatchGrid.children) s.classList.remove("is-selected");
        sw.classList.add("is-selected");
      } });
      swatchGrid.appendChild(sw);
    }

    this.el.appendChild(h("div", { class: "menu-label" }, lb ? "Edit label" : "Create label"));
    this.el.appendChild(preview);
    this.el.appendChild(nameInput);
    this.el.appendChild(h("div", { style: { height: "8px" } }));
    this.el.appendChild(h("div", { class: "menu-label" }, "Color"));
    this.el.appendChild(swatchGrid);
    this.el.appendChild(h("div", { style: { height: "10px" } }));
    const actions = h("div", { style: { display: "flex", gap: "8px" } }, [
      h("button", { class: "btn btn-ghost", onClick: () => { this._mode = "filter"; this._editing = null; this.render(); } }, "Back"),
      h("button", { class: "btn btn-primary", style: { flex: "1" }, onClick: () => {
        this.state.upsertLabel(this.board.id, { id: lb?.id, name: nameInput.value.trim(), color: pickColor });
        this.board = this.state.findBoard(this.board.id);
        this._mode = "filter"; this._editing = null; this.render();
      } }, lb ? "Save" : "Create"),
    ]);
    if (lb) actions.appendChild(h("button", { class: "btn btn-danger", onClick: () => {
      this.state.deleteLabel(this.board.id, lb.id);
      this.board = this.state.findBoard(this.board.id);
      this._mode = "filter"; this._editing = null; this.render();
    } }, icon("trash")));
    this.el.appendChild(actions);
  }
}
