# Testing Aegis

Use Node.js 22 or later and npm. Install dependencies and browser runtimes:

```sh
npm ci
npm run test:browser:install
npm test
npm run build
```

`npm test` runs unit checks followed by all four browser suites: Compare/Overview,
Bottom Strip, the version pill, and perk-tooltip geometry. Browser fixtures run
offline and close their browser processes on success or failure. They do not use
your normal browser profile or require a fixed local port.

To run Firefox instead of Chromium, set `BROWSER_ENGINE=firefox` before running
`npm run test:browser`. In PowerShell:

```powershell
$env:BROWSER_ENGINE = 'firefox'
npm run test:browser
Remove-Item Env:BROWSER_ENGINE
```

For an installed Chromium browser, set `BROWSER_CHANNEL` to `msedge` or `chrome`.
Alternatively, set `BROWSER_PATH` to an executable. Do not combine a Chromium
channel with `BROWSER_ENGINE=firefox`. Playwright's patched Firefox runtime is
required for the automated Firefox suite; a normal Zen executable is not a
replacement for it.

CI installs Chromium and Firefox with their Linux dependencies, runs both browser
suites, builds the extension, and packages the artifacts.

## Fixtures and coverage

The checked-in DIM CSS excerpts and their provenance are in
[`tests/fixtures/dim`](../tests/fixtures/dim/README.md). These tests cover captured
standard and beta markup contracts. They supplement live compatibility testing.

The browser tests use synthetic items and mocked React ownership. They verify
layout, native event-handler preservation, simulated selection, tooltip geometry,
and cleanup without changing an account's equipment. They do not exercise the
Bungie API or prove that private DIM runtime interfaces remain unchanged.

Before release, check the combined extension in standard and beta DIM, in Firefox
or Zen and Chromium, both with and without DIMSUM:

- Compare several rolls and change preview perks, layout, order, and PvE/PvP mode.
- Toggle recommendations off and on; confirm native selectors return.
- In Overview, preview an owned perk and confirm **Apply Perks** remains available.
  Applying it is not necessary for a UI test.
- Hover and focus owned and missing perks, including near viewport edges. Check
  the first visible frame, arrow alignment, late content, Escape, and scrolling.
- Change language while the analysis feature is enabled. Spreadsheet commentary
  remains source text; interface labels should use the selected language.
- Drag both badge sliders, switch badge styles rapidly, search, and scroll a large
  vault. Check for missing, duplicate, stale, or incorrectly dimmed badges.
- Toggle DIMSUM's stats bar and check Bottom Strip spacing.

## Builds and packaging

`npm run build` type-checks without emitting JavaScript beside TypeScript, then
creates standalone extension bundles in `dist`. Bundlers prefer TypeScript source
even if an older checkout contains ignored generated `.js` files.

After staging new source files, run `npm run build:all`. Packaging writes separate
Chromium and Firefox ZIPs and a source ZIP in the repository root. Browser packages
use the appropriate manifest and preserve nested assets. The source ZIP includes
Git-tracked files, excluding ignored local settings and generated builds.

The package version remains the upstream version until a release version is
approved. Locally generated ZIPs are review artifacts, not published releases.

To update the installed Zen testing extension, use `npm run build:testing` before
the reload shortcut. The shortcut loads the existing testing files; it does not
compile source. See the README for configuration.
