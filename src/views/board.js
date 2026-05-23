/**
 * Board view: header + horizontal lists scroller.
 * Owns the DragManager for cards and lists.
 */

import { h, icon, clear, formatDue, makeInlineEditable } from "../utils/dom.js";
import { DragManager } from "../utils/dnd.js";
import { openPopover, closePopover, toast, confirmDialog, promptDialog } from "../utils/ui.js";
import { LabelPicker, DuePicker, CoverPicker, BackgroundPicker, FilterPanel } from "./pickers.js";
import { CardModal } from "./cardModal.js";

export class BoardView {
  constructor(state) {
    this.state = state;
    this.el = h("div", { class: "board-area" });
    this.dnd = new DragManager({
      onCardDrop: ({ boardId, fromListId, toListId, cardId, toIndex }) => {
        this.state.moveCard(boardId, fromListId, cardId, toListId, toIndex);
      },
      onListDrop: ({ boardId, listId, toIndex }) => {
        this.state.moveList(boardId, listId, toIndex);
      },
      onChecklistItemDrop: ({ cardId, fromChecklistId, toChecklistId, itemId, toIndex }) => {
        const board = this.state.currentBoard;
        if (!board) return;
        // Find the card's list (it could be any list on current board)
        for (const list of board.lists) {
          if (list.cards.some(c => c.id === cardId)) {
            this.state.moveChecklistItem(board.id, list.id, cardId, fromChecklistId, itemId, toChecklistId, toIndex);
            return;
          }
        }
      },
    });

    // Re-render on board changes
    this.state.bus.on("*", (evt) => {
      if (!this.state.currentBoard) return;
      if (/^(card|list|board|filter|nav):/.test(evt)) this.render();
    });
  }

  render() {
    const board = this.state.currentBoard;
    if (!board) return this.el;
    clear(this.el);

    // Background
    const bg = board.background || {};
    this.el.style.setProperty("--board-bg", bg.value || "");
    this.el.style.setProperty("--board-bg-mix", bg.type === "gradient" ? "1" : (bg.type === "color" ? "1" : "0"));
    this.el.style.background = bg.value || "var(--bg-board)";

    // Header
    this.el.appendChild(this._renderHeader(board));

    // Lists
    const scroller = h("div", { class: "lists-scroller" });
    const lists = h("div", { class: "lists" });
    for (const list of board.lists) {
      if (list.archived) continue;
      lists.appendChild(this._renderList(board, list));
    }
    lists.appendChild(this._renderAddList(board));
    scroller.appendChild(lists);
    this.el.appendChild(scroller);

    return this.el;
  }

  _renderHeader(board) {
    const head = h("div", { class: "board-header" });

    // Title (editable)
    const title = h("h1", { class: "board-header__title" }, board.name);
    makeInlineEditable(title, { onCommit: (v) => this.state.renameBoard(board.id, v) });

    const star = h("button", {
      class: "board-header__star" + (board.starred ? " is-starred" : ""),
      title: board.starred ? "Unstar" : "Star",
      onClick: () => this.state.starBoard(board.id),
    }, icon(board.starred ? "star" : "starO"));

    const bgChip = h("button", { class: "board-header__chip", title: "Change background", onClick: (e) => this._openBgPicker(e.currentTarget, board) }, [
      icon("picture"), "Background",
    ]);

    const filterActive = this.state.hasActiveFilter();
    const filterChip = h("button", { class: "board-header__filter" + (filterActive ? " is-active" : ""), onClick: (e) => this._openFilterPanel(e.currentTarget, board) }, [
      icon("filter"), filterActive ? "Filtering" : "Filter",
    ]);

    const menuChip = h("button", { class: "board-header__filter", title: "Board menu", onClick: (e) => this._openBoardMenu(e.currentTarget, board) }, [
      icon("more"),
    ]);

    head.appendChild(title);
    head.appendChild(star);
    head.appendChild(h("div", { class: "board-header__spacer" }));
    head.appendChild(bgChip);
    head.appendChild(filterChip);
    head.appendChild(menuChip);
    return head;
  }

  _renderList(board, list) {
    const listEl = h("div", { class: "list", dataset: { listId: list.id } });

    // Header (also drag handle for the list)
    const header = h("div", { class: "list__header" }, [
      h("div", { class: "list__title" }, list.name),
      h("div", { class: "list__count" }, String(list.cards.length)),
      h("button", { class: "list__menu", title: "List actions", onClick: (e) => this._openListMenu(e.currentTarget, board, list) }, icon("more")),
    ]);
    makeInlineEditable(header.querySelector(".list__title"), { onCommit: (v) => this.state.renameList(board.id, list.id, v) });
    // pointerdown on header to begin list drag (but not on title input or menu)
    header.addEventListener("pointerdown", (e) => {
      if (e.target.closest("input,textarea,.list__menu,.list__title")) return;
      this.dnd.startList(e, { el: listEl, listId: list.id, boardId: board.id });
    });

    // Body
    const body = h("div", { class: "list__body" });
    for (const card of list.cards) {
      if (card.archived) continue;
      if (!this.state.cardMatchesFilter(card)) continue;
      body.appendChild(this._renderCard(board, list, card));
    }

    // Footer add-card
    const footer = h("div", { class: "list__footer" });
    const addBtn = h("button", { class: "list__add", onClick: () => this._showCardComposer(board, list, footer, addBtn) }, [
      icon("plus"), h("span", {}, "Add a card"),
    ]);
    footer.appendChild(addBtn);

    listEl.appendChild(header);
    listEl.appendChild(body);
    listEl.appendChild(footer);
    return listEl;
  }

