/* =========================================================================
   invoices.js — renders billing documents (Retail / GST / Estimate / Quotation
   / Delivery Challan / Credit & Debit Note), preview modal, print & PDF.

   - Retail Bill: header logo + faint centered watermark (5–10% opacity).
   - GST Tax Invoice: header logo only, NO watermark; PDF = 3 copies
     (Original / Duplicate / Triplicate) in one document.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el, esc } = App.dom;
  const F = App.format;

  // Which invoice types are treated as GST tax invoices (3 copies, no watermark)
  const GST_TYPES = ["gst", "credit_note", "debit_note", "purchase"];
  const TITLES = {
    retail: "Retail Invoice", gst: "Tax Invoice", estimate: "Estimate", quotation: "Quotation",
    challan: "Delivery Challan", credit_note: "Credit Note", debit_note: "Debit Note", purchase: "Purchase Invoice",
  };

  // Bundled default logo (SRI EZHUMALAIYAN TRADERS). Used when no custom logo
  // has been uploaded in Settings. App.DEFAULT_LOGO is shared with app.js.
  const DEFAULT_LOGO = (window.App && App.DEFAULT_LOGO) || "assets/logo.png";

  function logoSrc(s) { return s.logo || DEFAULT_LOGO; }

  // Taxable value of a line (falls back for older saved bills that predate the field).
  function lineTaxable(it) {
    if (it.taxable != null) return Number(it.taxable) || 0;
    const gross = (Number(it.qty) || 0) * (Number(it.price) || 0) - (Number(it.discount) || 0);
    return App.gst.round2(gross);
  }

  // Break the business address into printable lines.
  function addressLines(addr) {
    const a = String(addr || "").trim();
    if (!a) return [];
    if (/\n/.test(a)) return a.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const parts = a.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return [a];
    // Last part is the road/street — print it under the rest.
    return [parts.slice(0, -1).join(", "), parts[parts.length - 1]];
  }

  function logoNode(s, cls) {
    const src = logoSrc(s);
    if (src) return el("div." + cls, [el("img", { src })]);
    return el("div." + cls, [el("div.logo-fallback", (s.businessName || "R").trim()[0].toUpperCase())]);
  }

  // Business name shown on the document:
  //  - GST tax invoice   -> registered name (…TRADERS)
  //  - Non-GST / retail   -> trade name (…CRACKERS)
  function bizName(inv, s) {
    const isGst = GST_TYPES.includes(inv.type);
    return isGst ? (s.businessName || "Business Name") : (s.retailBusinessName || s.businessName || "Business Name");
  }

  /* ---------------- Build one document page ---------------- */
  function buildPage(inv, s, copyLabel) {
    const isGst = GST_TYPES.includes(inv.type);
    // Retail bill AND Estimate share the compact trade-name (…CRACKERS) layout.
    const isRetail = inv.type === "retail" || inv.type === "estimate" || inv.type === "quotation";
    const name = bizName(inv, s);
    const t = inv.totals || {};
    const page = el("div.a4" + (isRetail ? ".retail" : ""));

    // Golden logo watermark — on Without-GST bills & estimates.
    // Shows the gold logo with the trade name below it.
    if (isRetail) {
      const wm = el("div.watermark");
      const inner = el("div.wm-inner");
      const wmSrc = s.watermarkLogo || "assets/logo_gold.png";
      if (wmSrc) inner.appendChild(el("img", { src: wmSrc, class: "wm-gold" }));
      inner.appendChild(el("div.wm-name", (name || "").toUpperCase()));
      wm.appendChild(inner);
      page.appendChild(wm);
    }
    if (copyLabel) page.appendChild(el("div.copy-label", copyLabel));

    const inner = el("div.doc-inner");
    page.appendChild(inner);

    // ---- Header ----
    const head = el("div.inv-head");
    head.appendChild(logoNode(s, "logo-box"));
    const co = el("div.co");
    co.appendChild(el("h1", name));
    if (s.contactPerson) co.appendChild(el("div.co-line", s.contactPerson));
    // Address prints as the door/village line, then the road together with the
    // city/state/pin on ONE line — "Sattur Road, Sivakasi, Tamil Nadu - 626123".
    const aLines = addressLines(s.address);
    const road = aLines.length > 1 ? aLines.pop() : "";
    aLines.forEach((ln) => co.appendChild(el("div.co-line", ln)));
    const place = [s.city, s.state].filter(Boolean).join(", ");
    const placeLine = [road, [place, s.pin].filter(Boolean).join(" - ")].filter(Boolean).join(", ");
    if (placeLine) co.appendChild(el("div.co-line", placeLine));
    co.appendChild(el("div.co-line", [s.phone && ("☎ " + s.phone), s.email && ("✉ " + s.email), s.website].filter(Boolean).join("   ")));
    const reg = el("div.co-reg");
    if (isGst && s.gstin) reg.innerHTML = `<b>GSTIN:</b> ${esc(s.gstin)}` + (s.pan ? `　<b>PAN:</b> ${esc(s.pan)}` : "");
    co.appendChild(reg);
    head.appendChild(co);
    const dt = el("div.doc-title");
    dt.appendChild(el("div.tt", TITLES[inv.type] || "Invoice"));
    dt.appendChild(el("div.st", { html: "<b>No:</b> " + esc(inv.number) }));
    dt.appendChild(el("div.st", { html: "<b>Date:</b> " + esc(F.fmtDate(inv.date)) }));
    head.appendChild(dt);
    inner.appendChild(head);

    // ---- Meta grid ----
    const meta = el("div.inv-meta");
    const mcell = (lbl, val) => { const c = el("div.cell"); c.appendChild(el("div.lbl", lbl)); c.appendChild(el("div.val", val || "—")); return c; };
    // Invoice/Estimate number now lives in the header corner (top-right), so it's
    // no longer repeated here. Keep the date in the meta grid.
    meta.appendChild(mcell("Date", F.fmtDate(inv.date)));
    if (isGst) {
      meta.appendChild(mcell("Place of Supply", (inv.customerCity ? inv.customerCity + ", " : "") + (inv.customerState || "") + (App.gst.stateCode(inv.customerState) ? " (" + App.gst.stateCode(inv.customerState) + ")" : "")));
      meta.appendChild(mcell("Served By", name || "—"));   // GST bill → TRADERS name
    } else {
      meta.appendChild(mcell("Served By", name || "—"));   // retail/estimate → CRACKERS name
    }
    inner.appendChild(meta);

    // ---- Parties ----
    const parties = el("div.parties");
    const bill = el("div.p-col");
    bill.appendChild(el("div.p-title", isGst ? "Bill To (Buyer)" : "Customer"));
    bill.appendChild(el("div.p-name", inv.customerName || "Walk-in Customer"));
    if (inv.customerAddress) bill.appendChild(el("div.p-line", inv.customerAddress));
    const custLoc = [inv.customerCity, [inv.customerState, inv.customerPin].filter(Boolean).join(" - ")].filter(Boolean).join(", ");
    if (custLoc) bill.appendChild(el("div.p-line", custLoc));
    if (inv.customerMobile) bill.appendChild(el("div.p-line", "☎ " + inv.customerMobile));
    if (isGst && inv.customerGstin) bill.appendChild(el("div.p-line", "GSTIN: " + inv.customerGstin));
    parties.appendChild(bill);

    const ship = el("div.p-col");
    ship.appendChild(el("div.p-title", isGst ? "Ship To" : "Details"));
    ship.appendChild(el("div.p-name", inv.shipName || inv.customerName || "—"));
    if (inv.shipAddress || inv.customerAddress) ship.appendChild(el("div.p-line", inv.shipAddress || inv.customerAddress));
    if (isGst) {
      ship.appendChild(el("div.p-line", "State: " + (inv.customerState || "—") + " (Code " + (App.gst.stateCode(inv.customerState) || "—") + ")"));
      ship.appendChild(el("div.p-line", t.intra ? "Supply: Intra-State (CGST+SGST)" : "Supply: Inter-State (IGST)"));
    }
    parties.appendChild(ship);
    inner.appendChild(parties);

    // ---- Items table ----
    // GST invoices use grouped tax sub-columns (CGST/SGST or IGST + Cess),
    // matching the supplied Zoho tax-invoice layout.
    const table = el("table.inv-items");
    const showHsn = isGst;
    // Fixed column widths keep every bill's grid identical, however long the
    // item names run. GST = 10 columns, Without-GST / Estimate = 6.
    const cg = el("colgroup");
    (showHsn ? (t.intra ? ["6%", "27%", "9%", "8%", "9%", "6%", "8%", "6%", "8%", "13%"]
                        : ["6%", "27%", "9%", "8%", "9%", "6%", "8%", "6%", "8%", "13%"])
             : ["7%", "44%", "11%", "12%", "11%", "15%"]).forEach((wd) => cg.appendChild(el("col", { style: { width: wd } })));
    table.appendChild(cg);
    const thead = el("thead");
    if (showHsn) {
      const r1 = el("tr");
      const th = (txt, cls, span, rows) => { const e = el("th" + (cls ? "." + cls : ""), txt); if (span) e.colSpan = span; if (rows) e.rowSpan = rows; return e; };
      r1.appendChild(th("S.No", "c", 0, 2));
      r1.appendChild(th("Item & Description", "", 0, 2));
      r1.appendChild(th("HSN/SAC", "c", 0, 2));
      r1.appendChild(th("Qty", "r", 0, 2));
      r1.appendChild(th("Rate", "r", 0, 2));
      if (t.intra) { r1.appendChild(th("CGST", "", 2)); r1.appendChild(th("SGST", "", 2)); }
      else { r1.appendChild(th("IGST", "", 2)); r1.appendChild(th("Cess", "", 2)); }
      r1.appendChild(th("Amount", "r", 0, 2));
      const r2 = el("tr");
      const sub = (txt) => el("th.r", txt);
      // two pairs of (% , Amt)
      r2.appendChild(sub("%")); r2.appendChild(sub("Amt"));
      r2.appendChild(sub("%")); r2.appendChild(sub("Amt"));
      thead.appendChild(r1); thead.appendChild(r2);
    } else {
      const hr = el("tr");
      ["S.No", "Item Description", "Qty", "Rate", "Disc", "Amount"].forEach((c, i) => { const th = el("th", c); if (i >= 2) th.className = "r"; if (i === 0) th.className = "c"; hr.appendChild(th); });
      thead.appendChild(hr);
    }
    table.appendChild(thead);

    const tbody = el("tbody");
    (inv.items || []).forEach((it, i) => {
      const tr = el("tr");
      tr.appendChild(el("td.c", i + 1));
      const d = el("td");
      // Robust name: saved name → look up product → placeholder (never blank).
      const nm = it.name || (it.productId && (App.store.get("products", it.productId) || {}).name) || it.description || "Item";
      d.appendChild(el("div.desc", nm));
      if (it.note) d.appendChild(el("div.note", it.note));
      tr.appendChild(d);
      if (showHsn) tr.appendChild(el("td.c", it.hsn || "-"));
      tr.appendChild(el("td.r", F.num(it.qty, it.qty % 1 ? 3 : 0) + " " + (it.unit || "")));
      tr.appendChild(el("td.r", F.num(it.price)));
      if (showHsn) {
        if (t.intra) {
          tr.appendChild(el("td.r", (it.gstRate / 2) + "%")); tr.appendChild(el("td.r", F.num(it.cgst)));
          tr.appendChild(el("td.r", (it.gstRate / 2) + "%")); tr.appendChild(el("td.r", F.num(it.sgst)));
        } else {
          tr.appendChild(el("td.r", it.gstRate + "%")); tr.appendChild(el("td.r", F.num(it.igst)));
          tr.appendChild(el("td.r", "0%")); tr.appendChild(el("td.r", "0.00")); // Cess (not tracked)
        }
      } else {
        tr.appendChild(el("td.r", it.discount ? F.num(it.discount) : "-"));
      }
      // On a tax invoice the Amount column is the TAXABLE value — the CGST/SGST
      // (or IGST) columns beside it are what gets added on top in the totals box.
      // Printing the tax-inclusive amount here made the column disagree with the
      // Sub Total and read as though the tax were counted twice.
      tr.appendChild(el("td.r", F.num(showHsn ? lineTaxable(it) : it.amount)));
      tbody.appendChild(tr);
    });

    // The table is exactly as tall as the bill: one row per product, no blank
    // filler rows padding it out — 1 product prints 1 row, 2 products print 2.
    table.appendChild(tbody);

    // Totals strip inside the table — total qty and total amount line up under
    // their own columns, the way a printed invoice is expected to read.
    const items = inv.items || [];
    const qtyTotal = items.reduce((a, it) => a + (Number(it.qty) || 0), 0);
    // Matches the Amount column above it: taxable on a GST bill, net otherwise.
    const amtTotal = items.reduce((a, it) => a + (showHsn ? lineTaxable(it) : Number(it.amount) || 0), 0);
    const tfoot = el("tfoot");
    const ftr = el("tr");
    const ftd = (txt, cls, span) => { const e = el("td" + (cls ? "." + cls : ""), txt); if (span) e.colSpan = span; return e; };
    if (showHsn) {
      ftr.appendChild(ftd("Total", "lbl", 3));
      ftr.appendChild(ftd(F.num(qtyTotal, qtyTotal % 1 ? 3 : 0), "r"));
      ftr.appendChild(ftd("", "r"));
      ftr.appendChild(ftd("", "r"));
      ftr.appendChild(ftd(F.num(t.intra ? t.cgst : t.igst), "r"));
      ftr.appendChild(ftd("", "r"));
      ftr.appendChild(ftd(t.intra ? F.num(t.sgst) : "0.00", "r"));
    } else {
      ftr.appendChild(ftd("Total", "lbl", 2));
      ftr.appendChild(ftd(F.num(qtyTotal, qtyTotal % 1 ? 3 : 0), "r"));
      ftr.appendChild(ftd("", "r"));
      ftr.appendChild(ftd("", "r"));
    }
    ftr.appendChild(ftd(F.num(amtTotal), "r"));
    tfoot.appendChild(ftr);
    table.appendChild(tfoot);
    inner.appendChild(table);

    // ---- Bottom: tax summary + totals ----
    const bottom = el("div.inv-bottom");

    // Left: the pay-by-UPI QR sits here, immediately left of the totals box, so
    // the customer scans it right next to the amount they owe. Notes below it.
    const left = el("div.bottom-left");
    if (s.upiQr) {
      const qr = el("div.qr-pay");
      qr.appendChild(el("img", { src: s.upiQr, alt: "Scan to pay" }));
      qr.appendChild(el("div.qr-cap", "Scan & Pay"));
      left.appendChild(qr);
    }
    if (inv.note) left.appendChild(el("div.amt-words", inv.note));
    bottom.appendChild(left);

    // Right: totals box
    const tb2 = el("div.totals-box");
    const trow = (k, v, cls) => { const r = el("div.trow" + (cls ? "." + cls : "")); r.appendChild(el("span.k", k)); r.appendChild(el("span.mono", v)); return r; };
    tb2.appendChild(trow("Sub Total", F.num(t.subTotal)));
    if (t.totalDiscount) tb2.appendChild(trow("Discount", "- " + F.num(t.totalDiscount)));
    tb2.appendChild(trow("Taxable Value", F.num(t.taxable)));
    if (isGst) {
      if (t.intra) { tb2.appendChild(trow("CGST", F.num(t.cgst))); tb2.appendChild(trow("SGST", F.num(t.sgst))); }
      else tb2.appendChild(trow("IGST", F.num(t.igst)));
    } else if (t.totalTax) tb2.appendChild(trow("GST", F.num(t.totalTax)));
    if (t.packaging) tb2.appendChild(trow("Packaging" + (t.packagingPct ? " (" + t.packagingPct + "%)" : ""), F.num(t.packaging)));
    if (t.roundOff) tb2.appendChild(trow("Round Off", (t.roundOff > 0 ? "+ " : "- ") + F.num(Math.abs(t.roundOff))));
    tb2.appendChild(trow("Grand Total", "₹ " + F.num(t.grandTotal), "grand"));
    if (inv.paid != null && inv.type !== "quotation" && inv.type !== "estimate") {
      tb2.appendChild(trow("Paid (" + (inv.paymentMode || "Cash") + ")", F.num(inv.paid || 0)));
      const bal = F.round2((t.grandTotal || 0) - (inv.paid || 0));
      if (bal > 0) tb2.appendChild(trow("Balance Due", F.num(bal)));
    }
    bottom.appendChild(tb2);
    inner.appendChild(bottom);

    // ---- Amount in words ----
    inner.appendChild(el("div.amt-words", { html: `<b>Amount in words:</b> ${esc(F.inWords(t.grandTotal || 0))}` }));

    // ---- Estimate warning (only on estimate / quotation documents) ----
    if (inv.type === "estimate" || inv.type === "quotation") {
      inner.appendChild(el("div.imp-note", { html: "<b>THIS IS AN ESTIMATE ONLY — NOT A TAX INVOICE.</b>" }));
    }

    // ---- Footer ----
    const foot = el("div.inv-foot");
    const bd = el("div.bank-decl");
    if (isGst && (s.bankName || s.upiId)) {
      // Bank details, one field per line, no separators / account type.
      const bank = el("div.blk");
      bank.appendChild(el("div.h", "Bank Details"));
      const lines = [];
      if (s.bankName) lines.push(["Bank", s.bankName]);
      lines.push(["A/C Name", name]);
      if (s.bankAccount) lines.push(["A/C No", s.bankAccount]);
      if (s.bankBranch) lines.push(["Branch", s.bankBranch]);
      if (s.bankIfsc) lines.push(["IFSC", s.bankIfsc]);
      if (s.upiId) lines.push(["UPI", s.upiId]);
      const tbl = el("table.bank-tbl");
      lines.forEach(([k, v]) => { const tr = el("tr"); tr.appendChild(el("td.bk", k)); tr.appendChild(el("td.bv", v)); tbl.appendChild(tr); });
      bank.appendChild(tbl);
      bd.appendChild(bank);
    }
    if (isGst && s.declaration) {
      const dec = el("div.blk");
      dec.appendChild(el("div.h", "Declaration"));
      dec.appendChild(el("div", s.declaration));
      bd.appendChild(dec);
    }
    foot.appendChild(bd);

    const sign = el("div.sign-area");
    sign.appendChild(el("div.for", "For " + name));
    const simg = el("div.sign-img");
    if (s.stamp) { const st = el("img", { src: s.stamp, style: { position: "absolute", opacity: ".8", maxHeight: "70px" } }); simg.style.position = "relative"; simg.appendChild(st); }
    if (s.signature) simg.appendChild(el("img", { src: s.signature }));
    sign.appendChild(simg);
    sign.appendChild(el("div.sign-line", "Authorised Signatory"));
    foot.appendChild(sign);
    inner.appendChild(foot);

    if (isRetail) inner.appendChild(el("div.thanks", s.footerNote || "Thank you! Visit again."));
    // Terms print on every document — GST, Without-GST and Estimate alike.
    if (s.terms) inner.appendChild(el("div.terms", { html: "<b>Terms &amp; Conditions:</b> " + esc(s.terms).replace(/\n/g, " · ") }));

    return page;
  }

  /* ---------------- Public: build pages for a document ---------------- */
  function buildDocument(inv) {
    // GST tax invoice = 3 copies (Original / Duplicate / Triplicate) in one document.
    const s = App.store.settings() || {};
    const frag = document.createDocumentFragment();
    if (inv.type === "gst") {
      // 3 copies, plain tags (no "for Recipient/Transporter/Supplier").
      ["ORIGINAL", "DUPLICATE", "TRIPLICATE"]
        .forEach((lbl) => frag.appendChild(buildPage(inv, s, lbl)));
    } else {
      frag.appendChild(buildPage(inv, s, null));
    }
    return frag;
  }

  function print(inv) {
    const root = document.getElementById("print-root");
    root.innerHTML = "";
    const vp = el("div.doc-viewport", { style: { background: "#fff", padding: "0", gap: "0" } });
    vp.appendChild(buildDocument(inv));
    root.appendChild(vp);
    setTimeout(() => { window.print(); }, 120);
  }

  // Preview modal with actions
  function preview(inv) {
    const vp = el("div.doc-viewport", { style: { margin: "-22px", borderRadius: "0" } });
    vp.appendChild(buildDocument(inv));
    App.modal.open({
      title: (TITLES[inv.type] || "Invoice") + " · " + inv.number,
      size: "wide",
      body: vp,
      footer: [
        { text: "Close", class: "ghost" },
        { text: "⬇ Download", onClick: () => { downloadPDF(inv); return false; } },
        { text: "📤 Share", onClick: () => { share(inv); return false; } },
        { text: "🖨 Print", class: "primary", onClick: () => { print(inv); return false; } },
      ],
    });
  }

  // ---- Render one invoice page to a JPEG (via SVG foreignObject) ----
  async function inlineImages(node) {
    const imgs = Array.from(node.querySelectorAll("img"));
    await Promise.all(imgs.map(async (img) => {
      try {
        if (/^data:/.test(img.getAttribute("src") || "")) return;
        const res = await fetch(img.src, { cache: "force-cache" });
        const blob = await res.blob();
        const durl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
        img.setAttribute("src", durl);
      } catch (e) { /* leave as-is */ }
    }));
  }
  let _cssCache = null;
  async function invoiceCss() {
    if (_cssCache != null) return _cssCache;
    const files = ["css/variables.css", "css/print.css"];
    const parts = await Promise.all(files.map((f) => fetch(f).then((r) => r.text()).catch(() => "")));
    // This CSS gets embedded in an SVG <style>, which is parsed as XML — a bare
    // "&" or "<" anywhere in it aborts the whole parse ("xmlParseEntityRef"),
    // the SVG image never loads, and the PDF render fails. Escape both.
    const css = parts.join("\n").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    // base.css isn't loaded here, so its border-box reset has to be restated:
    // without it the A4 sheet renders 210mm WIDE PLUS its 24mm padding, pushing
    // the whole layout right and clipping the right edge off the PDF.
    return (_cssCache = "*,*::before,*::after{box-sizing:border-box}\n" + css);
  }
  async function nodeToJpeg(a4, css, quality) {
    const W = Math.ceil(a4.getBoundingClientRect().width) || 794;
    // .a4 clips at one sheet (overflow:hidden), so a long bill would lose its
    // footer and signature off the bottom of the PDF. Let the capture grow to
    // the real content height instead — a tall bill is then scaled down to fit
    // the A4 page, which is far better than silently dropping the end of it.
    a4.style.overflow = "visible";
    a4.style.height = "auto";
    const H = Math.max(Math.ceil(a4.scrollHeight), Math.round(W * 297 / 210)); // at least A4 aspect
    const xhtml = new XMLSerializer().serializeToString(a4);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml" style="background:#fff;width:${W}px;height:${H}px"><style>${css}</style>${xhtml}</div></foreignObject></svg>`;
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("render failed")); img.src = url; });
    // 2x (≈180 dpi at A4) keeps the file light. The QR stays scannable because
    // it is now a large element on the page (~170px -> ~340px here); the old
    // blur came from the QR being a 46x66 sliver, not from this scale.
    const scale = 2;
    const canvas = el("canvas"); canvas.width = W * scale; canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return { bytes: App.pdf.dataUrlToBytes(dataUrl), w: canvas.width, h: canvas.height };
  }

  // Render every page of a document (GST = 3 copies) to JPEGs.
  async function renderPages(inv, quality = 0.78) {
    const holder = el("div", { style: { position: "fixed", left: "-99999px", top: "0", background: "#fff" } });
    holder.appendChild(buildDocument(inv));
    document.body.appendChild(holder);
    try {
      await inlineImages(holder);
      const css = await invoiceCss();
      const a4s = Array.from(holder.querySelectorAll(".a4"));
      const out = [];
      for (const a4 of a4s) out.push(await nodeToJpeg(a4, css, quality));
      return out;
    } finally { holder.remove(); }
  }

  // Windows/Android reject these in a file name; collapse them to a dash.
  function pdfName(inv) {
    const base = (TITLES[inv.type] || "Invoice") + "-" + (inv.number || "");
    return base.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "") + ".pdf";
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: name, rel: "noopener" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  }

  // Download PDF — build a real A4 PDF (every copy of the document as its own
  // page) and hand it to the browser, so it lands in the Downloads folder as a
  // file. Only if rendering fails do we fall back to the native print sheet.
  let _building = false;
  async function downloadPDF(inv) {
    if (_building) return;
    _building = true;
    const name = pdfName(inv);
    App.toast && App.toast.info("Preparing " + name + "…", "Download");
    try {
      const blob = App.pdf.fromJpegs(await renderPages(inv));
      saveBlob(blob, name);
      App.toast && App.toast.success(name + " saved to your Downloads folder", "Download");
    } catch (e) {
      App.toast && App.toast.error("Couldn’t build the PDF — choose “Save as PDF” in the print dialog.", "Download");
      print(inv);
    } finally {
      _building = false;
    }
  }

  // Share — try the Web Share API with a real PDF; if the device can't build
  // one, fall back to native print (Save as PDF, then share from the sheet).
  async function share(inv) {
    // On phones the print sheet already offers "Save as PDF" + share targets,
    // and it renders the full page correctly — use it directly.
    App.toast && App.toast.info("Use “Save as PDF” / share from the print sheet.", "Share");
    print(inv);
  }

  App.invoices = { buildDocument, buildPage, print, preview, downloadPDF, share, renderPages, GST_TYPES, TITLES };
})();
