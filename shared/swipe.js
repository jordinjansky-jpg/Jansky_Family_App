// swipe.js — Card swipe gesture handler (v2)
// Handles swipe-to-complete (right) and swipe-to-details (left) on task cards.
// No DOM rendering — only attaches touch event listeners.

const DEAD_ZONE = 15;
const THRESHOLD_PCT = 0.30;
const DRAG_RESISTANCE = 0.8;

export function initSwipe(container, { onComplete, onDetails }) {
  let activeCard = null;
  let startX = 0;
  let startY = 0;
  let swiping = false;
  let cancelled = false;

  function onTouchStart(e) {
    const card = e.target.closest('.task-card');
    if (!card) return;
    activeCard = card;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    swiping = false;
    cancelled = false;
  }

  function onTouchMove(e) {
    if (!activeCard || cancelled) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!swiping && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > DEAD_ZONE) {
      cancelled = true;
      resetCard();
      return;
    }
    if (!swiping && Math.abs(dx) < DEAD_ZONE) return;
    swiping = true;
    e.preventDefault();
    const dragX = dx * DRAG_RESISTANCE;
    activeCard.style.transform = `translateX(${dragX}px)`;
    activeCard.style.transition = 'none';
    const wrapper = activeCard.closest('.swipe-container');
    if (!wrapper) return;
    const rightStrip = wrapper.querySelector('.swipe-strip--right');
    const leftStrip = wrapper.querySelector('.swipe-strip--left');
    const cardWidth = activeCard.offsetWidth;
    const pct = Math.abs(dx) / cardWidth;
    if (dx > 0 && rightStrip) {
      rightStrip.classList.toggle('swipe-strip--visible', pct > 0.1);
      if (leftStrip) leftStrip.classList.remove('swipe-strip--visible');
    } else if (dx < 0 && leftStrip) {
      leftStrip.classList.toggle('swipe-strip--visible', pct > 0.1);
      if (rightStrip) rightStrip.classList.remove('swipe-strip--visible');
    }
  }

  function onTouchEnd(e) {
    if (!activeCard || cancelled) { activeCard = null; return; }
    if (!swiping) { activeCard = null; return; }
    const dx = e.changedTouches[0].clientX - startX;
    const cardWidth = activeCard.offsetWidth;
    const pct = Math.abs(dx) / cardWidth;
    const entryKey = activeCard.dataset.entryKey;
    const dateKey = activeCard.dataset.dateKey;
    if (pct >= THRESHOLD_PCT) {
      if (dx > 0 && onComplete) onComplete(entryKey, dateKey);
      else if (dx < 0 && onDetails) onDetails(entryKey, dateKey);
    }
    resetCard();
    activeCard = null;
  }

  function resetCard() {
    if (!activeCard) return;
    activeCard.style.transform = '';
    activeCard.style.transition = '';
    const wrapper = activeCard.closest('.swipe-container');
    if (wrapper) {
      wrapper.querySelectorAll('.swipe-strip').forEach(s => s.classList.remove('swipe-strip--visible'));
    }
  }

  container.addEventListener('touchstart', onTouchStart, { passive: true });
  container.addEventListener('touchmove', onTouchMove, { passive: false });
  container.addEventListener('touchend', onTouchEnd, { passive: true });

  return () => {
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('touchend', onTouchEnd);
  };
}
