/**
 * Central app state manager.
 *
 * Owns the workspace tree, current selection, UI flags.
 * All mutations should go through these methods so we can:
 *   - emit events for view re-render
 *   - persist to storage
 *   - record activity
 */

import { EventBus } from "./utils/events.js";
import { Storage } from "./storage.js";
import {
  Workspace, Board, List, Card, Label, Checklist, ChecklistItem
} from "./models.js";
import { uid } from "./utils/id.js";

export class State {
  constructor() {
    this.bus = new EventBus();
    this.storage = new Storage();
    const { workspaces } = this.storage.load();
    this.workspaces = workspaces;

    const ui = this.storage.loadUi();
    this.currentBoardId = ui.currentBoardId || null;
    this.currentWorkspaceId = ui.currentWorkspaceId || (this.workspaces[0] && this.workspaces[0].id) || null;
    this.sidebarCollapsed = !!ui.sidebarCollapsed;
    this.theme = this.storage.loadTheme();
    this.filter = { labelIds: new Set(), due: null, search: "" };

    // If a current board id is set, ensure it still exists; otherwise fall through to home.
    if (this.currentBoardId && !this.findBoard(this.currentBoardId)) {
      this.currentBoardId = null;
    }
  }

  /* --------------------------- Persistence --------------------------- */
  persist() {
    this.storage.save(this.workspaces);
    this.storage.saveUi({
      currentBoardId: this.currentBoardId,
      currentWorkspaceId: this.currentWorkspaceId,
      sidebarCollapsed: this.sidebarCollapsed,
    });
  }

  setTheme(t) {
    this.theme = t;
    this.storage.saveTheme(t);
    document.documentElement.dataset.theme = t;
    this.bus.emit("theme:changed", t);
  }

  /* --------------------------- Look-ups --------------------------- */
  findWorkspace(id) { return this.workspaces.find(w => w.id === id) || null; }
  findBoard(id) {
    for (const w of this.workspaces) {
      const b = w.boards.find(b => b.id === id);
      if (b) return b;
    }
    return null;
  }
  findBoardWorkspace(boardId) {
    return this.workspaces.find(w => w.boards.some(b => b.id === boardId)) || null;
  }
  findList(boardId, listId) {
    return this.findBoard(boardId)?.lists.find(l => l.id === listId) || null;
  }
  findCard(boardId, listId, cardId) {
    return this.findList(boardId, listId)?.cards.find(c => c.id === cardId) || null;
  }
  findCardByIdOnBoard(boardId, cardId) {
    const board = this.findBoard(boardId);
    if (!board) return null;
    for (const list of board.lists) {
      const c = list.cards.find(c => c.id === cardId);
      if (c) return { card: c, list };
    }
    return null;
  }

  get currentBoard() { return this.currentBoardId ? this.findBoard(this.currentBoardId) : null; }
  get currentWorkspace() { return this.currentWorkspaceId ? this.findWorkspace(this.currentWorkspaceId) : null; }

