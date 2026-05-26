/**
 * App entrypoint. Wires the State, Sidebar, Topbar, and Main content area.
 */

import { State } from "./state.js";
import { Sidebar } from "./views/sidebar.js";
import { Home } from "./views/home.js";
import { BoardView } from "./views/board.js";
import { h, icon, clear } from "./utils/dom.js";
import { closePopover, openPopover, promptDialog, toast } from "./utils/ui.js";
import { SyncClient } from "./sync.js";
import { showAuth } from "./auth.js";

class App {
  constructor(state) {
    this.state = state;

    // Apply theme on bootstrap
    document.documentElement.dataset.theme = this.state.theme;

    this.appEl = document.querySelector(".app");
    this._applySidebarClass();

    this.sidebar = new Sidebar(this.state);
    this.home = new Home(this.state);
    this.board = new BoardView(this.state);

    this.mainEl = document.querySelector(".main");
    this.topbar = this._buildTopbar();
    this.contentHost = h("div", { style: { flex: "1", display: "flex", flexDirection: "column", minHeight: "0", overflow: "hidden" } });
    this.mainEl.appendChild(this.topbar);
    this.mainEl.appendChild(this.contentHost);

    this.state.bus.on("*", (evt) => {
      if (evt === "ui:sidebar") this._applySidebarClass();
      if (/^(nav|board:updated|board:created|board:deleted)/.test(evt)) {
        this._renderTopbar();
        this._renderMain();
      }
      if (evt === "card:updated" || evt === "card:created" || evt === "card:deleted" || evt === "card:moved" || evt === "filter:changed") {
        // board view handles itself but topbar may show count
      }
    });
    this._renderMain();
    this._bindShortcuts();
  }

  _applySidebarClass() {
    this.appEl.classList.toggle("sidebar-collapsed", !!this.state.sidebarCollapsed);
  }

  _buildTopbar() {
    const tb = h("div", { class: "topbar" });
    this._renderTopbar(tb);
    return tb;
  }

  _renderTopbar(into) {
    const tb = into || this.topbar;
    clear(tb);
    const s = this.state;
    const board = s.currentBoard;
    const ws = s.currentWorkspace || s.workspaces[0];

    // Crumbs
    const crumbs = h("div", { class: "topbar__crumbs" });
    if (ws) {
      crumbs.appendChild(h("button", {
        class: "crumb" + (!board ? " is-current" : ""),
        onClick: () => s.openWorkspace(ws.id),
      }, ws.name));
    }
    if (board) {
      crumbs.appendChild(h("span", { class: "crumb-sep" }, "/"));
      crumbs.appendChild(h("button", { class: "crumb is-current" }, board.name));
    }
    tb.appendChild(crumbs);

    tb.appendChild(h("div", { class: "topbar__spacer" }));

    // Actions
    const actions = h("div", { class: "topbar__actions" });

    const searchWrap = h("div", { class: "search" }, [
      icon("search"),
      h("input", {
        placeholder: board ? "Search this board…" : "Search…",
        value: s.filter.search || "",
        oninput: (e) => s.setFilter({ search: e.target.value }),
        onkeydown: (e) => { if (e.key === "Escape") { e.target.value = ""; s.setFilter({ search: "" }); } },
      }),
      h("kbd", {}, "/"),
    ]);
    actions.appendChild(searchWrap);

    if (board) {
      const addCardBtn = h("button", { class: "btn btn-primary btn-sm", onClick: () => this._quickAddCard(board) }, [icon("plus"), "New card"]);
      actions.appendChild(addCardBtn);
    } else {
      const newBoardBtn = h("button", { class: "btn btn-primary btn-sm", onClick: () => {
        if (!ws) {
          const w = s.createWorkspace("My Workspace");
          s.openWorkspace(w.id);
        } else {
          const b = s.createBoard(ws.id);
          s.openBoard(b.id);
        }
      } }, [icon("plus"), "New board"]);
      actions.appendChild(newBoardBtn);
    }

    // Connection status + account menu
    const statusDot = h("span", {
      class: "conn-dot conn-dot--" + (this.connStatus || "online"),
      title: (this.connStatus === "offline" ? "Disconnected — reconnecting…" : "Connected"),
    });
    const userBtn = h("button", { class: "btn btn-ghost btn-sm user-chip", title: "Account" }, [
      statusDot,
      h("span", {}, this.state.user?.username || "Account"),
    ]);
    userBtn.addEventListener("click", () => {
      openPopover(userBtn, [
        h("button", { class: "menu-item", onClick: async () => {
          closePopover();
          await this.state.sync.logout();
          location.reload();
        } }, [icon("close"), "Log out"]),
      ], { title: this.state.user?.username || "Account", width: 180 });
    });
    actions.appendChild(userBtn);

    tb.appendChild(actions);
  }

  setConnStatus(status) {
    this.connStatus = status;
    this._renderTopbar();
  }

  _renderMain() {
    clear(this.contentHost);
    const s = this.state;
    if (s.currentBoardId && s.currentBoard) {
      this.board.render();
      this.contentHost.appendChild(this.board.el);
    } else {
      this.contentHost.appendChild(this.home.render());
    }
  }

  _quickAddCard(board) {
    const list = board.lists[0];
    if (!list) {
      const l = this.state.createList(board.id, "To Do");
      this._addCardToList(board, l);
    } else {
      this._addCardToList(board, list);
    }
  }
  _addCardToList(board, list) {
    promptDialog({
      title: `Add card to "${list.name}"`,
      placeholder: "Card title",
      confirmLabel: "Add card",
      onConfirm: (title) => this.state.createCard(board.id, list.id, title),
    });
  }

  _bindShortcuts() {
    document.addEventListener("keydown", (e) => {
      // Don't intercept in inputs
      const t = e.target;
      const inField = t.matches?.("input,textarea") || t.isContentEditable;
      if (inField) {
        if (e.key === "Escape") t.blur();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        const inp = this.topbar.querySelector(".search input");
        inp?.focus();
        inp?.select();
      }
      if (e.key === "n" || e.key === "N") {
        if (this.state.currentBoard) {
          e.preventDefault();
          this._quickAddCard(this.state.currentBoard);
        }
      }
      if (e.key === "Escape") closePopover();
    });
  }
}

/**
 * Boot sequence for the shared-server build:
 *   1. Check for an existing session.
 *   2. If none, show the login/register gate.
 *   3. Open the WebSocket, get the initial shared tree, then mount the app.
 *   4. Live updates from other users replace the tree and re-render.
 */
async function boot() {
  const sync = new SyncClient();
  let user = await sync.me();
  if (!user) {
    user = await new Promise((resolve) => showAuth(sync, resolve));
  }

  let initial;
  try {
    initial = await sync.connect();
  } catch {
    toast("Could not connect to the server.", { kind: "warn", duration: 6000 });
    return;
  }

  const state = new State({ sync, user });
  state.hydrate(initial);

  const app = new App(state);

  sync.onRemoteState((workspaces) => state.applyRemote(workspaces));
  sync.onStatus((status) => app.setConnStatus(status));
}

window.addEventListener("DOMContentLoaded", boot);
