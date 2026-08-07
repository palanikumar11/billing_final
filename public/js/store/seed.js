/* =========================================================================
   seed.js — default settings + optional demo data on first run.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});

  function defaultSettings() {
    return {
      // Pre-filled from the supplied sample invoices (SRI EZHUMALAIYAN TRADERS).
      // Edit any of these in Settings → Business.
      businessName: "SRI EZHUMALAIYAN TRADERS",
      retailBusinessName: "SRI EZHUMALAIYAN CRACKERS",
      tagline: "Fireworks & Crackers · Sivakasi",
      contactPerson: "Mathan",
      address: "D.No 4/152/G, Konampatti, Chinnakkamanpatti Village, Sattur Road",
      city: "Sivakasi",
      state: "Tamil Nadu",
      pin: "626123",
      phone: "93443 78443, 94884 55443",
      email: "sriezhumalaiyantraders0@gmail.com",
      website: "",
      gstin: "33HCIPM3297N1ZV",
      pan: "HCIPM3297N",
      // Bank — Central Bank of India (Current A/C)
      bankName: "Central Bank of India",
      bankAccount: "5461904674",
      bankIfsc: "CBIN0280921",
      bankBranch: "Sivakasi",
      bankAccountType: "Current Account",
      upiId: "",
      // Assets — logo defaults to the bundled company logo; others via Settings
      logo: "assets/logo.png",
      watermarkLogo: "assets/logo_gold.png",   // gold logo watermark on non-GST bills
      signature: "",
      stamp: "",
      upiQr: "",
      // Invoice config
      invoicePrefix: "INV",
      estimatePrefix: "EST",
      quotePrefix: "QT",
      challanPrefix: "DC",
      creditNotePrefix: "CN",
      debitNotePrefix: "DN",
      purchasePrefix: "PUR",
      nextInvoiceNo: 1,
      financialYear: App.format.financialYear(),
      defaultGstRate: 18,
      priceIncludesTax: false,
      autoRoundOff: false,   // round-off starts OFF; tick it per bill when needed
      // Text
      footerNote: "Thank you for your business!",
      terms: "1. Goods once sold will not be taken back.\n2. All disputes subject to Sivakasi jurisdiction.\n3. Payment due within 15 days of invoice date.",
      declaration: "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
      // Cloud sync (Cloudflare Worker + KV) — pre-configured for this deployment
      workerUrl: "https://retailpro-api.sriezhumalaiyan.workers.dev",
      syncToken: "ad140752f24e2a0ddbe5cb06c7c255d48285d13dcfcc97ec",
      autoSync: true,
      // Automatic local backup — writes a dated JSON backup of all data to a
      // folder you pick once (File System Access API), or falls back to a daily
      // download. Runs at most once per day on app open. Keeps the last N days.
      autoLocalBackup: true,
      autoBackupKeepDays: 14,
      // UI
      theme: "light",
      lowStockThresholdDefault: 5,
      // App Lock (login) — ships ON so the live app requires sign-in before any change.
      // Default: user "admin", password "Ezhu@2026". Change it in Settings → Security & Login.
      security: {
        user: "admin",
        salt: "e92d2adfaa2a19e51a3d89d2d2c11518",
        hash: "2da3d4765f60f1e1a9387949dc1b59b68497c40ee73e151bbf519cde25d96ca8",
        recoveryHash: "4bf7bcc8013bda7bb9b0b950484e648e66564d8f8e1cdae52f269d05a211ccaa",
      },
    };
  }

  // Demo catalogue removed — the app now starts CLEAN with no sample products,
  // customers or suppliers. This means data the user deletes is never silently
  // re-added on the next load. Kept as a no-op so the boot sequence (app.js) that
  // calls it stays intact; add your own data from Products / Customers / Suppliers.
  function demoData(_store) {
    /* intentionally empty — clean install, no seed data */
  }

  App.seed = { defaultSettings, demoData };
})();
