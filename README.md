# MIZAN SOLAR AND ELECTRONICS — Business Monitor

Offline business monitoring app (HTML + CSS + vanilla JS + IndexedDB, installable PWA). No server, no cloud, no API.
All records stay inside the browser on the device you use. See `ARCHITECTURE.md` for the design.

## Put it online with GitHub Pages (free) — so phone and PC can both open it
1. Create a new GitHub repository (e.g. `mizan-monitor`) and upload **all files in this folder** (keep the folder structure).
2. Repository → Settings → Pages → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.
3. After a minute open `https://<your-username>.github.io/mizan-monitor/` on your PC and phone.
4. Phone: browser menu → **Add to Home screen / Install app**. After the first visit it works with no internet.
   (Tip: make the repository **private** if you like; GitHub Pages for private repos needs a paid plan, otherwise public is fine
   because the page contains only the program — your business records are never uploaded.)

## Run on your PC without GitHub
Double-click `index.html` (works, but offline install/caching needs http). Or in this folder run `python3 -m http.server 8000` and open http://localhost:8000.

## Daily use
Stock → add products. Sales → record each sale (stock reduces automatically, invoice can be printed). Expense → daily costs.
Home → live dashboard. Reports → daily/weekly/monthly. **Backup → download a backup file every week.**

## Moving data between PC and phone
Backup → *Download backup file* → send the file to the other device → Backup → choose file → confirm.
Import REPLACES everything on that device, so work on one device at a time and always use the newest file.

## Important things to know
* Data lives in the browser. Clearing "site data" or uninstalling the browser deletes it — keep backups.
* Costing uses the **average cost**: when you add stock at a new price, the product's cost becomes the weighted average.
  Sale profit uses the cost at the time of sale. **Gross profit** = sales profit; **Net profit** = gross profit − expenses.
* After you change any code file, increase `CACHE_VERSION` in `sw.js` so phones download the update.
* Charts are drawn by a small built-in module (`js/charts.js`), so no internet or library is needed.

## Tests
`node tests/logic.test.js` (money, dates, reports) · `node tests/e2e.js` (real-browser test of the whole app; serve the folder on port 8765 first).
