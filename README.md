# SpendSphere

**Every rupee, in orbit.** A static web app that turns the bank, card and UPI alerts in your SMS into a spending dashboard: totals, categories, monthly trend, top merchants, weekday rhythm and a searchable transaction list.

Everything runs in the browser. There is no server, and your messages never leave the device.

## Using it

Browsers can't read SMS directly, so you import a backup:

1. On Android, install **SMS Backup & Restore** (SyncTech) and back up **Messages** to your phone.
2. Open the site in Chrome on the phone, pick how many months to analyse (1–24), and tap **Import SMS backup**. Choose the `sms-….xml` file.
3. Optional: in Chrome's menu, tap **Add to Home screen** to install it as an app. It works offline.

JSON exports (`[{ "address", "body", "date" }]`) also work. **Explore with demo data** shows a sample dashboard.

## How it works

| File | What it does |
| --- | --- |
| `docs/parser.js` | Finds transactions in SMS text (amount, debit/credit, merchant, bank), skips OTPs, reminders and failed payments, removes duplicate alerts, and assigns one of 14 categories |
| `docs/app.js` | Import, period selection, analytics and the dashboard UI (hand-drawn SVG charts, no libraries) |
| `docs/demo.js` | Generates a realistic sample inbox for the demo |
| `docs/sw.js` | Offline cache. Bump `VERSION` when you ship changes |

If a category is wrong, tap the transaction and pick the right one. The choice applies to every payment to that merchant.

## Hosting

GitHub Pages serves the `docs/` folder from `main`: **Settings › Pages › Deploy from a branch › `main` / `/docs`**.

To run it locally: `python -m http.server 5174 -d docs`
