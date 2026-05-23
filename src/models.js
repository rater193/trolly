/**
 * Data model classes.
 *
 * Trello-equivalent hierarchy:
 *   Workspace (org) -> Board -> List -> Card
 *   Card has labels (board-scoped), checklists, comments, members (board-scoped),
 *   due date, cover, description.
 *
 * All models are plain serializable classes with toJSON/fromJSON so we can
 * round-trip through localStorage and import/export as JSON.
 */

import { uid } from "./utils/id.js";

/** Generic helper to copy plain fields onto an instance. */
function assignFields(target, src, fields) {
  for (const f of fields) if (src[f] !== undefined) target[f] = src[f];
}

/* ------------------------------- Workspace ------------------------------- */
export class Workspace {
  constructor({ id, name, color, icon, boards, collapsed } = {}) {
    this.id = id || uid("ws");
    this.name = name || "New Workspace";
    this.color = color || "#4dd6c1";
    this.icon = icon || "";
    this.boards = boards || []; // ordered Board[]
    this.collapsed = !!collapsed;
    this.createdAt = Date.now();
  }
  toJSON() {
    return {
      id: this.id, name: this.name, color: this.color, icon: this.icon,
      collapsed: this.collapsed, createdAt: this.createdAt,
      boards: this.boards.map(b => b.toJSON()),
    };
  }
  static fromJSON(d) {
    const ws = new Workspace(d);
    ws.createdAt = d.createdAt || Date.now();
    ws.boards = (d.boards || []).map(Board.fromJSON);
    return ws;
  }
}

/* --------------------------------- Board --------------------------------- */
export class Board {
  constructor({ id, workspaceId, name, background, starred, lists, labels, members, archived } = {}) {
    this.id = id || uid("b");
    this.workspaceId = workspaceId || null;
    this.name = name || "Untitled Board";
    this.background = background || { type: "color", value: "#1f6fb2" };
    this.starred = !!starred;
    this.archived = !!archived;
    this.lists = lists || []; // ordered List[]
    this.labels = labels || Board.defaultLabels();
    this.members = members || [];
    this.activity = []; // recent activity
    this.createdAt = Date.now();
  }
  static defaultLabels() {
    return [
      new Label({ name: "",   color: "green",  id: uid("l") }),
      new Label({ name: "",   color: "yellow", id: uid("l") }),
      new Label({ name: "",   color: "orange", id: uid("l") }),
      new Label({ name: "",   color: "red",    id: uid("l") }),
      new Label({ name: "",   color: "purple", id: uid("l") }),
      new Label({ name: "",   color: "blue",   id: uid("l") }),
    ];
  }
  toJSON() {
    return {
      id: this.id, workspaceId: this.workspaceId, name: this.name,
      background: this.background, starred: this.starred, archived: this.archived,
      createdAt: this.createdAt,
      lists: this.lists.map(l => l.toJSON()),
      labels: this.labels.map(l => l.toJSON()),
      members: this.members.map(m => ({ ...m })),
      activity: this.activity.slice(-80), // cap
    };
  }
  static fromJSON(d) {
    const b = new Board(d);
    b.createdAt = d.createdAt || Date.now();
    b.lists = (d.lists || []).map(List.fromJSON);
    b.labels = (d.labels || []).map(Label.fromJSON);
    b.members = d.members || [];
    b.activity = d.activity || [];
    return b;
  }
}

/* ---------------------------------- List --------------------------------- */
export class List {
  constructor({ id, boardId, name, cards, archived } = {}) {
    this.id = id || uid("ls");
    this.boardId = boardId || null;
    this.name = name || "New List";
    this.cards = cards || [];
    this.archived = !!archived;
    this.createdAt = Date.now();
  }
  toJSON() {
    return {
      id: this.id, boardId: this.boardId, name: this.name,
      archived: this.archived, createdAt: this.createdAt,
      cards: this.cards.map(c => c.toJSON()),
    };
  }
  static fromJSON(d) {
    const l = new List(d);
    l.createdAt = d.createdAt || Date.now();
    l.cards = (d.cards || []).map(Card.fromJSON);
    return l;
  }
}

/* ---------------------------------- Card --------------------------------- */
export class Card {
  constructor(d = {}) {
    this.id = d.id || uid("c");
    this.listId = d.listId || null;
    this.title = d.title || "Untitled";
    this.description = d.description || "";
    this.labelIds = d.labelIds || [];     // refs to board.labels
    this.memberIds = d.memberIds || [];   // refs to board.members
    this.checklists = (d.checklists || []).map(c => c instanceof Checklist ? c : Checklist.fromJSON(c));
    this.comments = d.comments || [];     // [{id, authorId, text, ts}]
    this.dueAt = d.dueAt || null;         // timestamp or null
    this.dueDone = !!d.dueDone;
    this.cover = d.cover || null;         // {color: string, full: bool}
    this.archived = !!d.archived;
    this.createdAt = d.createdAt || Date.now();
    this.updatedAt = d.updatedAt || Date.now();
  }
  toJSON() {
    return {
      id: this.id, listId: this.listId, title: this.title, description: this.description,
      labelIds: this.labelIds.slice(), memberIds: this.memberIds.slice(),
      checklists: this.checklists.map(c => c.toJSON()),
      comments: this.comments.slice(),
      dueAt: this.dueAt, dueDone: this.dueDone,
      cover: this.cover ? { ...this.cover } : null,
      archived: this.archived,
      createdAt: this.createdAt, updatedAt: this.updatedAt,
    };
  }
  static fromJSON(d) { return new Card(d); }

