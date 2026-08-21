# DIM Aegis & PvP Roll Overlay

A powerful **Chrome / Opera / Firefox browser extension** that overlays Aegis PvE, Finnald PvP, and LowCo Armor set bonus rankings directly inside [Destiny Item Manager (DIM)](https://app.destinyitemmanager.com) and [Winnower](https://winnower.garden).

It integrates Aegis's PvE meta spreadsheet, Finnald's PvP spreadsheet, local DIM `.txt` wishlists, LowCo Armor bonuses, and Light.gg's community Roll Appraiser into a unified, seamless HUD overlay.

---

##  Download & Install

### Firefox
Get it on Firefox Add-ons: **[Download for Firefox](https://addons.mozilla.org/en-US/firefox/addon/dim-aegis-overlay/)**

### Chrome & Opera
Get it on the chrome webstore: **[Download for Chromium-based browsers (Opera/Chrome/Brave/...)](https://chromewebstore.google.com/detail/dim-aegis-pvp-roll-overla/affllljndbmlmcpghkklkgifklobkokc)**

---

##  Key Features

| Feature | Description |
|---|---|
|  **Customizable Badge Overlays** | Choose between Standard grading (`S+`, `S`, `A`...) or the **2-Tier Grading** combination (`BS+`, `SA`, `SF`) displaying archetype tier and roll accuracy together. |
|  **Armor Set Bonuses (2pc / 4pc)** | Direct evaluation of armor set bonuses from LowCo and Aegis spreadsheets (`S/A`, `A/B`) on armor tiles and hover tooltips. |
|  **PvE & PvP Modes** | Switch seamlessly between Aegis's endgame PvE analysis and Finnald's curated PvP roll rankings. |
|  **Multi-Language Support (only in WIP)** | Full deep localization for English (`en`), Spanish (`es`), Korean (`ko`), Japanese (`ja`), Simplified Chinese (`zh-CHS`), and Traditional Chinese (`zh-CHT`). |
|  **Recommended Perks Card** | View matched, selectable, and missing perks on your weapon in real-time. Can be toggled as a side-attached panel or inline inside DIM item sheets. |
|  **Best in Category Comparison** | Compares weapon archetypes with category superiors (same frame and elemental damage type) to display meta viability. |
|  **Aegis Database Explorer** | Slide-out search catalog launched via a floating action button (FAB) inside DIM to browse, filter, and inspect all weapon rankings. |
|  **Vault Search & Filter Shortcuts** | Filter your inventory directly in DIM using `aegis:god`, `aegis:upgrade`, `aegis:p:s+`, `aegis:w:s`, `aegis:a:2p:s`, and more. |
|  **Winnower Support** | Seamless compatibility with [Winnower.garden](https://winnower.garden) table layouts. |
|  **Auto-Sync & Offline Cache** | Background updates check and refresh spreadsheet data every 24 hours with zero network latency when browsing items. |

---

##  How It Works

```
  Google Sheets (Aegis / Finnald / LowCo) + GitHub Wishlists + Light.gg
                               │
               background.ts (Service Worker)
       (fetches spreadsheets, handles alarms & IndexedDB/storage)
                               │
            ┌──────────────────┴──────────────────┐
            │                                     │
   main-world-content.ts                  lightgg-content.ts
   (intercepts DIM React nodes,          (syncs Roll Appraiser grades)
    annotates data-aegis-* attributes)
            │
            ▼
        content.ts
   (evaluates rolls, injects badges,
    manages Explorer & search filters)
            │
            ▼
        tooltip.ts
   (renders glassmorphic hover tooltips & recommendation cards)
```

---

##  Detailed Features

###  Recommended Perks Card
Inspect any weapon in DIM to see a dedicated checklist showing exactly which perks are matched, selectable (alternate options rolled), or missing:
- **Matched Perks** (`Green`): Currently active perks that match the spreadsheet god roll.
- **Selectable Perks** (`Dashed Blue`): Recommended perks rolled on the weapon but not currently active.
- **Missing Perks** (`Muted Red`): Desired perks absent on the current roll.

<img width="307" height="534" alt="Recommended Perks Checklist" src="https://github.com/user-attachments/assets/db9f72ac-a60f-4009-ab32-20b18e395e74" />

###  2-Tier Weapon Grading System
Optionally enable **2-Tier Badge Mode** in your settings to display both the archetype meta viability and the specific roll quality at a glance:
- **First Letter**: Archetype meta tier on the master list (`S`, `A`, `B`, `C`, `D`, `F`).
- **Remaining Letters**: Specific roll accuracy grade (`S+`, `S`, `A`, `B`...).
  - *Example: **BS+** indicates a B-Tier archetype with a perfect S+ god roll.*

<img width="203" height="247" alt="2-Tier Badge Demo" src="https://github.com/user-attachments/assets/26f87796-8183-4c45-9461-8b4710365f8f" />

###  Floating Aegis Database Explorer
Click the floating action button (FAB) in the bottom-right corner of DIM to open the slide-out catalog:
- **Filter Controls**: Filter by weapon category, frame archetype, element damage type, and activity drop source.
- **Vault Highlighting**: Click **"Filter in Vault"** to immediately highlight matching items in your DIM vault.
- **Destiny.Report Integration**: Click **"Destiny.Report"** to view in-depth community stats and usage data.

<img width="359" height="925" alt="Aegis Database Explorer" src="https://github.com/user-attachments/assets/66f301d7-0b78-40d7-8253-4ea8fae9029e" />

---

## ⌨️ DIM Vault Search Filter Shortcuts

Type these directly into the DIM search bar:

| Search Filter | Function |
|---|---|
| `aegis:god` | Highlights all S and S+ spreadsheet god rolls |
| `aegis:upgrade` | Highlights weapons with better recommended perks available to select |
| `aegis:p:s+` | Filters by perk roll grade (`s+`, `s`, `a`, `b`, `c`, `d`, `f`) |
| `aegis:w:s` | Filters by weapon archetype tier (`s`, `a`, `b`, `c`, `d`, `f`) |
| `aegis:a:2p:s` | Filters armor by 2-piece set bonus grade (`s`, `a`, `b`...) |
| `aegis:a:4p:a` | Filters armor by 4-piece set bonus grade |
| `aegis:s:raid` | Filters weapons by activity drop source (e.g. `raid`, `dungeon`, `trials`, `crucible`) |
| `aegis:p:>=b` | Supports comparison operators (`>=`, `>`, `<=`, `<`) for rolls and tiers |

---

##  Building from Source (Developers)

```bash
# Clone the repository
git clone https://github.com/Maxeption/dim-aegis-overlay.git
cd dim-aegis-overlay

# Install dependencies
npm install

# Compile TypeScript and package extension bundles
npm run build:all
```

The compiled extension and release zips will be generated inside the `/dist` directory. Open `chrome://extensions/` and select **Load unpacked** pointing to `/dist`.

---

##  Credits & Acknowledgments

- **Revadike/aegis-dim** – The "Recommended Perks" card overlay and category comparison layout were inspired by the original [Revadike/aegis-dim](https://github.com/Revadike/aegis-dim) project. Huge thanks to Revadike for their awesome design concepts!
- **Aegis** – For their comprehensive [Destiny 2: Endgame PvE Analysis Spreadsheet](https://docs.google.com/spreadsheets/d/1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY/).
- **Finnald (Pride Eternal)** – For their top-tier [PvP God Rolls & Meta Spreadsheet](https://docs.google.com/spreadsheets/d/1TVgtTRWNGEPi6OMlTLxXFSKUTi_ycwykhwuw8EW_jJ0/).
- **LowCo & Azra** – For their comprehensive [Armor Set Bonuses Spreadsheet](https://docs.google.com/spreadsheets/d/14LnzOhmeXzKaSV3OR35pQJkclg6vLC4YmKtlKTctY3o/).

---

##  Support

If you enjoy the extension and would like to support me, feel free to drop a tip on [Ko-fi](https://ko-fi.com/dilligafm8). Thank you so much!

---

##  License

MIT
