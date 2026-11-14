"use client";

/**
 * Page-load task tracker. Anything the page needs before it is handed over (images and fonts)
 * registers a promise here; the preloader waits until every registered task has settled.
 */
let total = 0;
let done = 0;
const listeners = new Set<() => void>();
const waiters = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
  if (done === total) {
    waiters.forEach((w) => w());
    waiters.clear();
  }
}

/** Register work the page must finish before it is shown. Rejections count as finished. */
export function track<T>(work: Promise<T>): Promise<T> {
  total += 1;
  emit();
  const settle = () => {
    done += 1;
    emit();
  };
  work.then(settle, settle);
  return work;
}

/** Resolves once every task registered so far (and any registered while waiting) has settled. */
export function allLoaded(): Promise<void> {
  return new Promise((resolve) => {
    if (done === total) resolve();
    else waiters.add(resolve);
  });
}

/** Subscribe to progress 0..1 without re-rendering (the preloader's text is split into DOM the renderer doesn't own). */
export function onProgress(cb: (p: number) => void) {
  const l = () => cb(total === 0 ? 0 : done / total);
  listeners.add(l);
  l();
  return () => listeners.delete(l);
}
