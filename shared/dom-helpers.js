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
