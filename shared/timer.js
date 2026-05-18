// shared/timer.js — pure logic for activity timers. No DOM. No Firebase.

export function elapsedMs(timer, nowMs = Date.now()) {
  if (!timer) return 0;
  const { startedAt, pausedAt, accumulatedMs = 0 } = timer;
  if (pausedAt) return accumulatedMs;
  return accumulatedMs + Math.max(0, nowMs - startedAt);
}

export function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function pause(timer, nowMs = Date.now()) {
  if (!timer || timer.pausedAt) return timer;
  return {
    ...timer,
    pausedAt: nowMs,
    accumulatedMs: (timer.accumulatedMs || 0) + Math.max(0, nowMs - timer.startedAt)
  };
}

export function resume(timer, nowMs = Date.now()) {
  if (!timer || !timer.pausedAt) return timer;
  return {
    ...timer,
    startedAt: nowMs,
    pausedAt: null
    // accumulatedMs unchanged — banked from pause
    // originalStartedAt unchanged — preserved through spread
  };
}

export function finalDurationMin(timer, nowMs = Date.now()) {
  const ms = elapsedMs(timer, nowMs);
  return Math.max(1, Math.round(ms / 60000));
}

export function isForgotten(timer, nowMs = Date.now()) {
  if (!timer || timer.pausedAt) return false;
  return (nowMs - timer.startedAt) > 6 * 60 * 60 * 1000;
}