  _showCardComposer(board, list, footer, addBtn) {
    addBtn.style.display = "none";
    const ta = h("textarea", { class: "composer__input", placeholder: "Enter a title for this card…" });
    const actions = h("div", { class: "composer__actions" }, [
      h("button", { class: "btn btn-primary", onClick: () => commit() }, "Add card"),
      h("button", { class: "composer__cancel", title: "Cancel", onClick: () => cancel() }, icon("close")),
    ]);
    const composer = h("div", { class: "composer" }, [ ta, actions ]);
    footer.appendChild(composer);
    setTimeout(() => ta.focus(), 50);
    const commit = () => {
      const v = ta.value.trim();
      if (v) {
        this.state.createCard(board.id, list.id, v);
        ta.value = "";
        setTimeout(() => ta.focus(), 50);
      }
    };
    const cancel = () => { composer.remove(); addBtn.style.display = ""; };
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
      if (e.key === "Escape") cancel();
    });
    ta.addEventListener("blur", () => {
      // small delay so clicks on Add card register
      setTimeout(() => { if (!ta.value.trim()) cancel(); }, 150);
    });
  }

  _renderCard(board, list, card) {
    const cardEl = h("div", { class: "card", dataset: { cardId: card.id } });

    // Cover
    if (card.cover) {
      const cov = h("div", { class: "card__cover" + (card.cover.full ? " is-full" : ""), style: { "--card-cover": card.cover.color, background: card.cover.color } });
      cardEl.appendChild(cov);
    }

    // Labels
    if (card.labelIds.length) {
      const labels = h("div", { class: "card__labels" });
      for (const lid of card.labelIds) {
        const lb = board.labels.find(l => l.id === lid);
        if (!lb) continue;
        const chip = h("div", { class: "card__label", style: { "--label-c": `var(--label-${lb.color})`, background: `var(--label-${lb.color})` } });
        chip.title = lb.name || "";
        labels.appendChild(chip);
      }
      cardEl.appendChild(labels);
    }

    // Title
    cardEl.appendChild(h("div", { class: "card__title" }, card.title));

    // Badges row
    const badges = h("div", { class: "card__badges" });
    const due = card.dueState();
    if (card.dueAt) {
      const cls = due === "overdue" ? " due-overdue" : due === "done" ? " due-done" : due === "soon" ? " due-soon" : "";
      const cb = h("button", { class: "card__badge" + cls, onClick: (e) => { e.stopPropagation(); this.state.toggleCardDueDone(board.id, list.id, card.id); } }, [
        icon(due === "done" ? "check" : "calendar"),
        h("span", {}, formatDue(card.dueAt)),
      ]);
      badges.appendChild(cb);
    }
    if (card.description) {
      badges.appendChild(h("span", { class: "card__badge", title: "Has description" }, [icon("list")]));
    }
    const cp = card.checklistProgress();
    if (cp.total) {
      const cls = cp.done === cp.total ? " checklists-done" : "";
      badges.appendChild(h("span", { class: "card__badge" + cls }, [icon("checklist"), h("span", {}, `${cp.done}/${cp.total}`)]));
    }
    if (card.comments.length) {
      badges.appendChild(h("span", { class: "card__badge" }, [icon("comment"), h("span", {}, String(card.comments.length))]));
    }
    if (badges.children.length) cardEl.appendChild(badges);

    // Quick edit icon on hover
    const editIcon = h("button", { class: "card__edit-icon", title: "Edit", onClick: (e) => {
      e.stopPropagation();
      promptDialog({
        title: "Edit card title",
        value: card.title,
        placeholder: "Card title",
        onConfirm: (title) => this.state.updateCard(board.id, list.id, card.id, { title }),
      });
    } }, icon("edit"));
    cardEl.appendChild(editIcon);

    // Click opens modal
    cardEl.addEventListener("click", (e) => {
      if (e.defaultPrevented) return;
      this._openCard(board, list, card);
    });

    // Drag begin on pointerdown
    cardEl.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button,a,input,textarea")) return;
      this.dnd.startCard(e, { el: cardEl, cardId: card.id, listId: list.id, boardId: board.id });
    });

    return cardEl;
  }

  _renderAddList(board) {
    const addBtn = h("button", { class: "add-list" }, [ icon("plus"), h("span", {}, "Add another list") ]);
    const wrap = h("div"); // unused
    addBtn.addEventListener("click", () => {
      const composer = h("div", { class: "add-list add-list--composer" });
      const ta = h("textarea", { class: "composer__input", placeholder: "Enter list title…" });
      const actions = h("div", { class: "composer__actions" }, [
        h("button", { class: "btn btn-primary", onClick: () => commit() }, "Add list"),
        h("button", { class: "composer__cancel", title: "Cancel", onClick: () => cancel() }, icon("close")),
      ]);
      composer.appendChild(ta);
      composer.appendChild(actions);
      addBtn.replaceWith(composer);
      setTimeout(() => ta.focus(), 50);
      const commit = () => {
        const v = ta.value.trim();
        if (v) { this.state.createList(board.id, v); ta.value = ""; setTimeout(() => ta.focus(), 50); }
      };
      const cancel = () => { composer.replaceWith(addBtn); };
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
        if (e.key === "Escape") cancel();
      });
      ta.addEventListener("blur", () => { setTimeout(() => { if (!ta.value.trim()) cancel(); }, 150); });
    });
    return addBtn;
  }

  /* ----------------------------- Popovers ----------------------------- */
  _openListMenu(anchor, board, list) {
    openPopover(anchor, [
      h("button", { class: "menu-item", onClick: () => {
        closePopover();
        // Trigger inline rename
        const titleEl = anchor.closest(".list").querySelector(".list__title");
        if (titleEl) titleEl.click();
      } }, [ h("span", { class: "menu-item__icon" }, icon("edit")), "Rename list" ]),
      h("button", { class: "menu-item", onClick: () => {
        closePopover();
        // Move all cards to next list
        const board2 = this.state.findBoard(board.id);
        const idx = board2.lists.findIndex(l => l.id === list.id);
        const target = board2.lists[idx + 1] || board2.lists[idx - 1];
        if (target) {
          for (const c of [...list.cards]) this.state.moveCard(board.id, list.id, c.id, target.id, target.cards.length);
          toast("Cards moved to " + target.name, { kind: "ok" });
        }
      } }, [ h("span", { class: "menu-item__icon" }, icon("send")), "Move all cards…" ]),
      h("div", { class: "menu-divider" }),
      h("button", { class: "menu-item is-danger", onClick: () => {
        closePopover();
        confirmDialog({
          title: `Delete "${list.name}"?`,
          msg: `This deletes the list and its ${list.cards.length} card(s).`,
          confirmLabel: "Delete list",
          danger: true,
          onConfirm: () => { this.state.deleteList(board.id, list.id); toast("List deleted"); },
        });
      } }, [ h("span", { class: "menu-item__icon" }, icon("trash")), "Delete list" ]),
    ], { title: list.name });
  }

  _openBgPicker(anchor, board) {
    const picker = new BackgroundPicker({
      current: board.background,
      onChange: (bg) => this.state.setBoardBackground(board.id, bg),
    });
    openPopover(anchor, picker.el, { title: "Board background", width: 280 });
  }

  _openFilterPanel(anchor, board) {
    const panel = new FilterPanel({ board, state: this.state });
    openPopover(anchor, panel.el, { title: "Filter cards", width: 320 });
  }

  _openBoardMenu(anchor, board) {
    openPopover(anchor, [
      h("button", { class: "menu-item", onClick: () => { closePopover(); this._openBgPicker(anchor, board); } }, [
        h("span", { class: "menu-item__icon" }, icon("picture")), "Change background",
      ]),
      h("button", { class: "menu-item", onClick: () => { this.state.duplicateBoard(board.id); closePopover(); toast("Board duplicated", { kind: "ok" }); } }, [
        h("span", { class: "menu-item__icon" }, icon("copy")), "Duplicate board",
      ]),
      h("button", { class: "menu-item", onClick: () => { this.state.starBoard(board.id); closePopover(); } }, [
        h("span", { class: "menu-item__icon" }, icon(board.starred ? "starO" : "star")),
        board.starred ? "Unstar board" : "Star board",
      ]),
      h("div", { class: "menu-divider" }),
      h("button", { class: "menu-item is-danger", onClick: () => {
        closePopover();
        confirmDialog({
          title: `Delete "${board.name}"?`,
          msg: "All lists and cards on this board will be permanently deleted.",
          confirmLabel: "Delete board",
          danger: true,
          onConfirm: () => { this.state.deleteBoard(board.id); toast("Board deleted"); },
        });
      } }, [ h("span", { class: "menu-item__icon" }, icon("trash")), "Delete board" ]),
    ], { title: board.name });
  }

  _openCard(board, list, card) {
    const modal = new CardModal({ state: this.state, board, list, card, dnd: this.dnd });
    modal.open();
  }
}
