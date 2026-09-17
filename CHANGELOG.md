# Changelog

## Unreleased

Changes since 1.9.5.

### Perk recommendations

- Added Aegis recommendations to DIM's Compare perk selector for barrels, magazines, traits, and origin traits.
- Distinguished selected recommendations in green, owned but unselected recommendations in blue, missing recommendations in red, and owned non-recommended perks in gray.
- Added solid selection outlines and dashed outlines for unselected perks, making selection visible independently of recommendation color.
- Ordered perks by Aegis recommendations and supported the **Owned Perks First** preference.
- Updated Compare grades and recommendations when different perks were previewed, without changing the equipped perks or inventory grades.
- Added optional recommendations to DIM's Overview perk selector while retaining native perk selection and **Apply Perks**.
- Added independent Compare and Overview controls under **Analysis > Perk Analysis**. Enabled Compare recommendations by default and left Overview recommendations off by default.
- Added saved Grid and List layouts to both selectors and a PvE/PvP recommendation switch in Both mode.
- Kept perk names and bubbles aligned in List mode and reserved space for the longest selectable name, preventing columns from shifting when selections changed.
- Added recommendation-colored name labels and smooth selection transitions, with reduced-motion support.

### Perk tooltips

- Added full DIM tooltips to missing recommendations, including descriptions, stat details, and Community Insight when available.
- Added Aegis PvE tiers, ranks, and analysis to perk tooltips throughout DIM, including origin traits and enhanced perks.
- Cached perk ratings locally and retained previously downloaded ratings when a refresh failed.
- Added a setting to show or hide Aegis PvE analysis without removing DIM's native tooltip content.
- Corrected tooltip placement and pointer alignment after analysis content expanded the card, including near screen edges and when the hovered perk moved.
- Prevented expanded perk tooltips from briefly appearing in their initial position before settling into place.
- Localized rating labels and settings across English, Spanish, Korean, Japanese, Simplified Chinese, and Traditional Chinese. Kept spreadsheet analysis in its original language.

### Badges and responsiveness

- Extended Bottom Strip badges to supported DIM tiles in Compare, Armory, vendors, and item pickers.
- Reduced scrolling stalls associated with Bottom Strip layout and unnecessary badge-dimming checks.
- Made badge appearance changes reuse existing grades and respond to the latest setting during rapid adjustments.
- Updated both sizing sliders continuously while dragging and renamed them **Text Size** and **Badge Scale** to clarify their different effects.
- Made Bottom Strip tile spacing grow and shrink with Badge Scale while keeping the weapon icon unchanged.
- Corrected excess Bottom Strip height for current/potential grades and retained additional space for split PvE/PvP grades.
- Aligned Bottom Strip badges directly below weapon icons when DIMSUM hid the stats bar.
- Added **Tile Glow > Off** and made glow settings available in both Standard and 2-Tier grading modes.

### Settings and item details

- Replaced the separate update-check status with an expanding version pill, preventing status messages from shifting the settings header.
- Added animated status transitions, keyboard access, reduced-motion support, and localized update-check messages.
- Prevented masterwork header textures from stretching when Aegis added item details; extended the background color beneath the texture instead.
