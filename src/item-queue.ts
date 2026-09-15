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
    const currentViewport = `${scrollX},${scrollY},${innerWidth},${innerHeight}`;
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
        && rect.top < innerHeight && rect.left < innerWidth;
      (inView ? visible : background).add(item);
    }
    pending.clear();
    const processed: HTMLElement[] = [];
    try {
      for (const queue of [visible, background]) {
        for (const item of queue) {
          if (processed.length && performance.now() - start >= 8) break;
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
    hasWork() {
      return scheduled;
    },
    add(item: HTMLElement) {
      pending.add(item);
      schedule();
    },
  };
}
