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

// Module-scoped "rapid-tap" timestamp shared across all bindings (dashboard + calendar).
// When the user is tapping tasks complete one after another, the next pointerdown
// within `rapidTapWindowMs` of the last successful tap doesn't start a long-press
// timer. Prevents spurious menu opens when the pointer slides between adjacent
// cards faster than pointerleave can reliably cancel the press timer.
let _lastTapAt = 0;

/**
 * Bind tap + long-press gesture to a task row element.
 * Used by dashboard's `.task-card` and calendar's `.cal-day__task`.
 *
 * - Tap: fires `onTap(entryKey, dateKey)`.
 * - Long-press (>= longPressMs): fires `onLongPress(entryKey, dateKey)`.
 * - If `isTapBlocked(entryKey, dateKey)` returns true, a tap fires `onLongPress`
 *   instead (used for past-incomplete-daily where toggling is forbidden).
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
    rapidTapWindowMs = 600,
    onTap,
    onLongPress,
    isTapBlocked,
  } = opts || {};
  const entryKey = row.dataset.entryKey;
  const dateKey = row.dataset.dateKey;
  let didLongPress = false;
  let pressTimer = null;
  let startX = 0, startY = 0;

  row.addEventListener('pointerdown', (e) => {
    didLongPress = false;
    startX = e.clientX;
    startY = e.clientY;
    clearTimeout(pressTimer);
    pressTimer = null;
    // Skip long-press detection when the user is in rapid-tap mode.
    if (Date.now() - _lastTapAt < rapidTapWindowMs) return;
    pressTimer = setTimeout(() => {
      didLongPress = true;
      pressTimer = null;
      onLongPress?.(entryKey, dateKey);
    }, longPressMs);
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
    _lastTapAt = Date.now();
    if (isTapBlocked && isTapBlocked(entryKey, dateKey)) {
      onLongPress?.(entryKey, dateKey);
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
