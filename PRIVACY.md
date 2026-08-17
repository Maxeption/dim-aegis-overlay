# Privacy Policy for DIM Aegis & PvP Roll Overlay

**Effective Date:** August 17, 2026  
**Last Updated:** August 17, 2026

## Overview
**DIM Aegis & PvP Roll Overlay** is an open-source browser extension designed to display community weapon rankings and perk recommendations directly inside Destiny Item Manager (DIM) and Winnower. 

We respect your privacy. This extension operates entirely on your local machine and **does not collect, store, transmit, or sell any personal user data**.

---

## 1. Information Collection and Usage
- **No Personal Data Collected:** The extension does not collect any personally identifiable information (PII), such as names, email addresses, IP addresses, location data, browsing history, or payment information.
- **No Tracking or Analytics:** There are no embedded tracking cookies, telemetry tools, or third-party analytics libraries included within the extension.
- **No User Account Required:** The extension does not require authentication or user accounts to function.

---

## 2. Permissions & Data Storage
The extension requests standard browser permissions solely for its core features:
- **`storage` / `unlimitedStorage`**: Used strictly on your local device to cache public weapon tier lists, perk spreadsheets, and your personal UI preferences (such as language, overlay positioning, and display styles). This data never leaves your browser.
- **`alarms`**: Used to schedule automatic background synchronization of public community spreadsheets and wishlists every 24 hours.
- **`tabs`**: Used to detect open Destiny Item Manager (DIM) tabs and broadcast setting updates so changes reflect immediately without requiring a manual page refresh.
- **Host Permissions (`destinyitemmanager.com`, `light.gg`, `docs.google.com`, `raw.githubusercontent.com`)**: Required to inject visual overlay badges on DIM item tiles and download public spreadsheet rankings.

---

## 3. Third-Party Services
The extension communicates with the following public endpoints strictly to retrieve static game rankings and spreadsheet data:
- **Google Sheets API / Google Docs**: To retrieve public weapon rankings authored by community theorycrafters (Aegis, Finnald).
- **GitHub (`raw.githubusercontent.com`)**: To retrieve public community wishlist definitions.
- **Light.gg**: To synchronize public weapon roll appraisals for offline viewing.

No user identifiers or personal data are transmitted during these requests.

---

## 4. Changes to This Privacy Policy
We may update this Privacy Policy from time to time. Any updates will be posted to this repository with a revised "Last Updated" date.

---

## 5. Open Source & Source Code
This extension is free and open source. You can inspect the entire source code at:  
[https://github.com/Maxeption/dim-aegis-overlay](https://github.com/Maxeption/dim-aegis-overlay)

---

## 6. Contact
If you have any questions or feedback regarding this Privacy Policy, please open an issue on GitHub:  
[https://github.com/Maxeption/dim-aegis-overlay/issues](https://github.com/Maxeption/dim-aegis-overlay/issues)
