export function createItemQueue(
  process: (item: HTMLElement) => void,
  afterBatch?: (items: HTMLElement[]) => void,
) {
  const pending = new Set<HTMLElement>();
  const visible = new Set<HTMLElement>();
  const background = new Set<HTMLElement>();
  let scheduled = false;
  let viewport = '';

  function flush() {
    const start = performance.now();
    const doc = typeof document !== 'undefined' ? (document.scrollingElement || document.documentElement) : null;
    const sx = typeof scrollX !== 'undefined' ? scrollX : (doc?.scrollLeft ?? 0);
    const sy = typeof scrollY !== 'undefined' ? scrollY : (doc?.scrollTop ?? 0);
    const w = typeof innerWidth !== 'undefined' ? innerWidth : 0;
    const h = typeof innerHeight !== 'undefined' ? innerHeight : 0;
    const currentViewport = `${sx},${sy},${w},${h}`;
    if (viewport !== currentViewport) {
      visible.forEach(item => pending.add(item));
      background.forEach(item => pending.add(item));
      viewport = currentViewport;
    }
    // Read visibility before processing items can change layout.
    for (const item of pending) {
      visible.delete(item);
      background.delete(item);
      if (!item.isConnected) continue;
      const rect = item.getBoundingClientRect();
      const inView = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
        && rect.top < h && rect.left < w;
      (inView ? visible : background).add(item);
    }
    pending.clear();
    const processed: HTMLElement[] = [];
    try {
      processQueues: for (const queue of [visible, background]) {
        for (const item of queue) {
          if (processed.length && performance.now() - start >= 8) break processQueues;
          queue.delete(item);
          if (!item.isConnected) continue;
          process(item);
          processed.push(item);
        }
      }
    } finally {
      scheduled = false;
      if (pending.size || visible.size || background.size) schedule(true);
      if (processed.length) afterBatch?.(processed);
    }
  }

  function schedule(continuing = false) {
    if (scheduled) return;
    scheduled = true;
    // Yield between slices without requiring a new frame for every batch.
    if (continuing) setTimeout(flush, 0);
    else requestAnimationFrame(flush);
  }

  return {
    clear() {
      pending.clear();
      visible.clear();
      background.clear();
    },
    hasWork() {
      return scheduled;
    },
    add(item: HTMLElement) {
      pending.add(item);
      schedule();
    },
  };
}
