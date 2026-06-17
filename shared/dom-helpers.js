// dom-helpers.js — Small DOM-binding helpers used by multiple pages.
// This module is the only "shared" module besides theme.js permitted to touch
// the DOM. Pure rendering belongs in components.js; pure data in state.js etc.

/** Attach click-to-toggle on owner chip buttons inside a container. */
export function initOwnerChips(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.owner-chip');
    if (chip) chip.classList.toggle('owner-chip--selected');
  });
}

/** Read selected owner IDs from an owner-chips container. */
export function getSelectedOwners(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .owner-chip--selected`)).map(b => b.dataset.id);
}

// Module-scoped "rapid-tap" timestamp shared across all bindings (dashboard,
// calendar, kid, tracker, events, activities, etc.). When the user is tapping
// rows one after another, the next pointerdown within `RAPID_TAP_WINDOW_MS`
// of the last successful tap doesn't start a long-press timer. Prevents
// spurious menu opens when the pointer slides between adjacent rows faster
// than pointerleave can reliably cancel the press timer.
let _lastTapAt = 0;
const RAPID_TAP_WINDOW_MS = 600;

/**
 * Mark that a tap (not long-press) just happened on a row. Suppresses long-press
 * detection on neighboring rows for the next RAPID_TAP_WINDOW_MS. Call this in
 * any pointerup handler that fires the tap action.
 */
export function recordTap() {
  _lastTapAt = Date.now();
}

/**
 * Start a long-press timer that respects the shared rapid-tap window.
 * Returns the timer handle (or null if suppressed), suitable for passing to
 * clearTimeout in pointerup/pointermove/pointerleave/pointercancel handlers.
 *
 * Use this in any inline long-press implementation so it participates in the
 * global rapid-tap window. Pages that use bindTaskRowGesture already get this
 * behavior for free.
 *
 * @param {Function} onLongPress - called when the press hits longPressMs
 * @param {object} [opts]
 * @param {number} [opts.longPressMs=800] - press duration to fire
 * @param {number} [opts.rapidTapWindowMs=RAPID_TAP_WINDOW_MS] - suppression window
 * @returns {number|null} setTimeout handle, or null if suppressed
 */
export function startLongPressTimer(onLongPress, opts = {}) {
  const { longPressMs = 800, rapidTapWindowMs = RAPID_TAP_WINDOW_MS } = opts;
  if (Date.now() - _lastTapAt < rapidTapWindowMs) return null;
  return setTimeout(() => { try { onLongPress?.(); } catch (e) { console.error(e); } }, longPressMs);
}

/**
 * Bind tap + long-press gesture to a task row element.
 * Used by dashboard's `.task-card` and calendar's `.cal-day__task`.
 *
 * - Tap that starts on the completion circle (`checkSelector`): fires
 *   `onComplete(entryKey, dateKey)` — the deliberate complete target (X5).
 * - Tap anywhere else on the row: fires `onTap(entryKey, dateKey)` (open detail).
 * - Long-press (>= longPressMs): fires `onLongPress(entryKey, dateKey)`.
 * - If `isTapBlocked(entryKey, dateKey)` returns true, a circle tap fires `onTap`
 *   (open detail) instead of completing (used for past-incomplete-daily).
 * - Movement past `moveThreshold` px cancels the press timer (so scrolling
 *   doesn't trigger an accidental long-press).
 * - Rapid-tap suppression: if any task was tapped in the last `rapidTapWindowMs`,
 *   skip the long-press timer entirely (user is clearly marking-complete, not
 *   reaching for the menu).
 *
 * Reads `entryKey`/`dateKey` from row.dataset. Both must be set by the renderer.
 */
export function bindTaskRowGesture(row, opts) {
  const {
    longPressMs = 800,
    moveThreshold = 10,
    rapidTapWindowMs,
    onTap,
    onComplete,
    onLongPress,
    isTapBlocked,
    // When true, a tap ANYWHERE on the row completes it and long-press opens the
    // menu (onLongPress). When false (legacy), only a tap on the check circle
    // completes; tapping elsewhere opens (onTap). A blocked tap (isTapBlocked,
    // e.g. a past overdue daily) always falls back to onTap regardless of mode.
    tapCompletes = false,
    checkSelector = '.task-card__check, .cal-day__task-check, .cal-wstrip-panel__task-check',
  } = opts || {};
  const entryKey = row.dataset.entryKey;
  const dateKey = row.dataset.dateKey;
  let didLongPress = false;
  let pressTimer = null;
  let startX = 0, startY = 0;
  let startedOnCheck = false;

  row.addEventListener('pointerdown', (e) => {
    didLongPress = false;
    // X5: a press starting on the completion circle completes; anywhere else
    // opens the detail sheet (onTap). Only when an onComplete handler is given.
    startedOnCheck = !!(onComplete && checkSelector && e.target.closest(checkSelector));
    startX = e.clientX;
    startY = e.clientY;
    clearTimeout(pressTimer);
    pressTimer = startLongPressTimer(() => {
      didLongPress = true;
      pressTimer = null;
      onLongPress?.(entryKey, dateKey);
    }, { longPressMs, rapidTapWindowMs });
  });

  row.addEventListener('pointermove', (e) => {
    if (pressTimer && (Math.abs(e.clientX - startX) > moveThreshold || Math.abs(e.clientY - startY) > moveThreshold)) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  });

  row.addEventListener('pointerup', () => {
    clearTimeout(pressTimer);
    pressTimer = null;
    if (didLongPress) return;
    recordTap();
    const blocked = !!(isTapBlocked && isTapBlocked(entryKey, dateKey));
    if (tapCompletes) {
      if (blocked) onTap?.(entryKey, dateKey);
      else onComplete?.(entryKey, dateKey);
    } else if (startedOnCheck && !blocked) {
      onComplete?.(entryKey, dateKey);
    } else {
      onTap?.(entryKey, dateKey);
    }
  });

  const cancel = () => { clearTimeout(pressTimer); pressTimer = null; };
  row.addEventListener('pointerleave', cancel);
  row.addEventListener('pointercancel', cancel);
  row.addEventListener('contextmenu', (e) => e.preventDefault());
}

/**
 * Lock a button while an async action runs. Disables the button, adds an
 * `.is-loading` class for optional spinner CSS, runs the action, and always
 * re-enables (even on throw). Use anywhere a tap triggers a Firebase write
 * that shouldn't be repeated by rapid-tap or a slow network.
 *
 * @param {HTMLElement|null} btn - the button element (no-op if null)
 * @param {Function} asyncFn - the work to run; should return a Promise
 * @returns {Promise<any>} - resolves with asyncFn's return value
 */
export async function withButtonLock(btn, asyncFn) {
  if (!btn) return asyncFn();
  if (btn.disabled) return; // already locked — bail (rapid-tap)
  btn.disabled = true;
  btn.classList.add('is-loading');
  try {
    return await asyncFn();
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-loading');
  }
}

/**
 * Safe localStorage.setItem wrapper. Returns true on success, false on failure
 * (quota exceeded, private browsing, blocked). On failure, optionally toasts.
 */
export function safeLocalStorageSet(key, value, { showToastFn } = {}) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn(`[safeLocalStorageSet] ${key} write failed:`, e?.message || e);
    if (showToastFn) showToastFn('Storage is full or unavailable; preference not saved.');
    return false;
  }
}

/**
 * Bind Escape key to close a sheet/popover/overlay.
 * Returns a cleanup function. Pass the overlay/sheet element and a close fn.
 */
export function bindEscapeToClose(overlayEl, onClose) {
  if (!overlayEl || typeof onClose !== 'function') return () => {};
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}

/**
 * Validate a stored ID (from localStorage) is still valid by checking against
 * a lookup object. Returns the ID if present, null otherwise. Used to defend
 * against stale ID references after the underlying record is deleted.
 */
export function validateStoredId(storedId, lookupObj) {
  if (!storedId || !lookupObj) return null;
  return Object.prototype.hasOwnProperty.call(lookupObj, storedId) ? storedId : null;
}

/**
 * Close the task detail bottom sheet, persisting any pending slider override first.
 * Used by dashboard, kid, calendar, tracker — each had a near-identical inline copy
 * of this logic that drifted independently.
 *
 * Two-phase close:
 *   1. If `pendingOverride` ({ entryKey, dateKey, value }) is non-null, persist
 *      `value === 100 ? null : value` to schedule/{dateKey}/{entryKey}/pointsOverride
 *      via `multiUpdate`, sync the in-memory schedule entry through
 *      `applyToScheduleEntry`, and (if the task is already completed) write the
 *      override onto the completion record via `writeCompletion`.
 *   2. Animate the sheet out (300ms) and clear `mount.innerHTML`. Calls
 *      `onClosed()` after the unmount.
 *
 * Caller is responsible for clearing its own `pendingSliderOverride` variable
 * before calling — pass the snapshotted value in. Keeps the helper unaware of
 * any specific module's state.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.mount - the sheet mount element (taskSheetMount usually)
 * @param {object|null} opts.pendingOverride - { entryKey, dateKey, value } or null
 * @param {object} opts.completions - completion map { entryKey: completion }
 * @param {Function} opts.multiUpdate - shared/firebase.js multiUpdate
 * @param {Function} opts.writeCompletion - shared/firebase.js writeCompletion
 * @param {Function} [opts.applyToScheduleEntry] - (entryKey, dateKey, override) => void; mutate the page-local schedule snapshot
 * @param {Function} [opts.onClosed] - called after the sheet is unmounted (e.g., page render)
 */
export async function closeTaskSheet({ mount, pendingOverride, completions, multiUpdate, writeCompletion, applyToScheduleEntry, onClosed }) {
  if (pendingOverride) {
    const { entryKey, dateKey, value } = pendingOverride;
    const override = value === 100 ? null : value;
    await multiUpdate({ [`schedule/${dateKey}/${entryKey}/pointsOverride`]: override });
    if (applyToScheduleEntry) applyToScheduleEntry(entryKey, dateKey, override);
    if (completions && completions[entryKey]) {
      completions[entryKey].pointsOverride = override;
      await writeCompletion(entryKey, completions[entryKey]);
    }
  }
  const overlay = document.getElementById('bottomSheet');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => { mount.innerHTML = ''; if (onClosed) onClosed(); }, 300);
  } else {
    mount.innerHTML = '';
    if (onClosed) onClosed();
  }
}
