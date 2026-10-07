# DIM tooltip fixtures

These files contain the PressTip CSS rules used by the tooltip geometry tests.
They were extracted from the deployed bundles captured on September 16, 2026:

- Standard DIM 8.142.0: `standard-main-11f731b9.css`
- Beta DIM 8.142.0.4889: `beta-main-134d5cf9.css`

The selectors and declarations were retained unchanged. Only rules whose selectors
contained the tooltip, arrow, or control class were included. The surrounding
document and React ownership objects in the tests are synthetic fixtures.

Source: [Destiny Item Manager](https://github.com/DestinyItemManager/DIM),
`src/app/dim-ui/PressTip.m.scss`. The adjacent `LICENSE` applies to these excerpts.

These snapshots verify the captured markup contracts; they do not prove
compatibility with every future DIM release. To check newer captured bundles,
set `DIM_AUDIT_ROOT` to a directory containing `standard-*.css` and `beta-*.css`.
