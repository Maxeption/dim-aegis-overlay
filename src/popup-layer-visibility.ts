/** DIM retains item popups underneath later Armory portals. Their sidebars must
 * follow that layer's visibility, including keyboard navigation and lazy loading. */
export function initPopupLayerVisibility() {
  const relevant = '.item-popup, .armory';
  function update() {
    const sheets = [...document.querySelectorAll('.armory')]
      .map(armory => armory.closest('[role="dialog"]'))
      .filter((sheet): sheet is Element => !!sheet && !sheet.closest('[hidden]'));
    for (const popup of document.querySelectorAll<HTMLElement>('.item-popup')) {
      // DIM appends each new portal after the existing layers. A popup opened
      // from Armory is later than that sheet and must keep its own sidebar.
      const covered = sheets.some(sheet => !popup.contains(sheet) &&
        !!(popup.compareDocumentPosition(sheet) & Node.DOCUMENT_POSITION_FOLLOWING));
      if (popup.hasAttribute('data-aegis-covered-by-armory') !== covered) {
        popup.toggleAttribute('data-aegis-covered-by-armory', covered);
        document.dispatchEvent(new Event('aegis-popup-layer-changed'));
        document.dispatchEvent(new Event('aegis-overview-resize'));
      }
    }
  }
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
      node instanceof Element && (node.matches(relevant) || node.querySelector(relevant))))) update();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  update();
}
