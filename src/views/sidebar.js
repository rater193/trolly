/**
 * Sidebar view: brand, current workspace, board lists, theme toggle.
 */

import { h, icon, clear, initials, colorFromStr, makeInlineEditable } from "../utils/dom.js";
import { openPopover, closePopover, confirmDialog, promptDialog, choiceDialog, toast } from "../utils/ui.js";

export class Sidebar {
  constructor(state) {
    this.state = state;
    this.el = document.querySelector(".sidebar");
    this.state.bus.on("*", (evt) => {
      if (/(workspace|board|nav|ui:sidebar|theme)/.test(evt)) this.render();
    });
    this.render();
  }

  render() {
    const s = this.state;
    clear(this.el);

    /* Header */
    const header = h("div", { class: "sidebar__header" }, [
      h("div", { class: "brand" }, [
        h("div", { class: "brand__mark" }, icon("board")),
        h("div", { class: "brand__name" }, "Trolley"),
      ]),
      h("button", {
        class: "sidebar__toggle", title: "Collapse sidebar",
        onClick: () => s.toggleSidebar(),
      }, icon("sidebar")),
    ]);

    /* Body */
    const body = h("div", { class: "sidebar__body" });

    // Workspaces section
    const wsSection = h("div", { class: "sidebar__section" });
    wsSection.appendChild(h("div", { class: "sidebar__section-header" }, [
      h("span", {}, "Workspaces"),
      h("button", {
        class: "sidebar__section-add", title: "New workspace",
        onClick: () => this._promptNewWorkspace(),
      }, icon("plus")),
    ]));

    for (const ws of s.workspaces) {
      wsSection.appendChild(this._renderWorkspaceBlock(ws));
    }

    body.appendChild(wsSection);

    // Starred section
    const starred = [];
    for (const ws of s.workspaces) for (const b of ws.boards) if (b.starred && !b.archived) starred.push({ ws, b });
    if (starred.length) {
      const star = h("div", { class: "sidebar__section" });
      star.appendChild(h("div", { class: "sidebar__section-header" }, [h("span", {}, "Starred")]));
      for (const { ws, b } of starred) star.appendChild(this._renderBoardPill(ws, b));
      body.appendChild(star);
    }

    /* Footer */
    const footer = h("div", { class: "sidebar__footer" }, [
      h("button", {
        class: "theme-toggle", title: "Toggle theme",
        onClick: () => s.setTheme(s.theme === "dark" ? "light" : "dark"),
      }, [
        icon(s.theme === "dark" ? "sun" : "moon"),
        h("span", {}, s.theme === "dark" ? "Light mode" : "Dark mode"),
      ]),
      h("button", {
        class: "btn-icon", title: "Export / Import / Reset",
        onClick: (e) => this._openDataMenu(e.currentTarget),
      }, icon("more")),
    ]);

    this.el.appendChild(header);
    this.el.appendChild(body);
    this.el.appendChild(footer);
  }

  _renderWorkspaceBlock(ws) {
    const block = h("div", { class: "ws-block" + (ws.collapsed ? " is-collapsed" : "") });
    const head = h("div", { class: "ws-block__head", onClick: () => this.state.openWorkspace(ws.id) }, [
      h("div", { class: "ws-block__avatar", style: { background: ws.color } }, initials(ws.name)),
      h("div", { class: "ws-block__name" }, ws.name),
      h("button", {
        class: "btn-icon", title: "Workspace menu",
        style: { width: "22px", height: "22px" },
        onClick: (e) => { e.stopPropagation(); this._openWorkspaceMenu(e.currentTarget, ws); },
      }, icon("more")),
      (() => {
        const chev = h("button", {
          class: "ws-block__chev",
          title: ws.collapsed ? "Expand boards" : "Collapse boards",
          onClick: (e) => { e.stopPropagation(); this.state.toggleWorkspaceCollapsed(ws.id); },
        });
        chev.appendChild(icon("chevronD"));
        return chev;
      })(),
    ]);
    const boards = h("div", { class: "ws-block__boards" });

    // Estimate inner height for transition target
    if (!ws.collapsed) boards.style.maxHeight = (ws.boards.filter(b => !b.archived).length * 32 + 36) + "px";
    else boards.style.maxHeight = "0px";

    for (const b of ws.boards) {
      if (b.archived) continue;
      boards.appendChild(this._renderBoardPill(ws, b));
    }
    boards.appendChild(h("button", {
      class: "ws-block__action",
      onClick: () => this._promptNewBoard(ws.id),
    }, [ icon("plus"), " New board" ]));

    block.appendChild(head);
    block.appendChild(boards);
    return block;
  }

  _renderBoardPill(ws, board) {
    const active = this.state.currentBoardId === board.id;
    const swatch = h("div", { class: "board-pill__swatch" });
    Object.assign(swatch.style, boardSwatchStyle(board));
    const star = h("button", {
      class: "board-pill__star" + (board.starred ? " is-starred" : ""),
      title: board.starred ? "Unstar" : "Star",
      onClick: (e) => { e.stopPropagation(); this.state.starBoard(board.id); },
    }, icon(board.starred ? "star" : "starO"));
    return h("button", {
      class: "board-pill" + (active ? " is-active" : ""),
      onClick: () => this.state.openBoard(board.id),
      onContextmenu: (e) => { e.preventDefault(); this._openBoardMenu(e.currentTarget, board); },
    }, [ swatch, h("span", { class: "board-pill__label" }, board.name), star ]);
  }

