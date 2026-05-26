/**
 * Client sync layer for the NodeServer build of Trolly.
 *
 * Responsibilities:
 *   - Auth REST calls (me / login / register / logout).
 *   - A WebSocket connection that:
 *       • receives the shared workspace tree (initial + live updates), and
 *       • sends the local tree up whenever this client makes a change.
 *
 * The browser app already serializes its entire workspace tree on every
 * mutation, so we mirror that here: full-tree push on save, full-tree replace
 * on remote update. Simple and a perfect match for the existing model.
 */

export class SyncClient {
  constructor() {
    this.ws = null;
    this._onRemoteState = null;
    this._onStatus = null;
    this._saveTimer = null;
    this._pending = null;
    this._closedByUs = false;
  }

  /* ------------------------------- Auth ------------------------------- */
  async me() {
    const r = await fetch("/api/me", { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const data = await r.json();
    return data.user || null;
  }

  async login(username, password) {
    return this._authPost("/api/login", { username, password });
  }

  async register(username, password) {
    return this._authPost("/api/register", { username, password });
  }

  async logout() {
    this._closedByUs = true;
    try { this.ws?.close(); } catch {}
    await fetch("/api/logout", { method: "POST" });
  }

  async _authPost(path, body) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Request failed.");
    return data.user;
  }

  /* ---------------------------- WebSocket ----------------------------- */
  /**
   * Open the socket and resolve with the first ("initial") shared tree.
   * Subsequent updates are delivered to onRemoteState().
   */
  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      this.ws = ws;
      let gotInitial = false;

      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.type !== "state") return;
        if (!gotInitial) {
          gotInitial = true;
          resolve(msg.workspaces || []);
        } else {
          this._onRemoteState?.(msg.workspaces || []);
        }
      };
      ws.onopen = () => this._onStatus?.("online");
      ws.onerror = (err) => { if (!gotInitial) reject(err); };
      ws.onclose = () => {
        this._onStatus?.("offline");
        if (this._closedByUs || !gotInitial) return;
        // Reconnect with a short backoff; the fresh tree arrives as "initial"
        // again, which we route through onRemoteState to refresh the UI.
        setTimeout(() => this._reconnect(), 1500);
      };
    });
  }

  _reconnect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this._onStatus?.("online");
      // Flush anything that couldn't be sent while offline.
      if (this._pending) this._flush();
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === "state") this._onRemoteState?.(msg.workspaces || []);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      this._onStatus?.("offline");
      if (!this._closedByUs) setTimeout(() => this._reconnect(), 1500);
    };
  }

  onRemoteState(cb) { this._onRemoteState = cb; }
  onStatus(cb) { this._onStatus = cb; }

  /** Debounced push of the full local tree to the server. */
  save(workspaces) {
    this._pending = workspaces.map((w) => w.toJSON());
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._flush(), 150);
  }

  _flush() {
    if (!this._pending) return;
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ type: "save", workspaces: this._pending }));
      this._pending = null;
    }
    // If offline, keep _pending and let reconnect's onopen flush it.
  }
}
