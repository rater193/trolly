/**
 * Trolly NodeServer
 * -----------------
 * A single, self-hostable HTTPS server that lets multiple people share the same
 * Trolly workspaces, boards, lists and cards in real time.
 *
 *   • Serves the Trolly web app (./public) over HTTPS.
 *   • User accounts (register / login) gated by a session cookie.
 *   • Shared project + organization data persisted to a JSON file on disk.
 *   • Real-time sync over WebSockets: one person's edit shows up live for everyone.
 *   • Auto-generates a self-signed certificate on first run (LAN-friendly).
 *
 * Configure via environment variables (all optional):
 *   PORT          HTTPS port                       (default 8443)
 *   HOST          bind address                     (default 0.0.0.0)
 *   DATA_FILE     path to the shared data store     (default ./data/data.json)
 *   CERT_DIR      where the self-signed cert lives  (default ./certs)
 *   TLS_CERT_FILE / TLS_KEY_FILE  use your own cert instead of self-signed
 */

import https from "node:https";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import cookie from "cookie";
import selfsigned from "selfsigned";
import { WebSocketServer } from "ws";
import { Store } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 8443);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "data.json");
const CERT_DIR = process.env.CERT_DIR || path.join(__dirname, "certs");
const PUBLIC_DIR = path.join(__dirname, "public");

const store = new Store(DATA_FILE);

/* --------------------------------------------------------------------------
 * Sessions — in-memory map of session id -> { userId }.
 * Cleared on restart (users simply log in again). Good enough for a single
 * self-hosted instance.
 * ------------------------------------------------------------------------ */
const sessions = new Map();

function createSession(userId) {
  const sid = crypto.randomBytes(24).toString("hex");
  sessions.set(sid, { userId, createdAt: Date.now() });
  return sid;
}

function sessionFromRequest(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  const sid = cookie.parse(header).sid;
  if (!sid) return null;
  const sess = sessions.get(sid);
  if (!sess) return null;
  const user = store.getUserById(sess.userId);
  if (!user) return null;
  return { sid, user };
}

/* --------------------------------------------------------------------------
 * TLS — load a provided cert, else reuse / generate a self-signed one.
 * ------------------------------------------------------------------------ */
function loadTls() {
  if (process.env.TLS_CERT_FILE && process.env.TLS_KEY_FILE) {
    return {
      cert: fs.readFileSync(process.env.TLS_CERT_FILE),
      key: fs.readFileSync(process.env.TLS_KEY_FILE),
    };
  }
  const certPath = path.join(CERT_DIR, "cert.pem");
  const keyPath = path.join(CERT_DIR, "key.pem");
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
  }
  console.log("[tls] generating self-signed certificate…");
  const attrs = [{ name: "commonName", value: "trolly-nodeserver" }];
  const pems = selfsigned.generate(attrs, {
    days: 3650,
    keySize: 2048,
    algorithm: "sha256",
    extensions: [{ name: "basicConstraints", cA: true }],
  });
  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(keyPath, pems.private);
  return { cert: pems.cert, key: pems.private };
}

/* --------------------------------------------------------------------------
 * HTTP helpers
 * ------------------------------------------------------------------------ */
function sendJson(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limit) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error("invalid JSON")); }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function serveStatic(req, res) {
  // Strip query string, decode, and normalize to prevent path traversal.
  const urlPath = decodeURIComponent((req.url.split("?")[0] || "/"));
  let rel = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  if (rel === "/" || rel === "\\" || rel === "") rel = "/index.html";
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      // SPA-style fallback to index.html for unknown non-asset routes.
      if (!path.extname(filePath)) {
        return fs.readFile(path.join(PUBLIC_DIR, "index.html"), (e2, idx) => {
          if (e2) { res.writeHead(404); return res.end("Not found"); }
          res.writeHead(200, { "Content-Type": MIME[".html"] });
          res.end(idx);
        });
      }
      res.writeHead(404); res.end("Not found"); return;
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(buf);
  });
}

