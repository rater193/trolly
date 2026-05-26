/**
 * Storage layer: LocalStorage-backed persistence.
 * Serializes whole workspace tree on save (debounced).
 */

import { Workspace, seedData } from "./models.js";

const KEY = "trolley.v1";
const THEME_KEY = "trolley.theme";
const UI_KEY = "trolley.ui";

export class Storage {
  constructor() {
    this._debounceTimer = null;
  }

  /** Load all workspaces, or seed if missing. */
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { workspaces: seedData(), fresh: true };
      const parsed = JSON.parse(raw);
      const workspaces = (parsed.workspaces || []).map(Workspace.fromJSON);
      return { workspaces, fresh: false };
    } catch (e) {
      console.error("Storage.load failed, falling back to seed:", e);
      return { workspaces: seedData(), fresh: true };
    }
  }

  /** Save (debounced) the whole workspace list. */
  save(workspaces) {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._saveNow(workspaces), 150);
  }

  _saveNow(workspaces) {
    try {
      const data = { v: 1, workspaces: workspaces.map(w => w.toJSON()) };
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      console.error("Storage.save failed:", e);
    }
  }

  /** UI preferences (sidebar collapsed, current view, etc.) */
  loadUi() {
    try {
      return JSON.parse(localStorage.getItem(UI_KEY) || "{}");
    } catch { return {}; }
  }
  saveUi(ui) {
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch {}
  }

  loadTheme() { return localStorage.getItem(THEME_KEY) || "dark"; }
  saveTheme(t) { try { localStorage.setItem(THEME_KEY, t); } catch {} }

  /** Export to a downloadable JSON file. */
  exportJson(workspaces) {
    const blob = new Blob([JSON.stringify({ v: 1, exportedAt: Date.now(), workspaces: workspaces.map(w => w.toJSON()) }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trolley-export-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** Import from a File object. Returns Promise<Workspace[]>. */
  importJson(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const wss = (parsed.workspaces || []).map(Workspace.fromJSON);
          resolve(wss);
        } catch (e) { reject(e); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  /** Nuke everything (with confirm). */
  reset() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(UI_KEY);
  }
}
