// Release class names are opaque hashes. Compare is the dialog grid with
// explicit row sizing and direct row-header/cell children (unlike Organizer).
// Keep the named selectors for older DIM markup and beta.
export const COMPARE_BUCKET_SELECTOR = '[role="dialog"] [style*="grid-template-rows"]:has(> [role="rowheader"]):has(> [role="cell"]), [class*="Compare"][class*="_bucket"], [class*="Compare-bucket-"]';
// Item headers are direct grid children containing an item-aside wrapper and
// a native tile. Stat/perk cells must not become additional item columns.
export const COMPARE_HEADER_SELECTOR = ':scope > div:not([role]):has(> div > .item), [class*="CompareItem"][class*="_headerContainer"], [class*="CompareItem-headerContainer-"]';