  /* --------------------------- Navigation --------------------------- */
  openBoard(boardId) {
    this.currentBoardId = boardId;
    const ws = this.findBoardWorkspace(boardId);
    if (ws) this.currentWorkspaceId = ws.id;
    this.filter = { labelIds: new Set(), due: null, search: "" };
    this.persist();
    this.bus.emit("nav:changed");
  }
  openWorkspace(workspaceId) {
    this.currentWorkspaceId = workspaceId;
    this.currentBoardId = null;
    this.persist();
    this.bus.emit("nav:changed");
  }
  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.persist();
    this.bus.emit("ui:sidebar");
  }
  toggleWorkspaceCollapsed(wsId) {
    const w = this.findWorkspace(wsId);
    if (w) { w.collapsed = !w.collapsed; this.persist(); this.bus.emit("workspace:updated", w); }
  }

  /* --------------------------- Workspaces --------------------------- */
  createWorkspace(name = "New Workspace", color = "#4dd6c1") {
    const ws = new Workspace({ name, color });
    this.workspaces.push(ws);
    this.persist();
    this.bus.emit("workspace:created", ws);
    return ws;
  }
  renameWorkspace(wsId, name) {
    const w = this.findWorkspace(wsId);
    if (w) { w.name = name; this.persist(); this.bus.emit("workspace:updated", w); }
  }
  deleteWorkspace(wsId) {
    const idx = this.workspaces.findIndex(w => w.id === wsId);
    if (idx === -1) return;
    this.workspaces.splice(idx, 1);
    if (this.currentWorkspaceId === wsId) {
      this.currentWorkspaceId = this.workspaces[0]?.id || null;
      this.currentBoardId = null;
    }
    this.persist();
    this.bus.emit("workspace:deleted", wsId);
    this.bus.emit("nav:changed");
  }

  /* --------------------------- Boards --------------------------- */
  createBoard(workspaceId, opts = {}) {
    const ws = this.findWorkspace(workspaceId);
    if (!ws) return null;
    const board = new Board({ workspaceId, ...opts });
    // Seed with a few empty lists for usability
    board.lists = (opts.lists || ["To Do", "Doing", "Done"]).map(n => new List({ boardId: board.id, name: n }));
    ws.boards.push(board);
    this.persist();
    this.bus.emit("board:created", board);
    return board;
  }
  renameBoard(boardId, name) {
    const b = this.findBoard(boardId);
    if (b) { b.name = name; this.persist(); this.bus.emit("board:updated", b); }
  }
  setBoardBackground(boardId, background) {
    const b = this.findBoard(boardId);
    if (b) { b.background = background; this.persist(); this.bus.emit("board:updated", b); }
  }
  starBoard(boardId, starred = null) {
    const b = this.findBoard(boardId);
    if (b) {
      b.starred = starred == null ? !b.starred : !!starred;
      this.persist();
      this.bus.emit("board:updated", b);
    }
  }
  deleteBoard(boardId) {
    const ws = this.findBoardWorkspace(boardId);
    if (!ws) return;
    ws.boards = ws.boards.filter(b => b.id !== boardId);
    if (this.currentBoardId === boardId) this.currentBoardId = null;
    this.persist();
    this.bus.emit("board:deleted", boardId);
    this.bus.emit("nav:changed");
  }
  duplicateBoard(boardId) {
    const b = this.findBoard(boardId);
    const ws = this.findBoardWorkspace(boardId);
    if (!b || !ws) return null;
    const copy = Board.fromJSON(b.toJSON());
    copy.id = uid("b");
    copy.name = b.name + " (copy)";
    copy.lists.forEach(l => {
      l.id = uid("ls"); l.boardId = copy.id;
      l.cards.forEach(c => { c.id = uid("c"); c.listId = l.id; });
    });
    ws.boards.push(copy);
    this.persist();
    this.bus.emit("board:created", copy);
    return copy;
  }

  /* --------------------------- Labels --------------------------- */
  upsertLabel(boardId, { id, name, color }) {
    const b = this.findBoard(boardId);
    if (!b) return null;
    if (id) {
      const lb = b.labels.find(l => l.id === id);
      if (lb) { if (name !== undefined) lb.name = name; if (color) lb.color = color; }
      this.persist();
      this.bus.emit("board:updated", b);
      return lb;
    }
    const lb = new Label({ name, color });
    b.labels.push(lb);
    this.persist();
    this.bus.emit("board:updated", b);
    return lb;
  }
  deleteLabel(boardId, labelId) {
    const b = this.findBoard(boardId);
    if (!b) return;
    b.labels = b.labels.filter(l => l.id !== labelId);
    for (const list of b.lists) {
      for (const card of list.cards) {
        card.labelIds = card.labelIds.filter(id => id !== labelId);
      }
    }
    this.persist();
    this.bus.emit("board:updated", b);
  }

  /* --------------------------- Lists --------------------------- */
  createList(boardId, name) {
    const b = this.findBoard(boardId);
    if (!b) return null;
    const list = new List({ boardId, name: name || "New List" });
    b.lists.push(list);
    this.persist();
    this.bus.emit("list:created", { boardId, list });
    return list;
  }
  renameList(boardId, listId, name) {
    const l = this.findList(boardId, listId);
    if (l) { l.name = name; this.persist(); this.bus.emit("list:updated", { boardId, list: l }); }
  }
  deleteList(boardId, listId) {
    const b = this.findBoard(boardId);
    if (!b) return;
    b.lists = b.lists.filter(l => l.id !== listId);
    this.persist();
    this.bus.emit("list:deleted", { boardId, listId });
  }
  moveList(boardId, listId, toIndex) {
    const b = this.findBoard(boardId);
    if (!b) return;
    const fromIdx = b.lists.findIndex(l => l.id === listId);
    if (fromIdx === -1) return;
    const [item] = b.lists.splice(fromIdx, 1);
    b.lists.splice(Math.max(0, Math.min(toIndex, b.lists.length)), 0, item);
    this.persist();
    this.bus.emit("list:reordered", { boardId });
  }

  /* --------------------------- Cards --------------------------- */
  createCard(boardId, listId, title, opts = {}) {
    const list = this.findList(boardId, listId);
    if (!list) return null;
    const card = new Card({ listId, title, ...opts });
    list.cards.push(card);
    this._recordActivity(boardId, `added card "${title}" to ${list.name}`);
    this.persist();
    this.bus.emit("card:created", { boardId, listId, card });
    return card;
  }
  updateCard(boardId, listId, cardId, patch) {
    const card = this.findCard(boardId, listId, cardId);
    if (!card) return;
    Object.assign(card, patch);
    card.updatedAt = Date.now();
    this.persist();
    this.bus.emit("card:updated", { boardId, listId, card });
  }
  deleteCard(boardId, listId, cardId) {
    const list = this.findList(boardId, listId);
    if (!list) return;
    const card = list.cards.find(c => c.id === cardId);
    list.cards = list.cards.filter(c => c.id !== cardId);
    if (card) this._recordActivity(boardId, `deleted card "${card.title}"`);
    this.persist();
    this.bus.emit("card:deleted", { boardId, listId, cardId });
  }
  /** Move card to (toListId, toIndex). Both lists must exist on same board. */
  moveCard(boardId, fromListId, cardId, toListId, toIndex) {
    const board = this.findBoard(boardId);
    if (!board) return;
    const from = board.lists.find(l => l.id === fromListId);
    const to = board.lists.find(l => l.id === toListId);
    if (!from || !to) return;
    const idx = from.cards.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    const [card] = from.cards.splice(idx, 1);
    card.listId = to.id;
    const insertAt = Math.max(0, Math.min(toIndex, to.cards.length));
    to.cards.splice(insertAt, 0, card);
    if (from !== to) this._recordActivity(boardId, `moved "${card.title}" from ${from.name} to ${to.name}`);
    this.persist();
    this.bus.emit("card:moved", { boardId, card });
  }

  toggleCardLabel(boardId, listId, cardId, labelId) {
    const card = this.findCard(boardId, listId, cardId);
    if (!card) return;
    const i = card.labelIds.indexOf(labelId);
    if (i === -1) card.labelIds.push(labelId);
    else card.labelIds.splice(i, 1);
    card.updatedAt = Date.now();
    this.persist();
    this.bus.emit("card:updated", { boardId, listId, card });
  }

  setCardDue(boardId, listId, cardId, dueAt) {
    const card = this.findCard(boardId, listId, cardId);
    if (!card) return;
    card.dueAt = dueAt;
    card.dueDone = false;
    card.updatedAt = Date.now();
    this.persist();
    this.bus.emit("card:updated", { boardId, listId, card });
  }
  toggleCardDueDone(boardId, listId, cardId) {
    const card = this.findCard(boardId, listId, cardId);
    if (!card || !card.dueAt) return;
    card.dueDone = !card.dueDone;
    this.persist();
    this.bus.emit("card:updated", { boardId, listId, card });
  }

  /* --------------------------- Checklists --------------------------- */
  addChecklist(boardId, listId, cardId, title = "Checklist") {
    const card = this.findCard(boardId, listId, cardId);
    if (!card) return null;
    const cl = new Checklist({ title });
    card.checklists.push(cl);
    this.persist();
    this.bus.emit("card:updated", { boardId, listId, card });
    return cl;
  }
  deleteChecklist(boardId, listId, cardId, checklistId) {
    const card = this.findCard(boardId, listId, cardId);
    if (!card) return;
    card.checklists = card.checklists.filter(c => c.id !== checklistId);
    this.persist();
    this.bus.emit("card:updated", { boardId, listId, card });
  }
  renameChecklist(boardId, listId, cardId, checklistId, title) {
    const card = this.findCard(boardId, listId, cardId);
    if (!card) return;
    const cl = card.checklists.find(c => c.id === checklistId);
    if (cl) { cl.title = title; this.persist(); this.bus.emit("card:updated", { boardId, listId, card }); }
  }
  addChecklistItem(boardId, listId, cardId, checklistId, text) {
    const card = this.findCard(boardId, listId, cardId);
    const cl = card?.checklists.find(c => c.id === checklistId);
    if (!cl) return;
    cl.items.push(new ChecklistItem({ text }));
    this.persist();
    this.bus.emit("card:updated", { boardId, listId, card });
  }
  updateChecklistItem(boardId, listId, cardId, checklistId, itemId, patch) {
    const card = this.findCard(boardId, listId, cardId);
    const cl = card?.checklists.find(c => c.id === checklistId);
    const item = cl?.items.find(i => i.id === itemId);
    if (!item) return;
    Object.assign(item, patch);
    this.persist();
    this.bus.emit("card:updated", { boardId, listId, card });
  }
  /** Move a checklist item between checklists (or within one) on the same card. */
  moveChecklistItem(boardId, listId, cardId, fromChecklistId, itemId, toChecklistId, toIndex) {
    const card = this.findCard(boardId, listId, cardId);
    if (!card) return;
    const from = card.checklists.find(c => c.id === fromChecklistId);
    const to = card.checklists.find(c => c.id === toChecklistId);
    if (!from || !to) return;
    const idx = from.items.findIndex(i => i.id === itemId);
    if (idx === -1) return;
    const [item] = from.items.splice(idx, 1);
    const insertAt = Math.max(0, Math.min(toIndex, to.items.length));
    to.items.splice(insertAt, 0, item);
    this.persist();
    this.bus.emit("card:updated", { boardId, listId, card });
  }

  deleteChecklistItem(boardId, listId, cardId, checklistId, itemId) {
    const card = this.findCard(boardId, listId, cardId);
    const cl = card?.checklists.find(c => c.id === checklistId);
    if (!cl) return;
    cl.items = cl.items.filter(i => i.id !== itemId);
    this.persist();
    this.bus.emit("card:updated", { boardId, listId, card });
  }

  /* --------------------------- Comments --------------------------- */
  addComment(boardId, listId, cardId, text) {
    const card = this.findCard(boardId, listId, cardId);
    if (!card) return;
    card.comments.push({ id: uid("cm"), text, ts: Date.now() });
    this.persist();
    this.bus.emit("card:updated", { boardId, listId, card });
  }
  deleteComment(boardId, listId, cardId, commentId) {
    const card = this.findCard(boardId, listId, cardId);
    if (!card) return;
    card.comments = card.comments.filter(c => c.id !== commentId);
    this.persist();
    this.bus.emit("card:updated", { boardId, listId, card });
  }

  /* --------------------------- Filter --------------------------- */
  setFilter(patch) {
    Object.assign(this.filter, patch);
    this.bus.emit("filter:changed");
  }
  toggleFilterLabel(labelId) {
    if (this.filter.labelIds.has(labelId)) this.filter.labelIds.delete(labelId);
    else this.filter.labelIds.add(labelId);
    this.bus.emit("filter:changed");
  }
  clearFilter() {
    this.filter = { labelIds: new Set(), due: null, search: "" };
    this.bus.emit("filter:changed");
  }
  hasActiveFilter() {
    return this.filter.labelIds.size > 0 || !!this.filter.due || !!this.filter.search;
  }
  cardMatchesFilter(card) {
    const f = this.filter;
    if (f.search) {
      const q = f.search.toLowerCase();
      const hay = (card.title + " " + (card.description || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.labelIds.size) {
      const has = card.labelIds.some(id => f.labelIds.has(id));
      if (!has) return false;
    }
    if (f.due) {
      const s = card.dueState();
      if (f.due === "overdue" && s !== "overdue") return false;
      if (f.due === "soon" && s !== "soon" && s !== "overdue") return false;
      if (f.due === "done" && s !== "done") return false;
      if (f.due === "none" && card.dueAt) return false;
    }
    return true;
  }

  /* --------------------------- Activity --------------------------- */
  _recordActivity(boardId, text) {
    const b = this.findBoard(boardId);
    if (!b) return;
    b.activity.unshift({ id: uid("a"), text, ts: Date.now() });
    b.activity = b.activity.slice(0, 80);
  }
}
