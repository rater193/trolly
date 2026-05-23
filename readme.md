# Trolley — Setup & Build Guide

Trolley is an offline-first Trello-style board app built with HTML/CSS/JS and packaged with Electron. All data is stored locally in your browser's localStorage (or Electron's equivalent) — no account, no cloud, no subscription.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)

---

## Running Locally (Development)

```bash
# 1. Clone the repo
git clone https://github.com/rater193/trolly.git
cd trolley

# 2. Install dependencies (downloads Electron ~100MB, one-time)
npm install

# 3. Launch the app
npm start
```

---

## Building a Distributable

> **Note:** You can only build for your current platform unless you use a CI service like GitHub Actions.

### Windows — NSIS Installer (`.exe`)

```bash
npm run build:win
```

Output: `dist/Trolley Setup 1.0.0.exe`

### macOS — Disk Image (`.dmg`)

```bash
npm run build:mac
```

Output: `dist/Trolley-1.0.0.dmg`

### Linux — AppImage

```bash
npm run build:linux
```

Output: `dist/Trolley-1.0.0.AppImage`

All builds land in the `dist/` folder.

---

## Adding a Custom Icon (Optional)

Place your icon files in an `assets/` folder before building:

| Platform | File | Size |
|----------|------|------|
| Windows  | `assets/icon.ico` | 256×256 recommended |
| macOS    | `assets/icon.icns` | 512×512 recommended |
| Linux    | `assets/icon.png` | 512×512 recommended |

Without these files the build will still work but use the default Electron icon.

---

## Troubleshooting

**`electron` is not recognized after `npm install`**

The previous install may have left `node_modules` in a broken state. Wipe it and reinstall:

```bash
# Windows (PowerShell)
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
npm start

# macOS / Linux
rm -rf node_modules package-lock.json
npm install
npm start
```

If you still get permission errors on Windows, run PowerShell as Administrator and repeat the commands above.

---

## Project Structure

```
trolley/
├── main.js          # Electron main process
├── index.html       # App entry point
├── src/
│   ├── app.js       # App bootstrap & keyboard shortcuts
│   ├── state.js     # Central state manager
│   ├── storage.js   # LocalStorage persistence
│   ├── models.js    # Data models (Workspace, Board, List, Card…)
│   ├── utils/
│   │   ├── dom.js   # DOM helpers & icon library
│   │   ├── dnd.js   # Drag-and-drop manager (pointer events)
│   │   ├── events.js# EventBus pub/sub
│   │   ├── id.js    # Unique ID generator
│   │   └── ui.js    # Popovers, toasts, confirm dialogs
│   └── views/
│       ├── sidebar.js    # Workspace/board navigation
│       ├── home.js       # Workspace home screen
│       ├── board.js      # Board view with lists & cards
│       ├── cardModal.js  # Card detail modal
│       └── pickers.js    # Label, due date, cover, filter pickers
└── style/
    ├── tokens.css        # Design tokens (colors, spacing, type)
    ├── reset.css         # Base reset
    ├── animations.css    # Keyframe animations
    ├── components.css    # Buttons, inputs, popovers, toasts
    ├── layout.css        # Sidebar & topbar shell
    ├── board.css         # Board, lists, cards
    └── card-modal.css    # Card detail modal & pickers
```
