/**
 * Persistence layer for the shared Trolly data.
 *
 * Everything lives in a single JSON file on disk:
 *   {
 *     users:      [{ id, username, passwordHash, createdAt }],
 *     workspaces: [ ...the Trolly workspace tree, identical to the client model ]
 *   }
 *
 * The workspace tree is the same shape the browser app already serializes, so
 * the server treats it as an opaque blob and never needs to understand the
 * Board/List/Card hierarchy. Writes are debounced and written atomically
 * (temp file + rename) so a crash mid-write can't corrupt the store.
 */

import fs from "node:fs";
import path from "node:path";

export class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this._writeTimer = null;
    this.data = this._read();
  }

  _read() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
      };
    } catch {
      return { users: [], workspaces: [] };
    }
  }

  /** Persist immediately and atomically. */
  _writeNow() {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = this.filePath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.filePath);
  }

  /** Debounced write — coalesces rapid edits into one disk write. */
  _scheduleWrite() {
    clearTimeout(this._writeTimer);
    this._writeTimer = setTimeout(() => {
      try { this._writeNow(); }
      catch (e) { console.error("[store] write failed:", e); }
    }, 200);
  }

  /* ------------------------------ Users ------------------------------ */
  getUserByUsername(username) {
    const u = (username || "").trim().toLowerCase();
    return this.data.users.find((x) => x.username.toLowerCase() === u) || null;
  }
  getUserById(id) {
    return this.data.users.find((x) => x.id === id) || null;
  }
  addUser(user) {
    this.data.users.push(user);
    this._writeNow(); // user creation is rare and important — write through
  }
  userCount() {
    return this.data.users.length;
  }

  /* ---------------------------- Workspaces ---------------------------- */
  getWorkspaces() {
    return this.data.workspaces;
  }
  setWorkspaces(workspaces) {
    this.data.workspaces = Array.isArray(workspaces) ? workspaces : [];
    this._scheduleWrite();
  }
}