  /** Aggregate checklist progress: {done, total}. */
  checklistProgress() {
    let done = 0, total = 0;
    for (const cl of this.checklists) {
      for (const i of cl.items) { total++; if (i.done) done++; }
    }
    return { done, total };
  }

  /** Due state: 'overdue', 'soon' (< 24h), 'done', 'future', null */
  dueState() {
    if (!this.dueAt) return null;
    if (this.dueDone) return "done";
    const diff = this.dueAt - Date.now();
    if (diff < 0) return "overdue";
    if (diff < 24 * 60 * 60 * 1000) return "soon";
    return "future";
  }
}

/* --------------------------------- Label --------------------------------- */
export class Label {
  constructor({ id, name, color } = {}) {
    this.id = id || uid("lb");
    this.name = name || "";
    this.color = color || "blue"; // key into label palette
  }
  toJSON() { return { id: this.id, name: this.name, color: this.color }; }
  static fromJSON(d) { return new Label(d); }
}

/* ------------------------------- Checklist ------------------------------- */
export class Checklist {
  constructor({ id, title, items } = {}) {
    this.id = id || uid("ck");
    this.title = title || "Checklist";
    this.items = (items || []).map(i => i instanceof ChecklistItem ? i : ChecklistItem.fromJSON(i));
  }
  toJSON() { return { id: this.id, title: this.title, items: this.items.map(i => i.toJSON()) }; }
  static fromJSON(d) { return new Checklist(d); }
  percent() {
    if (!this.items.length) return 0;
    return Math.round(this.items.filter(i => i.done).length / this.items.length * 100);
  }
}

export class ChecklistItem {
  constructor({ id, text, done } = {}) {
    this.id = id || uid("ci");
    this.text = text || "";
    this.done = !!done;
  }
  toJSON() { return { id: this.id, text: this.text, done: this.done }; }
  static fromJSON(d) { return new ChecklistItem(d); }
}

/* Sample seed used on first load. */
export function seedData() {
  const ws = new Workspace({ name: "My Workspace", color: "#4dd6c1" });
  const board = new Board({
    name: "Welcome to Trolley",
    workspaceId: ws.id,
    starred: true,
    background: { type: "gradient", value: "linear-gradient(135deg, #1b3a5f 0%, #4f3573 100%)" },
  });

  const todoLabel = board.labels[1]; // yellow
  const designLabel = board.labels[4]; // purple
  const devLabel = board.labels[5]; // blue
  todoLabel.name = "Priority";
  designLabel.name = "Design";
  devLabel.name = "Engineering";

  const l1 = new List({ boardId: board.id, name: "Backlog" });
  const l2 = new List({ boardId: board.id, name: "In Progress" });
  const l3 = new List({ boardId: board.id, name: "Review" });
  const l4 = new List({ boardId: board.id, name: "Done" });

  const c1 = new Card({
    listId: l1.id,
    title: "Welcome! Click any card to open it.",
    description: "Edit the title, add a description, attach labels, checklists, and due dates — all stored locally on your device.\n\nDrag cards between lists. Drag lists themselves. Press / to search.",
    labelIds: [todoLabel.id, designLabel.id],
    cover: { color: "#7fb6ff", full: false },
    checklists: [
      new Checklist({ title: "Quick start", items: [
        new ChecklistItem({ text: "Open this card by clicking", done: true }),
        new ChecklistItem({ text: "Add a new card below", done: false }),
        new ChecklistItem({ text: "Try dragging this card to 'In Progress'", done: false }),
        new ChecklistItem({ text: "Star this board ⭐", done: false }),
      ] }),
    ],
  });

  const c2 = new Card({
    listId: l1.id,
    title: "Plan the offline-first sync model",
    description: "Storage layer is LocalStorage with JSON round-trip. Future: IndexedDB for larger boards.",
    labelIds: [devLabel.id],
    dueAt: Date.now() + 1000 * 60 * 60 * 24 * 3,
  });

  const c3 = new Card({
    listId: l2.id,
    title: "Drag-and-drop polish",
    description: "Smooth animations between list moves.",
    labelIds: [designLabel.id, devLabel.id],
    dueAt: Date.now() + 1000 * 60 * 60 * 18,
  });

  const c4 = new Card({
    listId: l2.id,
    title: "Card detail modal",
    labelIds: [designLabel.id],
    checklists: [new Checklist({ title: "Sections", items: [
      new ChecklistItem({ text: "Description", done: true }),
      new ChecklistItem({ text: "Checklists", done: true }),
      new ChecklistItem({ text: "Activity", done: false }),
    ] })],
  });

  const c5 = new Card({
    listId: l3.id,
    title: "Review keyboard shortcuts",
    description: "/ = search • N = new card • Esc = close",
    labelIds: [todoLabel.id],
  });

  const c6 = new Card({
    listId: l4.id,
    title: "Initial design tokens",
    labelIds: [designLabel.id],
    dueAt: Date.now() - 1000 * 60 * 60 * 48,
    dueDone: true,
  });

  const c7 = new Card({
    listId: l4.id,
    title: "Workspace + board navigation",
    labelIds: [devLabel.id],
    dueAt: Date.now() - 1000 * 60 * 60 * 12,
    dueDone: true,
  });

  l1.cards = [c1, c2];
  l2.cards = [c3, c4];
  l3.cards = [c5];
  l4.cards = [c6, c7];

  board.lists = [l1, l2, l3, l4];
  ws.boards = [board];

  return [ws];
}
