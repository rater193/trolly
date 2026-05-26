# Trolly NodeServer

A single, self-hostable **HTTPS server** that turns the offline Trolly board app
into a **shared, multi-user workspace**. Run it on a machine your team can reach,
and everyone who logs in sees and edits the *same* workspaces, boards, lists and
cards — in real time.

```
nodeserver/
├── server.js        # HTTPS + auth + static hosting + WebSocket sync hub
├── store.js         # JSON-file persistence for users + shared workspace tree
├── package.json
└── public/          # The Trolly web app, adapted to sync through the server
    ├── index.html
    ├── src/
    │   ├── sync.js  # WebSocket + auth client (new)
    │   ├── auth.js  # Login / register gate (new)
    │   ├── state.js # Loads/saves the tree via the server instead of localStorage
    │   └── …        # Otherwise the original Trolly app
    └── style/
        └── nodeserver.css  # Login + connection-status styling (new)
```

## What it does

- **User accounts** — register/login, gated by a secure session cookie. Passwords
  are hashed with bcrypt.
- **Shared data** — one workspace tree shared by everyone, stored in a single
  `data/data.json` file on disk (atomic writes, debounced).
- **Real-time sync** — edits broadcast over WebSockets, so other people see
  changes live without refreshing. Last write wins.
- **Auto HTTPS** — a self-signed certificate is generated on first run and cached
  in `certs/`. No setup needed for LAN use.

## Quick start

```bash
cd nodeserver
npm install
npm start
```

Then open **https://localhost:8443** (or `https://<this-machine-ip>:8443` from
another device on the network). Because the certificate is self-signed your
browser will warn once — proceed/accept to continue.

The **first** visitor clicks **"No account? Create one"** to register. Anyone who
can reach the server can register an account, so control access at the network
layer (firewall / VPN / LAN).

## Configuration

All optional, via environment variables:

| Variable        | Default              | Purpose                                   |
|-----------------|----------------------|-------------------------------------------|
| `PORT`          | `8443`               | HTTPS port                                |
| `HOST`          | `0.0.0.0`            | Bind address                              |
| `DATA_FILE`     | `./data/data.json`   | Shared data store location                |
| `CERT_DIR`      | `./certs`            | Where the self-signed cert is cached      |
| `TLS_CERT_FILE` | —                    | Use your own cert (PEM) instead of self-signed |
| `TLS_KEY_FILE`  | —                    | Private key (PEM) for your own cert       |

Example with your own certificate:

```bash
PORT=443 TLS_CERT_FILE=/etc/ssl/trolly.crt TLS_KEY_FILE=/etc/ssl/trolly.key npm start
```

## How it relates to the original app

The desktop/offline Trolly (in the repo root) persists the whole workspace tree
to `localStorage` on every change. This server build keeps that exact model but
swaps the storage destination: the tree is pushed to the server over a WebSocket
and rebroadcast to every other connected client. Per-browser preferences (theme,
sidebar state, which board you're viewing) stay local to each user.

## Notes & limitations

- **Last write wins.** Two people editing the *same* card at the *same* instant
  can clobber each other. Fine for a small team; not a CRDT.
- Sessions live in memory and reset when the server restarts (just log in again).
- Back up by copying `data/data.json`. Move it to a new machine to migrate.
