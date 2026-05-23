/**
 * Home view: when no board is selected, show the current workspace's boards
 * (or all workspaces if there's no current).
 */

import { h, icon, clear, initials } from "../utils/dom.js";
import { boardSwatchStyle } from "./sidebar.js";
import { openPopover, closePopover, toast } from "../utils/ui.js";
import { BackgroundPicker } from "./pickers.js";

export class Home {
  constructor(state) {
    this.state = state;
    this.el = h("div", { class: "home" });
  }
  render() {
    clear(this.el);
    const s = this.state;
    const ws = s.currentWorkspace || s.workspaces[0];
    const container = h("div", { class: "home__container slide-up" });
    this.el.appendChild(container);

    if (!ws) {
      container.appendChild(this._renderEmpty());
      return this.el;
    }

    // Header
    container.appendChild(h("div", { class: "home__header" }, [
      h("div", { class: "home__avatar", style: { background: ws.color } }, initials(ws.name)),
      h("div", {}, [
        h("h1", { class: "home__title" }, ws.name),
        h("div", { class: "home__sub" }, `${ws.boards.filter(b => !b.archived).length} board${ws.boards.length===1?"":"s"} · created ${new Date(ws.createdAt).toLocaleDateString()}`),
      ]),
    ]));

    // Starred
    const starred = ws.boards.filter(b => b.starred && !b.archived);
    if (starred.length) {
      container.appendChild(this._renderSection("Starred boards", "star", starred, false));
    }

    // All
    const all = ws.boards.filter(b => !b.archived);
    container.appendChild(this._renderSection("All boards", "board", all, true));

    // Archived
    const archived = ws.boards.filter(b => b.archived);
    if (archived.length) {
      container.appendChild(this._renderSection("Archived", "archive", archived, false));
    }

    return this.el;
  }

  _renderSection(title, iconName, boards, withNew) {
    const section = h("div", { class: "home__section" });
    section.appendChild(h("div", { class: "home__section-head" }, [
      h("div", { class: "home__section-icon" }, icon(iconName)),
      h("div", { class: "home__section-title" }, title),
    ]));
    const grid = h("div", { class: "home__grid" });
    for (const b of boards) grid.appendChild(this._renderTile(b));
    if (withNew) grid.appendChild(this._renderNewTile());
    section.appendChild(grid);
    return section;
  }

  _renderTile(board) {
    const style = boardSwatchStyle(board);
    const tile = h("button", {
      class: "board-tile",
      style: { ...style },
      onClick: () => this.state.openBoard(board.id),
    }, [
      h("div", { class: "board-tile__title" }, board.name),
      h("div", { class: "board-tile__foot" }, [
        h("span", {}, this._foot(board)),
        h("button", {
          class: "board-tile__star" + (board.starred ? " is-starred" : ""),
          onClick: (e) => { e.stopPropagation(); this.state.starBoard(board.id); },
          title: board.starred ? "Unstar" : "Star",
        }, icon(board.starred ? "star" : "starO")),
      ]),
    ]);
    if (style.background) tile.style.setProperty("--tile-bg", style.background);
    return tile;
  }

  _renderNewTile() {
    return h("button", {
      class: "board-tile is-new",
      onClick: (e) => this._openNewBoardPicker(e.currentTarget),
    }, [ icon("plus"), h("span", {}, "Create new board") ]);
  }

  _openNewBoardPicker(anchor) {
    const s = this.state;
    const wsId = (s.currentWorkspace || s.workspaces[0]).id;
    let chosen = { type: "gradient", value: "linear-gradient(135deg, #1b3a5f 0%, #4f3573 100%)" };
    const nameInput = h("input", { class: "input", placeholder: "Board title", value: "" });
    const picker = new BackgroundPicker({
      current: chosen,
      onChange: (bg) => { chosen = bg; preview.style.background = bg.value || bg; },
    });
    const preview = h("div", { class: "bg-tile", style: { height: "60px", background: chosen.value } });
    openPopover(anchor, [
      h("div", { class: "menu-label" }, "Title"),
      nameInput,
      h("div", { style: { height: "10px" } }),
      h("div", { class: "menu-label" }, "Background"),
      preview,
      h("div", { style: { height: "8px" } }),
      picker.el,
      h("div", { style: { height: "10px" } }),
      h("button", {
        class: "btn btn-primary btn-block",
        onClick: () => {
          const name = nameInput.value.trim() || "Untitled Board";
          const b = s.createBoard(wsId, { name, background: chosen });
          closePopover();
          s.openBoard(b.id);
          toast("Board created", { kind: "ok" });
        },
      }, "Create board"),
    ], { title: "New board", width: 280 });
    setTimeout(() => nameInput.focus(), 50);
  }

  _foot(board) {
    const lists = board.lists.length;
    const cards = board.lists.reduce((acc, l) => acc + l.cards.length, 0);
    return `${lists} list${lists===1?"":"s"} · ${cards} card${cards===1?"":"s"}`;
  }

  _renderEmpty() {
    return h("div", { class: "empty-state" }, [
      h("div", { class: "empty-state__art" }, icon("board")),
      h("div", { class: "empty-state__title" }, "Welcome to Trolley"),
      h("div", { class: "empty-state__msg" }, "Create your first workspace to start organizing boards, lists, and cards — all stored locally on your device."),
      h("button", {
        class: "btn btn-primary btn-lg",
        onClick: () => {
          const ws = this.state.createWorkspace("My Workspace");
          this.state.openWorkspace(ws.id);
        },
      }, [icon("plus"), "Create a workspace"]),
    ]);
  }
}
