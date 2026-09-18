# Compare Panel integration, performance improvements, small fixes

### Perk recommendations

- Added the option to show Aegis recommendations in DIM's **Compare** panel perk selector, using the extension's familiar colors: selected recommendations in green, owned but unselected in blue, missing in red, others in gray. Clarity of selection might not be quite sufficient, but it's a good first step.
  - Perk order respects the user's "Strict Rank" / "Owned Perks First" selection.
  - **Compare** grades/recommendations are updated when different perks are previewed, without changing equipped perks or inventory grades.
  - Included a PvE/PvP toggle when in **Scoring > Activity > Both** mode.
- Added the option to show Aegis recommendations in DIM's **Overview** perk selector (the on-click popup).
  - Hid duplicate perk/masterwork recommendations in the sidebar / inline details when Overview recommendations are enabled.
  - Included a PvE/PvP toggle when in **Scoring > Activity > Both** mode.
  - Allowed the popup to expand only when perks needed more space, while preserving DIM's minimum width.
- Recommendation views for both Compare and Overview can be toggled under **Analysis > Perk Analysis**.
- Added List layout to Compare, and updated DIM's list layout in Overview, to a view better able to manage the larger numbers of perks that can now be listed (since there might be three perks in a given column, plus three more recommended).
- Added masterwork recommendations below the perks in Compare and Overview, with highlighted badges for matching masterworks.

### Perk tooltips

- Added the option to show Aegis PvE tiers, ranks, and analysis in perk tooltips throughout DIM. 
  - Perk ratings are cached locally, and previously downloaded ratings are retained when a refresh fails.
  - Adjusted tooltip placement and pointer alignment to fit the expanded cards, including near screen edges and when a hovered perk moves.
- Added colored Selected, Selectable, and Missing labels to rich-tooltip headers for Aegis-recommended perks, when the tooltips are opened from a recommendation view.
- Localized rating labels and settings across English, Spanish, Korean, Japanese, Simplified Chinese, and Traditional Chinese. Translated perk and origin-trait analyses through the same locale system as weapon analyses, added Korean translations, and retained source-language fallback for missing entries.
- Matched sidebar tier badges to the tooltip’s tier colors and formatting, which are more readable at these sizes.

### Badges and responsiveness

- Extended Bottom Strip badges to supported DIM tiles in Compare, Armory, vendors, and item pickers.
- Reduced scrolling stalls associated with Bottom Strip layout and unnecessary badge-dimming checks.
- Made badge appearance changes reuse existing grades and respond to the latest settings during rapid adjustments.
- Both sizing sliders now update the DIM inventory continuously while dragging. Renamed them from **Size** and **Size** (oops!) to **Text Size** and **Badge Scale**.
- Fixed Bottom Strip height and tile spacing to properly grow and shrink with **Badge Scale**.

### Settings and item details

- Fixed Perk Card width mode resetting to **Fixed** when switching between PvE, PvP, and Both views.
- Improved the version pill to cleanly expand when performing update checks, instead of breaking the menu header.
- Prevented masterwork header textures from stretching when Aegis adds item details; extended the background color beneath the texture instead.
- Added the option to turn **Tile Glow** off completely, and made glow settings available in both Standard and 2-Tier grading modes.
