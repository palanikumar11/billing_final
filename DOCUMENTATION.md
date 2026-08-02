# RetailPro — Full Site Documentation

RetailPro is an offline-first **Retail + GST billing application** for Indian
businesses. It runs entirely in the browser (no backend required to operate),
stores all data locally in IndexedDB, and can optionally sync to Cloudflare
Workers KV for permanent cloud backup.

- **Live app:** https://retailpro.pages.dev
- **Latest deploy:** https://ef6b2ce7.retailpro.pages.dev
- **Cloud API (Worker):** `retailpro-api` on Cloudflare Workers + KV
- **Stack:** HTML5 · CSS3 · vanilla JavaScript (ES6+, no frameworks/build step)

---

## Table of contents

1. [How the app is built](#1-how-the-app-is-built)
2. [Data & storage model](#2-data--storage-model)
3. [Every screen, explained](#3-every-screen-explained)
4. [Billing (POS) in depth](#4-billing-pos-in-depth)
5. [Invoice / print / PDF behaviour](#5-invoice--print--pdf-behaviour)
6. [GST logic](#6-gst-logic)
7. [Keyboard shortcuts](#7-keyboard-shortcuts)
8. [Cloud sync & backup](#8-cloud-sync--backup)
9. [Deploying to live](#9-deploying-to-live)
10. [Project layout](#10-project-layout)
11. [Recent changes](#11-recent-changes)

---

## 1. How the app is built

- **Single-page app, classic scripts.** Every file attaches to one global
  `window.App` namespace and is loaded in dependency order from `index.html`.
  There is **no bundler and no build step** — it runs straight from `file://`,
  from XAMPP (`http://localhost/billing_final/`), and from Cloudflare Pages alike.
- **Router.** `js/app.js` bootstraps the shell (sidebar + topbar), wires the
  router (`data-route` → `data-view`), global search, theme toggle and keyboard
  shortcuts. Each sidebar entry maps to a module under `js/modules/`.
- **Views** are the `<section class="view" data-view="…">` blocks in
  `index.html`; the matching module renders into its section on navigation.
- **Print root.** Invoices render into `#print-root` for printing / PDF capture.

---

## 2. Data & storage model

- **Primary store — IndexedDB** (`js/store/db.js`). All business data lives here
  permanently and is never auto-deleted. Collections include:
  `products`, `customers`, `suppliers`, `invoices`, `purchases`, `expenses`,
  and `settings`.
- **Seed data** (`js/store/seed.js`). On first run the app seeds itself with the
  business profile (**SRI EZHUMALAIYAN TRADERS**, Sivakasi — GSTIN
  `33HCIPM3297N1ZV`) plus demo products/customers so every screen is populated.
  Change anything in **Settings**.
- **Cloud sync** (`js/store/sync.js`). When a Worker URL is configured, each
  collection is mirrored to Cloudflare Workers KV for permanent backup and
  cross-device access. Sync is optional — the app is fully functional offline.

---

## 3. Every screen, explained

Navigation groups (from the sidebar):

### Main
| Screen | Route | What it does |
|--------|-------|--------------|
| **Dashboard** | `dashboard` | KPIs — today's sales, totals, low-stock badge, recent bills, quick charts. |
| **New Bill (POS)** | `pos` | The billing screen. GST / Without-GST / Estimate. See §4. `F2`. |
| **Bill History** | `history` | All saved bills — search, filter, re-open, re-print, download, share. |

### Master Data
| Screen | Route | What it does |
|--------|-------|--------------|
| **Products** | `products` | Product catalogue — name, HSN, GST%, price, stock, min-stock, unit. Import/export. Numeric fields (GST %, prices, stock) accept **decimals** (e.g. GST `12.5`). |
| **Customers** | `customers` | Customer records — name, mobile, GSTIN, state, address. Powers billing auto-fill. |
| **Suppliers** | `suppliers` | Supplier records used on purchase entries. |

### Operations
| Screen | Route | What it does |
|--------|-------|--------------|
| **Purchases** | `purchases` | Record stock purchases; increments inventory. |
| **Inventory** | `inventory` | Live stock levels; low-stock badge; adjustments. |
| **Expenses** | `expenses` | Track business expenses for the P&L / reports. |

### Insights
| Screen | Route | What it does |
|--------|-------|--------------|
| **Reports** | `reports` | Sales, GST, profit and inventory reports with CSV/XLSX export. |

### System
| Screen | Route | What it does |
|--------|-------|--------------|
| **Settings** | `settings` | Business profile, logo/signature/stamp/UPI QR, invoice prefixes, GST defaults, terms. |
| **Backup & Sync** | `backup` | Configure the Worker URL + token, push/pull cloud data, local export/import. |

A **global search** (topbar, `Ctrl+K`) searches products, customers and bills.
On screens ≤768px a **mobile bottom tab bar** replaces the sidebar.

---

## 4. Billing (POS) in depth

The **New Bill** screen (`js/modules/pos.js`) is split into a left working area
and a right details panel.

**Left — build the bill**
- **Product search** with a live dropdown: `↑ ↓` to pick, `Enter` / `＋` to add.
- **＋ Manual** adds a free-text line item (name + GST% typed by hand).
- **Product preview** (before a line is committed): edit Qty, Rate, Amount and a
  printable Note. Amount = Qty × Rate; typing an Amount **back-solves** the Rate.
  `← →` move between fields, `Enter` adds, `Esc` cancels.
- **Items in Bill** (the cart): every added line is editable in place — Qty (with
  −/+ stepper), Rate, Disc%, and (GST bills) the per-line GST%. `← →` walk
  **forward / backward** across the Qty → Rate → Disc% fields, flowing from one
  row into the next, so a whole bill can be corrected from the keyboard.

**Right — finalise the bill**
- **Bill Type:** GST Bill · Without GST Bill · Estimation. The type controls the
  business name printed (registered "…TRADERS" for GST, trade "…CRACKERS" for
  retail), the invoice title, and whether tax is applied.
- **Customer Details:** pick a saved customer, or type a GSTIN / mobile — a saved
  customer **auto-fills**. State is read from the GSTIN's 2-digit code.
- **Invoice Details:** auto-generated number (editable) + date.
- **Payment:** mode (Cash/UPI/Card/Bank/Credit), amount paid, balance.
- **GST entry mode (GST bills):** *Auto* computes tax from each line's GST%;
  *Manual* lets you type a taxable **Amount + GST %** and the **GST ₹** fills in
  automatically (`← →` move between Amount → GST% → GST₹).
- **Actions:** 💾 Save & Print · ⬇ Save & Download · Save Only · Clear. `Ctrl+S`.

---

## 5. Invoice / print / PDF behaviour

Rendered by `js/modules/invoices.js`; A4 print styles in `css/print.css`.

- **Retail / Without-GST bill:** header logo (left) + a faint centered gold
  watermark; trade name; **no** "Taxable Value" row (there is no tax).
- **GST Tax Invoice:** logo **centered** on top of the header; website prints on
  its own line with a 🌐 globe icon; registered name + GSTIN; grouped tax columns
  (CGST/SGST or IGST). The **PDF is 3 copies in one document** — Original /
  Duplicate / Triplicate.
- **PDF generation** (`js/utils/pdf.js`): the invoice is rendered to a JPEG (via
  an SVG `foreignObject`) and wrapped into a dependency-free A4 PDF — one page per
  copy — then downloaded. If rendering fails it falls back to the print dialog.
- **Share** uses the native print sheet ("Save as PDF" + share targets) on phones.

---

## 6. GST logic

`js/utils/gst.js` decides the split automatically from the **place of supply** —
no manual toggling:

- **Tamil Nadu customer →** CGST 9% + SGST 9% (intra-state)
- **Any other state →** IGST 18% (inter-state)

Per-line GST% is editable on GST bills, and Manual GST mode lets the taxable value
and GST amount be entered by hand.

---

## 7. Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `F2` | Open New Bill (POS) |
| `Ctrl+K` | Focus global search |
| `Ctrl+S` | Save & Print the current bill |
| `Ctrl+D` | Toggle light/dark theme |
| `↑ ↓` | Move through product search results |
| `Enter` | Add the highlighted / top-matching product |
| `← →` | Move backward / forward across bill fields (preview, cart rows, Manual GST) |
| `Esc` | Cancel the product preview |

---

## 8. Cloud sync & backup

The **Backup & Sync** screen configures optional Cloudflare persistence:

1. Deploy the Worker (see §9) and copy its URL.
2. Paste the **Worker URL** (and matching **Sync Token**, if set) in the app.
3. Tick **Auto-sync on every change**, **Save & Test** → "✓ Connected".
4. **⬆ Push all to Cloud** once to seed the cloud with current data.

Data then lives permanently in Workers KV and syncs automatically. Local
**export / import** (JSON) is also available as a manual backup.

The Worker (`workers/worker.js`) exposes a small REST API over KV, including
`/api/health` (returns `{"ok":true,…}`). An optional `SYNC_TOKEN` secret locks
the API; the app must send the same token.

---

## 9. Deploying to live

Deployment uses **Wrangler 3.114** (installed locally in `workers/`). The KV
namespace and Pages project (`retailpro`) are already configured.

> On this machine the project lives at `C:\xampp\htdocs\billing_final`. The older
> `DEPLOY.md` examples show `C:\billing` — substitute the current path.

**Frontend (Cloudflare Pages) — deploy after any UI change:**

```powershell
# 1. Sync the source into the clean public/ folder that Pages uploads
Copy-Item C:\xampp\htdocs\billing_final\index.html, `
          C:\xampp\htdocs\billing_final\css, `
          C:\xampp\htdocs\billing_final\js, `
          C:\xampp\htdocs\billing_final\assets `
          C:\xampp\htdocs\billing_final\public -Recurse -Force

# 2. Deploy
npm --prefix "C:\xampp\htdocs\billing_final\workers" run pages
```

Wrangler prints the live URL (e.g. `https://retailpro.pages.dev` plus a unique
per-deploy URL).

**Backend (Cloudflare Worker + KV) — only when the API changes:**

```powershell
npm --prefix "C:\xampp\htdocs\billing_final\workers" run deploy
```

Full step-by-step (login, KV creation, tokens, dashboard alternative,
troubleshooting) is in **[DEPLOY.md](DEPLOY.md)**.

---

## 10. Project layout

```
index.html            App shell (sidebar + topbar + views)
css/                  variables, base, components, print (A4 invoice), responsive
js/
  app.js              Bootstrap, router, global search, keyboard shortcuts
  store/
    db.js             IndexedDB (primary offline store)
    seed.js           First-run demo/business data
    sync.js           Cloudflare Worker sync client
  utils/
    dom.js            el()/esc() DOM helpers
    format.js         currency, number, number-to-words
    gst.js            state codes, intra/inter split, bill computation
    pdf.js            dependency-free A4 PDF writer (JPEG per page)
    csv.js xlsx.js    export helpers
    toast.js modal.js UI primitives
  modules/            dashboard, pos, history, products, customers, suppliers,
                      purchases, inventory, expenses, reports, settings, backup,
                      invoices (render/print/PDF), auth
workers/              worker.js + wrangler.toml (Cloudflare Worker + KV) + wrangler
assets/               logo.png, logo_gold.png, favicon.svg
public/               clean copy of the site that Cloudflare Pages uploads
DEPLOY.md             step-by-step Cloudflare deployment
DOCUMENTATION.md      this file
README.md             short project overview
```

> **Important:** the app is served from `public/` on Cloudflare. After editing any
> file under `js/`, `css/`, `assets/` or `index.html`, mirror it into `public/`
> before deploying (see §9).

---

## 11. Recent changes

- **GST invoice header:** logo is now **centered** on top; the website prints on
  its **own line led by an inline SVG world/globe icon** (renders crisply in the
  PDF) and is normalised to `https://…`. The line only appears once a website is
  set in Settings.
- **Clean install:** demo seed data (sample products/customers/suppliers) has been
  removed. The app now starts **empty**, so data you delete is never re-added on
  the next load. (Cloud sync still mirrors your own data if a Worker URL is set.)
- **Retail bill:** the **"Taxable Value"** total row is now hidden on
  Without-GST / retail bills (it's a GST-only concept; Sub Total already shows the
  net amount).
- **Cart rows:** `← →` arrow-key navigation added across the **Qty → Rate → Disc%**
  fields of already-added products, flowing between rows — matching the product
  preview and Manual GST fields.