/* --------------------------------------------------------------------------
 * Auth API
 * ------------------------------------------------------------------------ */
function publicUser(u) {
  return { id: u.id, username: u.username };
}

async function handleApi(req, res, url) {
  const route = url.pathname;

  if (route === "/api/me" && req.method === "GET") {
    const sess = sessionFromRequest(req);
    if (!sess) return sendJson(res, 401, { error: "not authenticated" });
    return sendJson(res, 200, { user: publicUser(sess.user) });
  }

  if (route === "/api/register" && req.method === "POST") {
    let body;
    try { body = await readBody(req); } catch { return sendJson(res, 400, { error: "bad request" }); }
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (username.length < 2) return sendJson(res, 400, { error: "Username must be at least 2 characters." });
    if (password.length < 4) return sendJson(res, 400, { error: "Password must be at least 4 characters." });
    if (store.getUserByUsername(username)) return sendJson(res, 409, { error: "That username is taken." });
    const user = {
      id: "u_" + crypto.randomBytes(8).toString("hex"),
      username,
      passwordHash: bcrypt.hashSync(password, 10),
      createdAt: Date.now(),
    };
    store.addUser(user);
    const sid = createSession(user.id);
    return sendJson(res, 200, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(sid) });
  }

  if (route === "/api/login" && req.method === "POST") {
    let body;
    try { body = await readBody(req); } catch { return sendJson(res, 400, { error: "bad request" }); }
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const user = store.getUserByUsername(username);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return sendJson(res, 401, { error: "Invalid username or password." });
    }
    const sid = createSession(user.id);
    return sendJson(res, 200, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(sid) });
  }

  if (route === "/api/logout" && req.method === "POST") {
    const sess = sessionFromRequest(req);
    if (sess) sessions.delete(sess.sid);
    return sendJson(res, 200, { ok: true }, {
      "Set-Cookie": "sid=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
    });
  }

  return sendJson(res, 404, { error: "not found" });
}

function sessionCookie(sid) {
  return `sid=${sid}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 24 * 30}`;
}

/* --------------------------------------------------------------------------
 * Server wiring
 * ------------------------------------------------------------------------ */
const tls = loadTls();
const server = https.createServer({ cert: tls.cert, key: tls.key }, (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((e) => {
      console.error("[api] error:", e);
      sendJson(res, 500, { error: "internal error" });
    });
    return;
  }
  serveStatic(req, res);
});

/* --------------------------------------------------------------------------
 * WebSocket hub — authenticated real-time sync of the shared workspace tree.
 *
 * Protocol (JSON messages):
 *   server -> client : { type: "state", workspaces }      // full tree
 *   client -> server : { type: "save",  workspaces }       // full tree
 *
 * On any save we persist and rebroadcast the new tree to every *other*
 * connected client. Last write wins — appropriate for a small shared instance.
 * ------------------------------------------------------------------------ */
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (!req.url || !req.url.startsWith("/ws")) { socket.destroy(); return; }
  const sess = sessionFromRequest(req);
  if (!sess) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.userId = sess.user.id;
    ws.username = sess.user.username;
    wss.emit("connection", ws, req);
  });
});

function broadcastState(except) {
  const msg = JSON.stringify({ type: "state", workspaces: store.getWorkspaces() });
  for (const client of wss.clients) {
    if (client !== except && client.readyState === 1) client.send(msg);
  }
}

wss.on("connection", (ws) => {
  // Send the current shared tree right away.
  ws.send(JSON.stringify({ type: "state", workspaces: store.getWorkspaces() }));

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === "save" && Array.isArray(msg.workspaces)) {
      store.setWorkspaces(msg.workspaces);
      broadcastState(ws);
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Trolly NodeServer running`);
  console.log(`  → https://localhost:${PORT}`);
  console.log(`  → data:  ${DATA_FILE}`);
  if (store.userCount() === 0) {
    console.log(`\n  No users yet — open the URL and click "Create one" to register the first account.`);
  }
  console.log(`\n  (Self-signed cert: your browser will warn once — proceed/accept to continue.)\n`);
});
