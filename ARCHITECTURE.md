# MIZAN SOLAR AND ELECTRONICS — Business Monitor: Architecture

Plain HTML/CSS/JS, no build step, no backend. Classic scripts share one global `MZ` namespace
(so it also works if index.html is opened directly, and on GitHub Pages).

```
index.html            App shell (nav + <main> + dialog)
manifest.webmanifest  PWA manifest
sw.js                 Service worker (cache-first app shell, offline)
css/styles.css        White / dark-green / subtle-blue theme, mobile-first
icons/                App icons
js/utils.js           Money (2-dp), dates, validation, escaping       (pure, unit-tested)
js/db.js              IndexedDB open/migrate, tx helpers, meta
js/inventory.js       Products, purchases, adjustments, history
js/customers.js       Customers, payments, balances
js/sales.js           Atomic sale (stock check + deduction + payment), invoices
js/expenses.js        Expenses
js/analytics.js       Dashboard + reports (pure functions over records, unit-tested)
js/backup.js          JSON export / validate / import (replace) with checksum
js/charts.js          Tiny canvas bar/line charts (offline, no dependency)
js/ui.js              Helpers: dialog, toast, forms, tables
js/views.js           Screens: dashboard, sales, inventory, customers, expenses, reports, backup
js/app.js             Router + startup + service worker registration
tests/                Node logic tests + Playwright browser test
```

## IndexedDB stores
products, stockMovements, customers, sales, payments, expenses, meta.
Money = numbers rounded to 2 decimals. Every write that touches several stores is ONE transaction.

Costing: weighted-average cost. A purchase updates product cost = (oldQty*oldCost + newQty*newCost)/(oldQty+newQty).
Sale line profit = (price - cost at time of sale) * qty. Sale profit = sum(lines) - discount.
Gross profit = sales profit. Net profit = gross profit - expenses.
Customer balance = sum(sale totals) - sum(payments). Payments collected later are applied to oldest dues first.
