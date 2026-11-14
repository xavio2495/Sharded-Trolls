"use client";

let ready = false;
const waiting = new Set<() => void>();

/** Called once when the preloader hands the page over. */
export function signalReady() {
  if (ready) return;
  ready = true;
  // Run on a clean stack: called from an animation callback, anything created synchronously here would be
  // owned by the caller's animation context and reverted along with it when the caller unmounts.
  queueMicrotask(() => {
    waiting.forEach((cb) => cb());
    waiting.clear();
  });
}

/** Runs `cb` when the page is handed over (immediately if it already was). Returns an unsubscribe. */
export function whenReady(cb: () => void) {
  if (ready) {
    cb();
    return () => {};
  }
  waiting.add(cb);
  return () => waiting.delete(cb);
}

/** True once the page has been handed over (e.g. when coming back to an already-shown page). */
export function isReady() {
  return ready;
}
