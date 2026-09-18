import { COMPARE_BUCKET_SELECTOR } from './compare-selectors';

type Fiber = { return?: Fiber; alternate?: Fiber; child?: Fiber; sibling?: Fiber; stateNode?: { current?: Fiber }; memoizedProps?: { children?: unknown } };

function currentProps(element: Element): { children?: unknown } | undefined {
  const key = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
  if (!key) return;
  const fiber = (element as unknown as Record<string, Fiber>)[key];
  const ancestors = new Set<Fiber>();
  const queue = [fiber];
  let root: Fiber | undefined;
  for (let i = 0; i < queue.length && i < 200; i++) {
    const node = queue[i];
    if (ancestors.has(node)) continue;
    ancestors.add(node);
    if (node.alternate) queue.push(node.alternate);
    if (node.return) queue.push(node.return);
    else if (node.stateNode?.current) root = node.stateNode.current;
  }
  if (!root) return;
  const pending = [root];
  for (let i = 0; pending.length && i < 1000; i++) {
    const node = pending.pop()!;
    if (node === fiber || node === fiber.alternate) return node.memoizedProps;
    if (node.sibling) pending.push(node.sibling);
    if (ancestors.has(node) && node.child) pending.push(node.child);
  }
  return undefined;
}

// Compare's current rows include simulated socket choices; a tile's fiber can still point at the previous render.
export function getCompareItem<T extends { id?: string; hash: number }>(element: HTMLElement, fallback: T): T {
  const bucket = element.closest(COMPARE_BUCKET_SELECTOR);
  if (!bucket || !fallback.id) return fallback;
  const propsKey = Object.keys(bucket).find(key => key.startsWith('__reactProps$'));
  // Prefer the committed tree: React's DOM props handle can retain an older children value.
  const props = currentProps(bucket) || (propsKey ? (bucket as unknown as Record<string, { children?: unknown }>)[propsKey] : undefined);
  if (!props) return fallback;
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
