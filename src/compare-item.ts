import { COMPARE_BUCKET_SELECTOR } from './compare-selectors';

// Compare's current rows include simulated socket choices; a tile's fiber can still point at the previous render.
export function getCompareItem<T extends { id?: string; hash: number }>(element: HTMLElement, fallback: T): T {
  const bucket = element.closest(COMPARE_BUCKET_SELECTOR);
  if (!bucket || !fallback.id) return fallback;
  const propsKey = Object.keys(bucket).find(key => key.startsWith('__reactProps$'));
  if (!propsKey) return fallback;
  const props = (bucket as unknown as Record<string, { children?: unknown }>)[propsKey];
  const queue: unknown[] = [props.children];
  for (let visited = 0; queue.length && visited < 40; visited++) {
    const node = queue.shift();
    if (Array.isArray(node)) { queue.push(...node); continue; }
    if (!node || typeof node !== 'object') continue;
    const child = node as { props?: { rows?: { item?: T }[]; children?: unknown } };
    const rows = child.props?.rows;
    if (Array.isArray(rows)) {
      const item = rows.find(row => row.item?.id === fallback.id && row.item?.hash === fallback.hash)?.item;
      if (item) return item;
    }
    if (child.props?.children) queue.push(child.props.children);
  }
  return fallback;
}
