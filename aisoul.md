# Trolley — AI Soul File

This file is a handoff document for AI assistants continuing work on this project. Read it fully before making any changes. It captures the complete picture of what was built, every decision made, every bug fixed, and what to watch out for.

---

## What This Project Is

**Trolley** is a fully offline, local-first Trello clone built as a desktop app using Electron. It was designed from the ground up to be self-hosted with zero cloud dependency. All data lives in localStorage. No backend, no accounts, no internet required after first load (fonts are loaded from Google Fonts — swap them to local if that matters).

The project was designed in Claude Design (claude.ai/design) and then implemented as a real app. The design files live in `project/` and should be treated as the visual reference. The actual runnable app is at the repo root.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| UI | Vanilla HTML/CSS/JS — no framework |
| JS style | ES Modules (`type="module"`), class-based views |
| Persistence | `localStorage` with debounced JSON serialization |
| Drag & Drop | Custom pointer-event system — NOT the HTML5 drag API |
| Desktop shell | Electron 34 |
| Packaging | electron-builder 25 |
| Fonts | Inter Tight + JetBrains Mono via Google Fonts |

---

## File Structure

```
trolley/
├── main.js              # Electron entry point
├── index.html           # Web app entry point (also loaded by Electron)
├── package.json
├── src/
│   ├── app.js           # Bootstrap: wires State, Sidebar, Home, BoardView, topbar, shortcuts
│   ├── state.js         # Central state manager — all mutations go through here
│   ├── storage.js       # localStorage read/write/export/import/reset
│   ├── models.js        # Data classes + seed data
│   ├── utils/
│   │   ├── dom.js       # h(), $(), $$(), icon(), makeInlineEditable(), formatRel(), formatDue()
│   │   ├── dnd.js       # DragManager class — pointer-event drag for cards, lists, checklist items
│   │   ├── events.js    # EventBus class — pub/sub with wildcard '*' support
│   │   ├── id.js        # uid(prefix) — timestamp+random ID generator
│   │   └── ui.js        # openPopover(), closePopover(), toast(), confirmDialog()
│   └── views/
│       ├── sidebar.js   # Sidebar + boardSwatchStyle() export
│       ├── home.js      # Workspace home screen (board tile grid)
│       ├── board.js     # Board view — lists, cards, DragManager owner
│       ├── cardModal.js # Card detail modal
│       └── pickers.js   # LabelPicker, DuePicker, CoverPicker, BackgroundPicker, FilterPanel
└── style/
    ├── tokens.css       # All CSS custom properties (colors, spacing, type, motion)
    ├── reset.css        # Base reset + scrollbar styling
    ├── animations.css   # All @keyframes + prefers-reduced-motion
    ├── components.css   # Buttons, inputs, popovers, menus, toasts, modals, badges
    ├── layout.css       # App shell, sidebar, topbar, search bar
    ├── board.css        # Board area, lists, cards, home view, board tiles
    └── card-modal.css   # Card modal, label picker, filter panel, date/bg pickers
```

---

## Data Model

The hierarchy mirrors Trello exactly:

```
Workspace
  └── Board (has background, labels[], members[], activity[])
        └── List
              └── Card (has labelIds[], checklists[], comments[], dueAt, cover)
                    └── Checklist
                          └── ChecklistItem
```

### Key model details

- **Labels are board-scoped.** `board.labels[]` holds `Label` objects. Cards store `labelIds[]` — references, not copies. When a label is deleted, all card `labelIds` are cleaned up in `state.deleteLabel()`.
- **Activity is board-scoped**, capped at 80 entries. It's unstructured text logged by `state._recordActivity()`.
- **Cover** is `{ color: string, full: boolean }` or `null`. `full` controls half vs full-height cover on the card.
- **Due state** is computed, not stored: `card.dueState()` returns `'overdue' | 'soon' | 'future' | 'done' | null`.
- **All models have `toJSON()` / `fromJSON()`** for localStorage round-tripping. `seedData()` in `models.js` creates the first-run demo workspace.

### Storage keys
- `trolley.v1` — full workspace tree
- `trolley.theme` — `'dark'` or `'light'`
- `trolley.ui` — `{ currentBoardId, currentWorkspaceId, sidebarCollapsed }`

