# Compact options prototype

Branch: `feat/compact-options`, based on customization commit `5b1415f`.

The popup remains 320 CSS pixels wide. Four tabs group badges, scoring, tooltip settings, and data maintenance. Existing controls and setting values are preserved; shorter headings follow the existing translation tables in all six supported languages.

Setting labels and segmented choices share a row. Short option names keep every choice visible, with the original descriptions retained as localized tooltips and accessible names. Upgrade styles use the actual badge icons. Position arrows sit below Style and disappear for Notch and Bottom. Numeric size controls keep their slider and current value inline. Separators divide sections rather than individual options.

The header and tab bar stay visible. Each panel scrolls within the remaining viewport and remembers its position while switching tabs. The comparison's custom scrollbar follows the active panel; the current-menu preview retains its original whole-page scrolling.

The title, four actions, and version share one header row. Preview uses DIM Dark's `#1e222a` background and reserves the same height for every badge style and text scale. Its tile geometry follows DIM's square artwork and separate power strip. Badge markup matches the installed customization test build, including conditional wide badges, the rounded split wrapper, transition classes, perfect-roll markers, and square bottom corners on glowing tiles. The None selector uses a centered CSS symbol without font-baseline offsets. A browser audit compares 96 preview variants with that test build's badge renderer.

This is a review prototype, not an installed playtest or submitted PR. The initial tab is Badges. Keyboard arrows, Home, and End navigate tabs. Color and grading editors are embedded in Badges and Scoring, replacing the paintbrush and cogwheel entry buttons. A shared three-tile Preview stays docked below both tabs' scrolling content. Tiles have no click targets.

In the extension, Preview requests up to three evaluated weapons from an open DIM tab, preferring distinct names and grade combinations and retaining the same samples while settings change. Only those three weapons are re-evaluated on request; color edits update locally without inventory requests. Artwork, power and grades come from DIM and the existing overlay evaluation. The standalone comparison has no extension connection to Zen, so it explicitly labels its illustrative fallback items. Inventory messaging and DIM's background-image markup are covered by browser fixtures; live Zen validation is still pending.

Option highlights slide over 150 ms. Dependent badge/scoring rows expand and collapse over 200 ms, with immediate setting changes and inert collapsed controls. Tabs crossfade over 140 ms with a 5 px directional shift; the outgoing panel immediately becomes inert and leaves the accessibility tree. The tab bar stays fixed and panel height changes immediately. Initial rendering and reselecting the active tab do not animate. System reduced-motion preferences disable these transitions. No animation dependency is added.

Build with the existing TypeScript/build commands, then run `node mockups/options/server.cjs` from this checkout. Open `http://127.0.0.1:4319` for the comparison. The current-menu comparison reads the sibling `aegis-custom-grades/dist` directory. The preview uses in-memory sample settings: refreshing discards edits, and sync calls do not reach extension services.

Verification: TypeScript and extension build; four tabs at 320 px across six languages; embedded color and criteria editors, live saves and resets, docked preview at full and short viewport heights; rapid animation reversals, intermediate reveal heights, collapsed focus handling, reduced motion, idle cleanup, and highlight alignment. Full installed-extension regression testing is deferred until the layout is accepted.
