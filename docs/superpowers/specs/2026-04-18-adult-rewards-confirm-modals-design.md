# Adult Reward Experience + Confirmation Modals

**Date:** 2026-04-18
**Status:** Approved

## Problem

1. Adults require parent approval to buy/use rewards — they shouldn't.
2. The scoreboard store "Saved" tab shows "Remove" but no "Use" button.
3. All 24 `confirm()` and 13 `alert()` calls use ugly browser dialogs that show "dashboard.jansky.app says..." chrome.

## Design

### 1. Shared Confirmation Modal (`showConfirm`)

New async function in `shared/components.js`, styled in `styles/components.css`.

**API:**
```js
// Confirmation dialog (returns true/false)
const ok = await showConfirm({
  title: 'Delete this event?',
  message: '',                    // optional detail text
  confirmLabel: 'Delete',        // default: 'OK'
  cancelLabel: 'Cancel',         // default: 'Cancel'
  danger: true                   // red confirm button for destructive actions
});

// Alert dialog (single button, always resolves true)
await showConfirm({ title: 'Name is required', confirmLabel: 'OK', alert: true });
```

**Visual:** Centered card over dimmed backdrop (same pattern as `kid-msg-overlay`). Uses global theme variables (`--surface`, `--border`, `--radius-lg`, `--accent`, `--accent-danger`). Fade-in + scale animation. No browser chrome. z-index 5000 (above bottom sheets at 1000 and bell at 2000).

**Keyboard:** Escape cancels, Enter confirms. Focus trapped within modal while open.

**CSS classes:** `.confirm-modal` (fixed overlay), `.confirm-modal__card`, `.confirm-modal__title`, `.confirm-modal__message`, `.confirm-modal__actions`.

**Replaces:** All 24 `confirm()` calls across 6 files + all 13 `alert()` calls across 5 files.

### 2. Adult Instant Purchase (Scoreboard Store)

In `scoreboard.html` `openStore()`, when the person's `role !== 'child'`:

- "Get it!" click shows `showConfirm({ title: 'Spend X pts on Y?' })`
- On confirm: **skip `redemption-request`** — directly write:
  - `redemption-approved` message (with `seen: true` so it doesn't clutter the bell)
  - Bank token via `writeBankToken()`
- Token stays **unused** in the bank (adult may want to save for later)
- Toast: "Got [reward name]!" (not "Waiting for approval...")
- No bell notification, no pending state

### 3. "Use" Button on Saved Tokens (Scoreboard Store)

The "Saved" section in `openStore()` currently shows only a red X (remove) button per token.

**Changes:**
- Add a "Use" button (primary style, small) next to the remove button
- Only shown when viewing a person with `role !== 'child'` (kids use rewards from kid.html)
- For **custom rewards**: `showConfirm('Use [name]?')` → mark token used + write `reward-used` message. No `use-request`, no parent approval.
- For **task-skip**: "Use" opens a bottom sheet listing today's skippable tasks for the person. Adult picks one → task marked exempt/skipped, token marked used, `task-skip-used` message written. Same logic as kid.html but in a bottom sheet within the store.
- For **penalty-removal**: "Use" finds the highest-damage late penalty for the person (same `findHighestDamagePenalty` logic as kid.html). Shows `showConfirm('Restore full points for [task] on [date]? (+X pts)')` → completion updated, token marked used, `penalty-removed` message written, snapshot rebuilt.
- Remove button stays for discarding unwanted tokens

### 4. No kid.html Changes for Adult Path

`kid.html` gates on `role === 'child'` (line 93) — adults never see it. The Use Now / Save for Later overlay only appears for children. No changes needed.

### 5. Toast Styles → components.css

`.toast` currently defined only in `kid.css` but used on `scoreboard.html` and `components.js` (bell). Move `.toast` styles to `components.css` so toasts render correctly on all pages. Remove from `kid.css`.

### 6. CLAUDE.md Schema Update

Add `reward-used` to the message type enum in the schema docs (already used in code, not yet documented).

## Files Modified

| File | Changes |
|------|---------|
| `shared/components.js` | Add `showConfirm()` export; replace 1 `confirm()` |
| `styles/components.css` | Add `.confirm-modal` styles; move `.toast` from kid.css |
| `styles/kid.css` | Remove `.toast` (moved to components.css) |
| `scoreboard.html` | Adult auto-approve on buy; "Use" button on saved tokens with functional reward usage; replace 2 `confirm()` |
| `admin.html` | Replace 13 `confirm()` + ~8 `alert()` |
| `dashboard.js` | Replace 2 `confirm()` + 1 `alert()` |
| `calendar.html` | Replace 2 `confirm()` |
| `kid.html` | Replace 4 `confirm()` + 2 `alert()` |
| `CLAUDE.md` | Add `reward-used` to message type enum |

## Schema

No Firebase schema changes. Uses existing message types (`redemption-approved`, `reward-used`, `task-skip-used`, `penalty-removed`) and bank token structure. `reward-used` added to CLAUDE.md docs.