---

## Architecture Patterns

### State is the single source of truth
All mutations go through `state.js`. Views never mutate data directly. State methods emit events on `state.bus` after every change. Views subscribe and re-render.

```js
// Pattern every view follows:
state.bus.on("*", (evt) => {
  if (/relevant:event/.test(evt)) this.render();
});
```

### EventBus events emitted by state
| Event | Payload |
|-------|---------|
| `nav:changed` | — |
| `ui:sidebar` | — |
| `theme:changed` | theme string |
| `workspace:created` | workspace |
| `workspace:updated` | workspace |
| `workspace:deleted` | wsId |
| `board:created` | board |
| `board:updated` | board |
| `board:deleted` | boardId |
| `list:created` | `{ boardId, list }` |
| `list:updated` | `{ boardId, list }` |
| `list:deleted` | `{ boardId, listId }` |
| `list:reordered` | `{ boardId }` |
| `card:created` | `{ boardId, listId, card }` |
| `card:updated` | `{ boardId, listId, card }` |
| `card:deleted` | `{ boardId, listId, cardId }` |
| `card:moved` | `{ boardId, card }` |
| `filter:changed` | — |

### DOM helpers (`dom.js`)
`h(tag, attrs, children)` is the whole rendering system — no virtual DOM, just direct DOM creation. It handles `class`, `style` (object or string), `dataset`, `on*` event handlers, and `html` (innerHTML). Views call `clear(el)` then re-append everything on re-render.

### Popover system (`ui.js`)
Only one popover can be open at a time. `openPopover(anchor, content, { title, width })` positions it below the anchor, auto-closes on outside click or Escape. `closePopover()` can be called from anywhere. Popovers render into `#popover-host`.

### Modal system
Card modal and confirm dialogs render into `#modal-host`. `modal-host.is-open` controls visibility. The card modal subscribes to its own card's updates and re-renders live.

---

## Drag and Drop System

This is the most complex part of the codebase. **Do not use the HTML5 drag API** — everything uses pointer events for smooth cross-container dragging.

### DragManager (`dnd.js`)
Owned by `BoardView`. Supports three drag types: `card`, `list`, `checklistItem`.

**The 5px threshold pattern** — this is critical and was a bug fix:
- `pointerdown` only *arms* a drag (`pending` state), it does not start it
- Movement < 5px → treated as a click, drag is cancelled on `pointerup`
- Movement ≥ 5px → drag commits (`_commitPending()`), ghost is created, original element hidden
- This allows click-to-open-modal and drag-to-move to coexist on the same element

**Ghost element** — a clone of the dragged element, `position: fixed`, `pointer-events: none`, follows the cursor. The original element gets `display: none` + `is-dragging` class.

**Placeholder** — inserted in the DOM to show the drop target. For cards: `.card-placeholder`. For lists: a dim `.list` shell. For checklist items: `.checklist-item-placeholder`.

**Click suppression after drag** — after a real drag completes, a 50ms click swallow is installed on `window` to eat the synthetic click that fires after `pointerup`. This is scoped to 50ms so it can never get stuck.

```js
_suppressNextClick() {
  const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
  window.addEventListener("click", swallow, true);
  setTimeout(() => window.removeEventListener("click", swallow, true), 50);
}
```

---

## Bug History (Important)

These bugs were found and fixed during the design session. Know them so you don't reintroduce them.

### 1. Cards couldn't be clicked to open
**Cause:** `e.preventDefault()` on `pointerdown` was suppressing the synthetic click event.
**Fix:** Moved to the 5px threshold deferred-drag pattern described above. Never call `preventDefault()` on `pointerdown` for draggable elements.

### 2. Checklist "Add an item" button did nothing
**Cause:** Temporal dead zone — `commit` and `cancel` functions were referenced in button `onClick` handlers before they were declared with `const`.
**Fix:** Declared `commit` and `cancel` before the elements that reference them, or restructured so functions are hoisted.

