# New Version available

Please try out the latest version and report any problems or bugs.

Either clone the master branch and build it or download the latest release.

# Download
The extension is finally listed on FireFox!
Get it [HERE](https://addons.mozilla.org/en-US/firefox/addon/dim-aegis-overlay/)

I'm still in the procees of listing it on Chrome Webstore
Opera soon as well.

# DIM Aegis Overlay

A **Chrome / Opera / Firefox MV3 browser extension** that overlays Aegis wishlist rankings and recommended perk checklists directly inside [Destiny Item Manager (DIM)](https://app.destinyitemmanager.com). 

It integrates Aegis's meta spreadsheet rankings, local DIM-format `.txt` wishlists, and Light.gg's community Roll Appraiser grades into a unified, seamless HUD overlay inside DIM.

---

## Key Features

| Feature | Description |
|---|---|
| 🏅 **Badge Overlay Options** | Choose between standard grading (`S+`, `S`, `A`...) or the **2-Tier Grading** combination (`BS+`, `SA`, `SF`) indicating archetype tier and specific roll accuracy. |
| 📋 **Aegis Recommended Perks** | View matched, selectable, and missing perks on your weapon in real-time. Can be toggled as a side-attached panel or inline sheet. |
| 📊 **Best in Category Comparison** | Compares weapon archetype with category superiors (same frame/energy) to display viability and rankings. |
| 🔍 **Aegis Database Explorer** | A slide-out panel launched via a floating action button (FAB) inside DIM allowing you to search, filter, and browse all weapon rankings. |
| ⚡ **Vault Search & destiny.report** | One-click actions in the database explorer to filter specific items in your vault or inspect them on destiny.report. |
| ⚙️ **Refreshed Settings Menu** | Modernized layout utilizing segmented toggles, outline buttons, and a CSS-only hover-driven guide tooltip with badge previews. |
| 🔄 **Auto-sync** | Automatically checks for updates and refreshes databases in the background every 24 hours. |
| ✨ **Enhanced Perk Mapping** | Enhanced perks are automatically normalized to match their standard counterparts for wishlist checks. |

---

## How It Works

```
 Light.gg / Aegis wishlists
             │
  background.ts (fetches raw wishlist/spreadsheet)
  (serializes databases to IndexedDB & local storage)
             │
   ┌─────────┴─────────┐
   │                   │
  lightgg-content.ts   main-world-content.ts
  (scrapes Roll        (inspects React/Redux trees,
   Appraiser grades)    annotates elements with attributes)
   │                   │
   └─────────┬─────────┘
             │
        content.ts
   (isolated world, computes grades,
    injects badges & summary panels)
             │
        tooltip.ts
   (renders details hover tooltips)
```

### Script Directory

- `background.ts` — Background service worker; handles background database syncing, alarms, and cross-frame messages.
- `main-world-content.ts` — Main world execution script; intercepts React Fiber nodes inside DIM to extract item instances and hashes, injecting descriptive `data-aegis-*` attributes.
- `content.ts` — Content script; reads annotations, scores weapon instances, injects overlays, and coordinates side-panel detail views.
- `lightgg-content.ts` — Content script; scrapes Roll Appraiser grades from Light.gg in the background.
- `tooltip.ts` — Tooltip renderer; draws the custom glassmorphic hover panel.
- `popup.ts` — Settings popup logic; handles settings updates and sync triggers.

---

## Detailed Features

### 📋 Aegis Recommended Perks Card
Inspect any weapon in DIM to see a dedicated checklist showing exactly which perks are matched, selectable (inactive), or missing. Inspired by the excellent *Revadike/aegis-dim* userscript, this highlights:
- **Matcheable Perks**: Colored green (`aegis-chip-active`) to verify active perks.
- **Selectable Perks**: Highlighted in dashed blue (`aegis-chip-selectable`), pointing out recommended perks currently rolled but unselected.
- **Missing Perks**: Colored muted red (`aegis-chip-missing`) to show which wishlist perks are absent.
<img width="307" height="534" alt="{8A7DAFD7-7AD6-4392-A592-B180DA0784B1}" src="https://github.com/user-attachments/assets/db9f72ac-a60f-4009-ab32-20b18e395e74" />


### 2-Tier Weapon Grading System
Optionally toggle **2-Tier Badge Mode** in your settings to overlay archetype meta viability combined with specific roll accuracy:
- **First Letter**: Archetype meta tier on the Aegis master list (`S`, `A`, `B`, `C`, `D`, `F`).
- **Remaining Letters**: Specific roll accuracy grade (`S+`, `S`, `A`, `B`... etc.).
  - *Example: **BS+** means the weapon archetype is B-Tier, but your roll is a perfect S+.*
  <img width="203" height="247" alt="image" src="https://github.com/user-attachments/assets/26f87796-8183-4c45-9461-8b4710365f8f" />


### 🔍 Floating Aegis Database Explorer
Click the floating magnifying glass action button (FAB) in the bottom-right corner of DIM to slide out the database panel.
- **Filters**: Filter by category, archetype frame, and elemental damage type.
- **Collapsible Cards**: Click any weapon to expand its card and see action triggers.
- **Vault Filtering**: Click "Filter in Vault" to instantly highlight all instances in your DIM inventory.
- **Destiny.Report integration**: Click "Destiny.Report" to open the weapon's detailed profile page.
<img width="359" height="925" alt="{4E0821FD-F8EC-42A0-B863-ECDB1A4ACDE3}" src="https://github.com/user-attachments/assets/66f301d7-0b78-40d7-8253-4ea8fae9029e" />


---

## Installation (Unpacked Extension)

> No Chrome Web Store listing — load it as an unpacked extension in Developer Mode.

### Direct Download (Pre-built Package)

For Chrome:

1. Go to the [Releases](https://github.com/Maxeption/dim-aegis-overlay/releases) page on GitHub.
2. Download the pre-built `dim-aegis-overlay-v1.2.0.zip` file.
3. Unzip the file to a permanent folder.
4. Open Chrome or Opera and navigate to `chrome://extensions/`.
5. Enable **Developer mode** (toggle in the top-right corner).
6. Click **Load unpacked** (top-left) and select the unzipped directory.

For Firefox:
1. Go to the [Releases](https://github.com/Maxeption/dim-aegis-overlay/releases) page on GitHub.
2. Download the pre-built `dim-aegis-overlay-v1.2.0.zip` file.
3. Unzip the file to a permanent folder.
4. Go to the "Manage Extensions"
5. Press the Gear at the top and select "Debug add-ons"
6. Press "Load Temporary Add-on" and select the unzipped directory.


### Compile from Source (Developers)
1. Clone and compile the repository:
   ```bash
   git clone https://github.com/Maxeption/dim-aegis-overlay.git
   cd dim-aegis-overlay
   npm install
   npm run build:all
   ```
2. The compiled extension and packaging ZIP will be compiled inside the `/dist` directory.
3. Open `chrome://extensions/` and load `/dist` as an unpacked extension.

---

## Configuration & Usage
1. Click the extension toolbar icon to open the refreshed settings popup.
2. **Scoring Engine**: Select between local Aegis evaluation or Light.gg Roll Appraiser syncing.
3. **Database Toggles**: Choose whether to sync spreadsheet metadata, local wishlist files, or both.
4. **Layout**: Switch the perks checklist between a side-docked panel (colliding-flipped dynamically when close to screen edges) or inline within the item details flow.
5. Click **Sync Wishlist** or **Sync Grades** to fetch the latest databases.

---

## Credits
- **Revadike/aegis-dim** – The "Aegis Recommended Perks" detail card overlay and category comparison layout features are inspired by the original [Revadike/aegis-dim](https://github.com/Revadike/aegis-dim) userscript. Huge thanks and credit to Revadike for their awesome design and layout concepts!
- **Aegis** - For their amazing weapon ranks spreadsheet! Check it out here [Destiny 2: Endgame Analysis](https://docs.google.com/spreadsheets/d/1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY/)
- **Finnald (Pride Eternal)** - For their awesome PvP god rolls & meta spreadsheet! Check it out here [PvP God Rolls & Meta Spreadsheet](https://docs.google.com/spreadsheets/d/1TVgtTRWNGEPi6OMlTLxXFSKUTi_ycwykhwuw8EW_jJ0/)
- **LowCo + Azra** - For their amazing armor set bonuses spreadsheet! Check it out here [Armor Set Bonuses](https://docs.google.com/spreadsheets/d/14LnzOhmeXzKaSV3OR35pQJkclg6vLC4YmKtlKTctY3o/htmlview)

##
If anyone wants to throw a few bucks my way so i can list this on the chrome store or just support me, here's my [Ko-fi](https://ko-fi.com/dilligafm8) I appreciate it !
## License
MIT
