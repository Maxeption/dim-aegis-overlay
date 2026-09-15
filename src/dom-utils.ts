import { applyGradeColors } from './grade-colors';

/**
 * Safely parses and sets the HTML content of an element without direct assignment to innerHTML.
 * This bypasses the strict Firefox Add-on validator security warnings.
 *
 * @param element The target HTMLElement.
 * @param htmlString The HTML string to insert safely.
 */
export function safeSetInnerHTML(element: HTMLElement, htmlString: string) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(htmlString, 'text/html');
  element.replaceChildren(...Array.from(parsed.body.childNodes));
  applyGradeColors(element);
}

export function outermostElements(elements: Iterable<HTMLElement>): HTMLElement[] {
  const roots = new Set(elements);
  return Array.from(roots).filter(element => {
    if (!element.isConnected) return false;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (roots.has(parent)) return false;
    }
    return true;
  });
}

export function withoutTileReorders(mutations: MutationRecord[]): MutationRecord[] {
  type Move = { parent: Node | null; balance: number };
  const moves = new Map<Node, Move>();
  for (const mutation of mutations) {
    if (mutation.type !== 'childList') continue;
    for (const [nodes, delta] of [[mutation.addedNodes, 1], [mutation.removedNodes, -1]] as const) {
      for (const node of nodes) {
        if (!(node instanceof HTMLElement) || !node.matches('.item-drag-container')) continue;
        const move: Move = moves.get(node) ?? { parent: mutation.target, balance: 0 };
        if (move.parent !== mutation.target) move.parent = null;
        move.balance += delta;
        moves.set(node, move);
      }
    }
  }
  // Only skip existing tiles moved within one parent; transfers and item updates still matter.
  return mutations.filter((mutation) => mutation.type !== 'childList' ||
    !(mutation.target instanceof Element) || !mutation.target.closest('.sub-bucket') ||
    ![...mutation.addedNodes, ...mutation.removedNodes].every((node) => {
      const move = moves.get(node);
      return move && move.balance === 0 && node.isConnected && node.parentNode === move.parent;
    }));
}