### 3. Label picker clicks were being swallowed
**Cause:** The drag system was installing a click-swallow handler on `drag-start` and leaving it armed indefinitely. If a drag ended without a synthetic click firing (e.g. pointer released off the original element), the handler stayed armed and ate the next click anywhere on the page — including label picker rows.
**Fix:** Moved the swallow to fire on `drag-end` with a hard 50ms self-removal timeout.

### 4. Checklist items couldn't be dragged
**Cause:** The `DragManager` didn't have a `checklistItem` drag type at all initially.
**Fix:** Added `startChecklistItem()`, `_updateChecklistItemTarget()`, and the `checklistItem` branch in `_onUp()`. Also added `state.moveChecklistItem()` and wired it through `BoardView`'s `onChecklistItemDrop` callback.

---

## CSS / Design System

All values come from CSS custom properties in `tokens.css`. Never hardcode colors or spacing in component CSS — always use tokens.

### Theme system
`data-theme="dark"` (default) or `data-theme="light"` on `<html>`. The light theme overrides surface and text tokens only — accent colors and label colors are the same in both themes.

### Key tokens to know
```css
--accent: #4dd6c1          /* teal — primary interactive color */
--bg-app / --bg-board / --bg-panel / --bg-list / --bg-card  /* surface hierarchy */
--text-1 / --text-2 / --text-3 / --text-4                  /* text hierarchy */
--label-green/yellow/orange/red/purple/blue/sky/pink/lime/gray
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)           /* bouncy popover spring */
--t-fast: 120ms / --t-med: 220ms / --t-slow: 360ms
```

### Animation classes
- `.fade-in` — `fadeIn` keyframe
- `.slide-up` — `slideUpIn` keyframe
- `.shake` — `shake` keyframe (used for validation errors)
- `.badge-bounce` — `badgeBounce` keyframe
- `prefers-reduced-motion` — all animations collapse to 1ms

---

## Electron Setup

`main.js` is intentionally minimal:
- `Menu.setApplicationMenu(null)` — removes the File/Edit/View menu bar entirely
- `show: false` + `ready-to-show` event — prevents white flash on startup
- `backgroundColor: '#0e1620'` — matches the app's dark background during load
- `nodeIntegration: false`, `contextIsolation: true` — standard security posture
- No preload script needed — app is pure frontend, no Node APIs used in renderer

### Building
```bash
npm run build:win    # → dist/Trolley Setup 1.0.0.exe
npm run build:mac    # → dist/Trolley-1.0.0.dmg
npm run build:linux  # → dist/Trolley-1.0.0.AppImage
```

Icons go in `assets/` — `icon.ico` (Win), `icon.icns` (Mac), `icon.png` (Linux, 512×512).

### Windows gotcha
On Windows, `electron` may not be found as a bare command in npm scripts if `node_modules` is in a broken state. Scripts use `npx electron .` instead of `electron .` to force resolution through `node_modules/.bin`. If install fails, wipe and reinstall:
```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

---

## What Doesn't Exist Yet (Future Work)

- Image attachments on cards
- Multi-board card search
- Recurring due dates
- Card archiving (the `archived` field exists on cards and lists in the model but there's no UI to archive/unarchive cards — only boards have archive UI)
- macOS code signing (builds work but Gatekeeper will block unsigned DMGs on first run)
- Custom workspace colors beyond the auto-assigned palette
- Member avatars (the data model supports `memberIds` on cards and `members` on boards but there's no UI to add/manage members — it's stubbed)

---

## Things That Look Weird But Are Intentional

- `boardSwatchStyle()` is exported from `sidebar.js` and imported by `home.js` — it's a shared utility that ended up in sidebar because that's where it was first needed. Fine to leave there.
- `FilterPanel` in `pickers.js` has its own label edit/create flow duplicated from `LabelPicker`. This is deliberate — they're in different contexts (filter panel vs card modal) and keeping them separate avoids coupling.
- The `DragManager` is instantiated in `BoardView` but the checklist item drag callback has to find the card's list by iterating `board.lists` — this is because checklist items are inside the card modal which is outside the board DOM hierarchy.
- `state.filter.labelIds` is a `Set`, not an array. Be careful with `JSON.stringify` — Sets don't serialize. The filter is never persisted to storage intentionally (it resets on board navigation).
