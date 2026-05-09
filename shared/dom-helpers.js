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
 *
 * Reads `entryKey`/`dateKey` from row.dataset. Both must be set by the renderer.
 */
export function bindTaskRowGesture(row, opts) {
  const {
    longPressMs = 800,
    moveThreshold = 10,
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
