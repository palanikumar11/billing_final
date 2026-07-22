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

  function demoData(store) {
    // Crackers catalogue — HSN 3604 (fireworks), GST 18%.
    // [name, category, unit, purchase, selling, mrp, stock, minStock]
    const products = [
      ["Flower Pots (Big) - 10 Pcs", "Flower Pots", "BOX", 90, 140, 180, 120, 20],
      ["Flower Pots (Special) - 10 Pcs", "Flower Pots", "BOX", 130, 195, 250, 100, 20],
      ["Ground Chakkar (Big) - 10 Pcs", "Ground Chakkar", "BOX", 70, 110, 150, 150, 25],
      ["Ground Chakkar (Special) - 10 Pcs", "Ground Chakkar", "BOX", 100, 160, 210, 90, 20],
      ["Sparklers 15 cm - 10 Pcs", "Sparklers", "PKT", 18, 30, 40, 400, 50],
      ["Sparklers 30 cm Colour - 10 Pcs", "Sparklers", "PKT", 35, 55, 75, 300, 50],
      ["One Sound Crackers (4\") - 10 Pcs", "Sound Crackers", "PKT", 25, 40, 55, 250, 40],
      ["Bijili Crackers - 100 Pcs", "Sound Crackers", "PKT", 45, 70, 95, 200, 30],
      ["Atom Bomb - 10 Pcs", "Sound Crackers", "BOX", 110, 170, 220, 120, 20],
      ["Rocket Bomb - 10 Pcs", "Rockets", "BOX", 95, 150, 195, 100, 20],
      ["Whistling Rocket - 10 Pcs", "Rockets", "BOX", 140, 220, 280, 80, 15],
      ["Twinkling Star - 10 Pcs", "Fancy / Aerial", "BOX", 60, 95, 125, 150, 25],
      ["7 Shot Fancy", "Fancy / Aerial", "PCS", 120, 190, 250, 60, 10],
      ["30 Shot Fancy", "Fancy / Aerial", "PCS", 380, 580, 750, 40, 8],
      ["Garland 1000 Wala", "Garlands", "PCS", 350, 550, 720, 50, 10],
      ["Garland 5000 Wala", "Garlands", "PCS", 1500, 2300, 2950, 20, 5],
      ["Kids Special Gift Box (25 Items)", "Gift Boxes", "BOX", 450, 700, 900, 60, 10],
      ["Family Gift Box (50 Items)", "Gift Boxes", "BOX", 900, 1400, 1800, 40, 8],
    ];
    products.forEach((p, i) => {
      store.upsert("products", {
        name: p[0], code: "C" + String(1001 + i), sku: "SKU" + (1001 + i),
        category: p[1], hsn: "3604", gstRate: 18, unit: p[2],
        purchasePrice: p[3], sellingPrice: p[4], mrp: p[5], stock: p[6], minStock: p[7],
        image: "", description: "", favorite: i < 4,
      });
    });

    const customers = [
      ["Ramesh Traders", "9840012345", "Tamil Nadu", "600028", "33AAGCR1234K1Z2"],
      ["Sundar Stores", "9791023456", "Tamil Nadu", "641001", ""],
      ["Kerala Wholesale Co", "9847034567", "Kerala", "682001", "32AAECK9876L1Z9"],
      ["Mumbai Retail LLP", "9820045678", "Maharashtra", "400001", "27AAFCM5432P1Z1"],
    ];
    customers.forEach((c) => store.upsert("customers", {
      name: c[0], mobile: c[1], email: "", address: "", state: c[2], pin: c[3], gstin: c[4],
      pan: "", creditLimit: 50000, outstanding: 0,
    }));

    const suppliers = [
      ["Anand Distributors", "33AAACA1111A1Z5", "9840099001", "Tamil Nadu"],
      ["National Supplies", "29AAACN2222B1Z6", "9880099002", "Karnataka"],
    ];
    suppliers.forEach((s) => store.upsert("suppliers", {
      name: s[0], gstin: s[1], phone: s[2], state: s[3], address: "", outstanding: 0,
    }));
  }

  App.seed = { defaultSettings, demoData };
})();
