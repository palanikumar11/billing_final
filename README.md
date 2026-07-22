# RetailPro — Retail & GST Billing Software

A production-oriented, offline-first Retail Billing + GST Invoice Management application
for Indian businesses. Built with **HTML5, CSS3, and vanilla JavaScript (ES6+)** and
designed to be hosted on **Cloudflare** (Pages + Workers + Workers KV).

## Architecture

- **Frontend:** Vanilla JS, no frameworks. Loaded as classic scripts under a single
  global `App` namespace so it runs from `file://` and from Cloudflare alike.
- **Local storage:** IndexedDB (via `js/store/db.js`) — the primary, offline-first store.
  All data is kept permanently in the browser and never auto-deleted.
- **Cloud persistence:** A Cloudflare Worker (`workers/worker.js`) backed by Workers KV
  provides permanent cloud sync + backup. The frontend syncs collections to it when a
  Worker URL is configured in Settings. R2 can be attached for large asset/backup blobs.

## First run

The app seeds itself with the business details from your supplied sample invoices
(**SRI EZHUMALAIYAN TRADERS**, Sivakasi — GSTIN `33HCIPM3297N1ZV`) plus a few demo
products/customers so every screen is populated immediately. Change anything in
**Settings**.

**Add your logo (one click):** go to **Settings → Logo & Signature → Upload** and pick
your logo image. It instantly appears in every invoice header and, on Retail Bills, as
the faint background watermark. (The logo was supplied as a rotated, 1.6 MB image
embedded in a PDF, so it's left as an upload rather than baked in — uploading a clean
PNG/JPEG keeps invoices crisp and small.) Do the same for the signature, stamp and UPI QR.

## Running locally

Just open `index.html` in a modern browser (Chrome/Edge/Firefox). IndexedDB works on
`file://`. For the best experience (and to test the Worker sync), serve the folder:

```
npx serve .          # or: python -m http.server 8080
```

## Deploying to Cloudflare

1. **Frontend →** Cloudflare Pages: point Pages at this repo/folder (no build step).
2. **Backend →** Cloudflare Worker:
   ```
   cd workers
   npm i -g wrangler
   wrangler kv namespace create BILLING_KV
   # put the returned id into wrangler.toml
   wrangler deploy
   ```
3. Copy the deployed Worker URL into **Settings → Cloud Sync → Worker URL** and set the
   same API token you configured in the Worker.

## Project layout

```
index.html            App shell (sidebar + views)
css/                  variables, base, components, print (invoice/A4)
js/
  app.js              Bootstrap, router, global keyboard shortcuts
  store/              db.js (IndexedDB), sync.js (Worker), seed.js (defaults)
  utils/              dom, format (currency/number-to-words), gst, csv, toast, modal
  modules/            dashboard, products, customers, suppliers, pos, purchases,
                      expenses, reports, inventory, history, invoices, settings, backup
workers/              worker.js + wrangler.toml (Cloudflare Worker + KV)
assets/               placeholder logo/icons
```

## GST logic

Place of supply drives the split automatically (no manual selection):
- **Tamil Nadu customer →** CGST 9% + SGST 9%
- **Any other state →** IGST 18%

## Invoice behaviour

- **Retail Bill:** header logo + faint centered logo watermark (5–10% opacity).
- **GST Tax Invoice:** header logo only, **no** watermark; PDF auto-generates
  Original / Duplicate / Triplicate copies in one document.