  _promptNewWorkspace() {
    promptDialog({
      title: "New workspace",
      placeholder: "Workspace name",
      confirmLabel: "Create",
      onConfirm: (name) => {
        const ws = this.state.createWorkspace(name);
        this.state.openWorkspace(ws.id);
        toast("Workspace created", { kind: "ok" });
      },
    });
  }

  _promptNewBoard(wsId) {
    const board = this.state.createBoard(wsId);
    this.state.openBoard(board.id);
    toast("Board created", { kind: "ok" });
  }

  _openWorkspaceMenu(anchor, ws) {
    openPopover(anchor, [
      h("button", { class: "menu-item", onClick: () => { this._renameWorkspace(ws); closePopover(); } }, [
        h("span", { class: "menu-item__icon" }, icon("edit")), "Rename workspace",
      ]),
      h("button", { class: "menu-item", onClick: () => { this._promptNewBoard(ws.id); closePopover(); } }, [
        h("span", { class: "menu-item__icon" }, icon("plus")), "New board",
      ]),
      h("div", { class: "menu-divider" }),
      h("button", {
        class: "menu-item is-danger",
        onClick: () => { closePopover(); this._deleteWorkspace(ws); },
      }, [ h("span", { class: "menu-item__icon" }, icon("trash")), "Delete workspace" ]),
    ], { title: ws.name });
  }
  _renameWorkspace(ws) {
    promptDialog({
      title: "Rename workspace",
      value: ws.name,
      placeholder: "Workspace name",
      onConfirm: (name) => this.state.renameWorkspace(ws.id, name),
    });
  }
  _deleteWorkspace(ws) {
    confirmDialog({
      title: `Delete "${ws.name}"?`,
      msg: `This permanently deletes the workspace and its ${ws.boards.length} board(s). This action cannot be undone.`,
      confirmLabel: "Delete workspace",
      danger: true,
      onConfirm: () => { this.state.deleteWorkspace(ws.id); toast("Workspace deleted"); },
    });
  }

  _openBoardMenu(anchor, board) {
    openPopover(anchor, [
      h("button", { class: "menu-item", onClick: () => { this.state.openBoard(board.id); closePopover(); } }, [
        h("span", { class: "menu-item__icon" }, icon("board")), "Open board",
      ]),
      h("button", { class: "menu-item", onClick: () => { this.state.duplicateBoard(board.id); closePopover(); toast("Board duplicated", { kind: "ok" }); } }, [
        h("span", { class: "menu-item__icon" }, icon("copy")), "Duplicate",
      ]),
      h("button", { class: "menu-item", onClick: () => { this.state.starBoard(board.id); closePopover(); } }, [
        h("span", { class: "menu-item__icon" }, icon(board.starred ? "starO" : "star")),
        board.starred ? "Unstar" : "Star",
      ]),
      h("div", { class: "menu-divider" }),
      h("button", { class: "menu-item is-danger", onClick: () => {
        closePopover();
        confirmDialog({
          title: `Delete "${board.name}"?`,
          msg: "All lists and cards on this board will be deleted permanently.",
          confirmLabel: "Delete board",
          danger: true,
          onConfirm: () => { this.state.deleteBoard(board.id); toast("Board deleted"); },
        });
      } }, [ h("span", { class: "menu-item__icon" }, icon("trash")), "Delete" ]),
    ], { title: board.name });
  }

  _openDataMenu(anchor) {
    openPopover(anchor, [
      h("div", { class: "menu-label" }, "Your data"),
      h("button", { class: "menu-item", onClick: () => { this.state.storage.exportJson(this.state.workspaces); closePopover(); toast("Exported your data", { kind: "ok" }); } }, [
        h("span", { class: "menu-item__icon" }, icon("download")), "Export to JSON",
      ]),
      h("button", { class: "menu-item", onClick: () => { closePopover(); this._importJson(); } }, [
        h("span", { class: "menu-item__icon" }, icon("upload")), "Import JSON",
      ]),
      h("div", { class: "menu-divider" }),
      h("button", { class: "menu-item is-danger", onClick: () => {
        closePopover();
        confirmDialog({
          title: "Reset everything?",
          msg: "Deletes all local workspaces, boards, lists, and cards. The seed workspace will be restored.",
          confirmLabel: "Yes, reset",
          danger: true,
          onConfirm: () => { this.state.storage.reset(); location.reload(); },
        });
      } }, [ h("span", { class: "menu-item__icon" }, icon("reset")), "Reset all data…" ]),
    ], { title: "Data" });
  }

  _importJson() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json";
    inp.addEventListener("change", async () => {
      const file = inp.files?.[0];
      if (!file) return;
      try {
        const wss = await this.state.storage.importJson(file);
        const apply = (replace) => {
          if (replace) this.state.workspaces = wss;
          else this.state.workspaces.push(...wss);
          this.state.persist();
          this.state.bus.emit("nav:changed");
          toast("Import complete", { kind: "ok" });
        };
        choiceDialog({
          title: "Import data",
          msg: "Replace your current data, or merge the imported workspaces alongside it?",
          choices: [
            { label: "Cancel" },
            { label: "Merge as new", onClick: () => apply(false) },
            { label: "Replace all", class: "btn-danger", onClick: () => apply(true) },
          ],
        });
      } catch (e) {
        toast("Import failed — not valid JSON");
      }
    });
    inp.click();
  }
}

/** Visual swatch for a board (gradient or color). */
export function boardSwatchStyle(board) {
  const bg = board.background || {};
  if (bg.type === "gradient") return { background: bg.value };
  if (bg.type === "color") return { background: bg.value };
  return { background: "#4dd6c1" };
}
