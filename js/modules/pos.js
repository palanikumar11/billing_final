/* =========================================================================
   pos.js — POS billing screen. Product search, cart, live GST totals,
   customer selection (auto intra/inter-state), payments, save & print.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el, esc } = App.dom;
  const F = App.format;

  // Billing standards on the New Bill screen.
  //  - GST Bill     -> Tax Invoice, GST applied, shows registered name (…TRADERS)
  //  - Without GST  -> Retail bill, no tax, shows trade name (…CRACKERS)
  //  - Estimation   -> Estimate, no tax, shows trade name (…CRACKERS)
  const TYPE_LABELS = [
    ["gst", "GST Bill"], ["retail", "Without GST Bill"], ["estimate", "Estimation"],
  ];
  const PAY_MODES = ["Cash", "UPI", "Card", "Bank Transfer", "Credit"];

  let st = null;
  function fresh() {
    const s = App.store.settings() || {};
    return {
      type: "gst", items: [], customerId: "", customer: null,
      cust: { name: "", mobile: "", city: "", gstin: "", address: "", pin: "" },   // inline entry
      billState: s.state || "Tamil Nadu",   // place of supply (drives split vs IGST)
      billDiscountPct: 0, billDiscountAmt: 0, packagingPct: 0, roundOff: s.autoRoundOff === true,
      taxInclusive: !!s.priceIncludesTax, paymentMode: "Cash", paid: null, split: null,
      note: "", editingId: null,
      date: F.todayISO(), numberOverride: "",
    };
  }

  /* ---------------- Invoice numbering ---------------- */
  function prefixFor(type) {
    const s = App.store.settings() || {};
    return { retail: s.invoicePrefix, gst: s.invoicePrefix, estimate: s.estimatePrefix, quotation: s.quotePrefix,
      challan: s.challanPrefix, credit_note: s.creditNotePrefix, debit_note: s.debitNotePrefix, purchase: s.purchasePrefix }[type] || "INV";
  }
  function generateNumber(type) {
    const s = App.store.settings() || {};
    const fy = s.financialYear || F.financialYear();
    const px = prefixFor(type);
    let seq, main = false;
    if (type === "retail" || type === "gst") { seq = s.nextInvoiceNo || 1; main = true; }
    else seq = App.store.all("invoices").filter((i) => i.type === type).length + 1;
    return { number: `${px}/${fy}/${String(seq).padStart(3, "0")}`, main };
  }
  App.numbering = { generateNumber, prefixFor };

  /* ---------------- Totals ---------------- */
  function totals() {
    const s = App.store.settings() || {};
    return App.gst.computeBill(
      // Keep name/productId/unit/note so the SAVED bill (and its print/PDF) show them.
      st.items.map((it) => ({ productId: it.productId, name: it.name, unit: it.unit, note: it.note,
        qty: it.qty, price: it.price, discountPct: it.discountPct, discountAmt: it.discountAmt,
        gstRate: it.gstRate, hsn: it.hsn, taxInclusive: st.taxInclusive })),
      { customerState: st.billState || s.state || "Tamil Nadu", homeState: s.state || "Tamil Nadu",
        billDiscountPct: st.billDiscountPct, billDiscountAmt: st.billDiscountAmt, roundOff: st.roundOff,
        packagingPct: st.type === "gst" ? 0 : st.packagingPct,   // packaging % — Without-GST only
        gstEnabled: st.type === "gst" }   // "Without GST" bill carries no tax
    );
  }

  /* ---------------- Cart operations ---------------- */
  function addProduct(p, qty = 1, price, note) {
    const rate = price != null ? Number(price) || 0 : Number(p.sellingPrice) || 0;
    const existing = st.items.find((it) => it.productId === p.id);
    if (existing) { existing.qty = F.round2((Number(existing.qty) || 0) + qty); existing.price = rate; if (note) existing.note = note; }
    else st.items.push({ productId: p.id, name: p.name, hsn: p.hsn || "", unit: p.unit || "PCS", gstRate: Number(p.gstRate) || 0, price: rate, qty, discountPct: 0, discountAmt: 0, note: note || "", stock: p.stock });
    recompute();
  }
  function addManual() {
    st.items.push({ productId: "", name: "", hsn: "", unit: "PCS", gstRate: App.store.settings().defaultGstRate || 0, price: 0, qty: 1, discountPct: 0, discountAmt: 0, note: "" });
    recompute();
  }

  /* ---------------- Render ---------------- */
  function render(container) {
    if (!st) st = fresh();
    container.innerHTML = "";
    const wrap = el("div.pos-layout");

    /* ----- LEFT: search (+ live preview) → all-products grid ----- */
    const left = el("div.pos-left", { style: { display: "flex", flexDirection: "column", gap: "12px", minWidth: "0" } });

    // Search + Manual — typing shows a live preview dropdown (↑/↓ + ＋ to add)
    const topRow = el("div.pos-toprow");
    const searchWrap = el("div.pos-search");
    const searchInp = el("input#posSearch", { placeholder: "🔍  Search products…  ↑ ↓ to pick, Enter / ＋ to add", autocomplete: "off" });
    const suggestBox = el("div.search-results.pos-suggest");   // live preview dropdown
    searchWrap.appendChild(searchInp); searchWrap.appendChild(suggestBox);
    const manualBtn = el("button.btn.pos-manual", { html: "＋ Manual", onClick: addManual });
    topRow.appendChild(searchWrap); topRow.appendChild(manualBtn);
    left.appendChild(topRow);

    // Preview of the picked product — set qty / rate / amount before it enters the bill
    const previewHost = el("div");
    left.appendChild(previewHost);

    // All products grid — tap a card to add to the bill
    const gridWrap = el("div.card", { style: { flex: "1", overflow: "auto", padding: "12px", minHeight: "150px" } });
    gridWrap.appendChild(el("div.card-title", { style: { margin: "0 0 10px" } }, "Products — tap to preview & add"));
    const gridHost = el("div"); gridWrap.appendChild(gridHost);
    left.appendChild(gridWrap);

    // Items in Bill (cart) + totals — on the LEFT, under the products
    const billCard = el("div.card.pad", { style: { flexShrink: "0", padding: "14px" } });
    billCard.appendChild(el("div.card-title", { style: { margin: "0 0 6px" } }, "Items in Bill"));
    // minHeight stops this scroll container from collapsing to 0 (flexbox min-height:auto trap).
    const cartHost = el("div", { style: { maxHeight: "30vh", minHeight: "56px", overflowY: "auto", overflowX: "hidden", margin: "0 -4px" } });
    billCard.appendChild(cartHost);
    billCard.appendChild(el("div.divider", { style: { margin: "6px 0" } }));
    const totalsHost = el("div"); billCard.appendChild(totalsHost);
    left.appendChild(billCard);
    wrap.appendChild(left);

    /* ----- RIGHT: bill type → customer → invoice details → payment → save ----- */
    const right = el("div.card.pad.pos-right", { style: { display: "flex", flexDirection: "column", gap: "10px", overflow: "auto" } });
    const typeHost = el("div"); right.appendChild(typeHost); right.appendChild(el("div.divider"));
    const custBlock = el("div"); right.appendChild(custBlock); right.appendChild(el("div.divider"));
    const metaHost = el("div"); right.appendChild(metaHost); right.appendChild(el("div.divider"));
    const payHost = el("div"); right.appendChild(payHost);

    const actions = el("div", { style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "auto", paddingTop: "12px" } });
    // Two even columns, matching the Save Only / Clear row below. The labels are
    // long, so the buttons carry their own tighter padding — the .lg default of
    // 24px each side clips "Save & Download" at this column width.
    const grid2 = () => el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" } });
    const wide = { padding: "0 10px", fontSize: "13.5px", minWidth: "0" };
    const mainRow = grid2();
    mainRow.appendChild(el("button.btn.success.lg.block", { html: "💾 Save &amp; Print", title: "Save the bill and open the print dialog (Ctrl+S)", style: wide, onClick: () => saveBill("print") }));
    mainRow.appendChild(el("button.btn.primary.lg.block", { html: "⬇ Save &amp; Download", title: "Save the bill and download the PDF to your Downloads folder", style: wide, onClick: () => saveBill("download") }));
    actions.appendChild(mainRow);
    const row = grid2();
    row.appendChild(el("button.btn.block", { html: "Save Only", onClick: () => saveBill(false) }));
    row.appendChild(el("button.btn.ghost.block", { html: "Clear", onClick: clearBill }));
    actions.appendChild(row);
    // The Ctrl+S hint used to ride inside the Save & Print button and ate the
    // width the labels need; it sits under the buttons now.
    actions.appendChild(el("div.muted", { style: { fontSize: "11px", textAlign: "center" }, html: "<span class='kbd'>Ctrl+S</span> Save &amp; Print" }));
    right.appendChild(actions);
    wrap.appendChild(right);

    container.appendChild(wrap);

    // Store hosts for recompute (before wiring so the search handlers can use them)
    st._hosts = { cartHost, custBlock, totalsHost, payHost, metaHost, typeHost, gridHost, previewHost, suggestBox, searchInp, container };

    // Typing updates the live preview AND filters the grid below
    const doFilter = App.dom.debounce(() => { st._searchQ = searchInp.value; st._sugIdx = 0; drawSuggest(); drawProductGrid(); }, 90);
    searchInp.addEventListener("input", doFilter);
    searchInp.addEventListener("keydown", onSearchKey);
    searchInp.addEventListener("focus", () => { if ((st._searchQ || "").trim()) drawSuggest(); });
    // Delay the close so a click on a preview row still registers
    searchInp.addEventListener("blur", () => setTimeout(() => { if (st._hosts && st._hosts.suggestBox) st._hosts.suggestBox.classList.remove("open"); }, 160));

    drawType(); drawMeta(); drawCustomer(); drawPreview(); drawCart(); drawTotals(); drawPay(); drawProductGrid();
    setTimeout(() => searchInp.focus(), 60);
  }

  /* ---------------- Search live-preview (dropdown + keyboard nav) ---------------- */
  function matchProducts(q, limit) {
    const ql = (q || "").trim().toLowerCase();
    if (!ql) return [];
    const list = App.store.all("products").filter((p) =>
      [p.name, p.code, p.sku, p.hsn].some((v) => String(v || "").toLowerCase().includes(ql)));
    list.sort((a, b) => {
      const an = (a.name || "").toLowerCase(), bn = (b.name || "").toLowerCase();
      const as = an.startsWith(ql) ? 0 : 1, bs = bn.startsWith(ql) ? 0 : 1;
      return as !== bs ? as - bs : an.localeCompare(bn);
    });
    return list.slice(0, limit || 8);
  }

  function drawSuggest() {
    const box = st._hosts && st._hosts.suggestBox; if (!box) return;
    const q = (st._searchQ || "").trim();
    const matches = matchProducts(q, 8);
    st._sug = matches;
    if (!q || !matches.length) { box.classList.remove("open"); box.innerHTML = ""; return; }
    if (st._sugIdx == null || st._sugIdx >= matches.length) st._sugIdx = 0;
    box.innerHTML = "";
    matches.forEach((p, i) => {
      const outOf = Number(p.stock) <= 0;
      const stockCls = outOf ? "out" : Number(p.stock) <= Number(p.minStock || 0) ? "low" : "";
      const item = el("div.pos-sr-item" + (i === st._sugIdx ? ".active" : ""));
      item.appendChild(el("div.pos-sr-ic", "📦"));
      const main = el("div.pos-sr-main");
      main.appendChild(el("div.pos-sr-name", p.name));
      main.appendChild(el("div.pos-sr-meta", `${p.code || p.hsn || "-"} · GST ${p.gstRate || 0}%`));
      item.appendChild(main);
      const right = el("div.pos-sr-right");
      right.appendChild(el("div.pos-sr-price", F.money(p.sellingPrice)));
      right.appendChild(el("div.pos-sr-stock" + (stockCls ? "." + stockCls : ""), outOf ? "Out" : "Stock " + F.num(p.stock, p.stock % 1 ? 2 : 0)));
      item.appendChild(right);
      const add = el("button.pos-sr-add", { type: "button", html: "＋", title: "Add to bill" });
      item.appendChild(add);
      // mousedown keeps the input focused; click adds the product
      item.addEventListener("mousedown", (e) => e.preventDefault());
      item.addEventListener("click", () => selectSuggestion(p));
      add.addEventListener("click", (e) => { e.stopPropagation(); selectSuggestion(p); });
      item.addEventListener("mouseenter", () => { st._sugIdx = i; highlightSuggest(); });
      box.appendChild(item);
    });
    box.classList.add("open");
  }

  function highlightSuggest() {
    const box = st._hosts && st._hosts.suggestBox; if (!box) return;
    Array.from(box.children).forEach((c, i) => c.classList.toggle("active", i === st._sugIdx));
    const active = box.children[st._sugIdx];
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
  }

  // Picking a product does NOT drop it straight into the bill — it opens the
  // preview below the search box so qty / rate / amount can be set first.
  function selectSuggestion(p) {
    const inp = st._hosts && st._hosts.searchInp;
    if (inp) { inp.value = ""; }
    st._searchQ = ""; st._sugIdx = 0;
    drawSuggest(); drawProductGrid();
    openPreview(p);
  }

  function onSearchKey(e) {
    const inp = e.target;
    const n = (st._sug || []).length;
    if (e.key === "ArrowDown") {
      if (!n) return; e.preventDefault();
      st._sugIdx = st._sugIdx == null ? 0 : Math.min(n - 1, st._sugIdx + 1);
      highlightSuggest();
    } else if (e.key === "ArrowUp") {
      if (!n) return; e.preventDefault();
      st._sugIdx = st._sugIdx == null ? 0 : Math.max(0, st._sugIdx - 1);
      highlightSuggest();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (n && st._sug[st._sugIdx]) { selectSuggestion(st._sug[st._sugIdx]); return; }
      // Fallback: exact code match, else first name/code/sku match
      const q = inp.value.trim(); if (!q) return;
      const ql = q.toLowerCase();
      let p = App.store.all("products").find((x) => x.code && x.code.toLowerCase() === ql);
      if (!p) p = App.store.all("products").filter((x) => [x.name, x.code, x.sku].some((v) => String(v || "").toLowerCase().includes(ql)))[0];
      if (p) selectSuggestion(p);
    } else if (e.key === "Escape") {
      inp.value = ""; st._searchQ = ""; drawSuggest(); drawProductGrid();
    }
  }

  /* ---------------- Product preview (qty → rate → amount → add) ----------------
     Sits between the search box and the products grid. Qty, Rate and Amount are
     all editable and stay in sync (Amount = Qty × Rate; typing an Amount
     back-solves the Rate). Packaging % appears on Without-GST bills only. */
  function openPreview(p) {
    st._pending = { product: p, qty: 1, price: Number(p.sellingPrice) || 0 };
    drawPreview();
    const q = st._pending._qtyInp;
    if (q) setTimeout(() => { q.focus(); q.select(); }, 20);
  }
  function closePreview() {
    st._pending = null;
    drawPreview();
    const inp = st._hosts && st._hosts.searchInp;
    if (inp) inp.focus();
  }
  function addPending() {
    const pd = st._pending; if (!pd) return;
    const qty = Number(pd.qty) || 0;
    if (qty <= 0) { App.toast.error("Enter a quantity greater than 0"); return; }
    addProduct(pd.product, qty, Number(pd.price) || 0, (pd.note || "").trim());
    closePreview();
  }

  function drawPreview() {
    const host = st._hosts && st._hosts.previewHost; if (!host) return;
    host.innerHTML = "";
    const pd = st._pending; if (!pd) return;
    const p = pd.product;

    const card = el("div.card.pos-preview");
    const head = el("div.pos-pv-head");
    head.appendChild(el("div.pos-pv-ic", "📦"));
    const info = el("div.pos-pv-info");
    info.appendChild(el("div.pos-pv-name", p.name));
    info.appendChild(el("div.pos-pv-meta",
      `${p.hsn || p.code || "-"} · GST ${p.gstRate || 0}% · ${p.unit || "PCS"} · Stock ${F.num(p.stock, p.stock % 1 ? 2 : 0)}`));
    head.appendChild(info);
    head.appendChild(el("button.icon-btn", { html: "✕", title: "Cancel", onClick: closePreview }));
    card.appendChild(head);

    // Amount shown here is qty × rate (before any GST) — the same figure the
    // Rate column drives, so editing either stays predictable.
    const amountOf = () => F.round2((Number(pd.qty) || 0) * (Number(pd.price) || 0));

    const fields = el("div.pos-pv-fields");
    const fld = (label, node) => { const f = el("div.pos-pv-fld"); f.appendChild(el("label", label)); f.appendChild(node); return f; };

    // Qty — − / value / + stepper, editable
    const stepper = el("div.qty-stepper");
    const minus = el("button.qty-btn", { type: "button", html: "−", title: "Decrease" });
    const qtyInp = el("input.qty-val", { type: "number", value: pd.qty, step: "any", min: "0" });
    const plus = el("button.qty-btn", { type: "button", html: "+", title: "Increase" });
    stepper.appendChild(minus); stepper.appendChild(qtyInp); stepper.appendChild(plus);
    pd._qtyInp = qtyInp;

    const rateInp = el("input", { type: "number", value: pd.price, step: "any", min: "0" });
    const amtInp = el("input.pos-pv-amt", { type: "number", value: amountOf(), step: "any", min: "0" });

    const syncAmt = () => { amtInp.value = amountOf(); };
    const syncQtyRate = () => { qtyInp.value = pd.qty; rateInp.value = pd.price; };
    minus.addEventListener("click", () => { pd.qty = Math.max(0, F.round2((Number(pd.qty) || 0) - 1)); syncQtyRate(); syncAmt(); });
    plus.addEventListener("click", () => { pd.qty = F.round2((Number(pd.qty) || 0) + 1); syncQtyRate(); syncAmt(); });
    qtyInp.addEventListener("input", (e) => { pd.qty = Number(e.target.value) || 0; syncAmt(); });
    rateInp.addEventListener("input", (e) => { pd.price = Number(e.target.value) || 0; syncAmt(); });
    // Typing an amount back-solves the rate (qty stays as entered)
    amtInp.addEventListener("input", (e) => {
      const amt = Number(e.target.value) || 0;
      const qty = Number(pd.qty) || 0;
      if (qty > 0) { pd.price = F.round2(amt / qty); rateInp.value = pd.price; }
    });

    // Qty + Amount show on every bill type; Packaging only on Without-GST.
    fields.appendChild(fld("Qty", stepper));
    fields.appendChild(fld("Rate ₹", rateInp));
    fields.appendChild(fld("Amount ₹", amtInp));

    // Free-text note typed beside the product — prints under the item name on
    // the invoice, on GST and Without-GST bills alike.
    const noteInp = el("input", { type: "text", value: pd.note || "", placeholder: "Type anything — prints on the bill" });
    noteInp.addEventListener("input", (e) => { pd.note = e.target.value; });
    const noteFld = fld("Note", noteInp);
    noteFld.classList.add("wide");
    fields.appendChild(noteFld);

    // Packaging charge — Without-GST / Estimate bills only
    let pkgInp = null;
    if (st.type !== "gst") {
      pkgInp = el("input", { type: "number", value: st.packagingPct || "", placeholder: "0", step: "any", min: "0" });
      pkgInp.addEventListener("input", (e) => { st.packagingPct = Number(e.target.value) || 0; drawTotals(); });
      fields.appendChild(fld("Packaging %", pkgInp));
    }

    // Keyboard navigation across the preview fields: Qty → Rate → Amount → Note
    // (→ Packaging on Without-GST bills). Right arrow steps FORWARD, Left arrow
    // steps BACK, so a whole line can be filled without the mouse. Number fields
    // always jump; the free-text Note only jumps when the caret is at its edge,
    // so ← / → still move within the typed text.
    const navInputs = [qtyInp, rateInp, amtInp, noteInp];
    if (pkgInp) navInputs.push(pkgInp);
    const focusField = (node) => { if (node) { node.focus(); if (node.select) node.select(); } };
    navInputs.forEach((node, idx) => {
      const isText = node === noteInp;   // note is the only text field
      node.addEventListener("keydown", (e) => {
        // selectionStart is only readable on text inputs — guard number fields.
        const atStart = !isText || (node.selectionStart === 0 && node.selectionEnd === 0);
        const atEnd = !isText || (node.selectionStart === node.value.length && node.selectionEnd === node.value.length);
        if (e.key === "ArrowRight" && atEnd) { e.preventDefault(); focusField(navInputs[idx + 1]); }
        else if (e.key === "ArrowLeft" && atStart) { e.preventDefault(); focusField(navInputs[idx - 1]); }
      });
    });

    // Hint strip — spells out the keyboard flow so the shortcut is discoverable.
    const hint = el("div.pos-pv-hint");
    hint.appendChild(el("span", { html: "<b>←</b> <b>→</b> move field" }));
    hint.appendChild(el("span", { html: "<b>Enter</b> add" }));
    hint.appendChild(el("span", { html: "<b>Esc</b> cancel" }));

    const acts = el("div.pos-pv-acts");
    acts.appendChild(el("button.btn.ghost.sm", { text: "Cancel", onClick: closePreview }));
    acts.appendChild(el("button.btn.primary.sm", { html: "✓ Add", onClick: addPending }));
    fields.appendChild(acts);
    fields.appendChild(hint);
    card.appendChild(fields);

    // Enter anywhere in the preview adds the line; Esc cancels.
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addPending(); }
      else if (e.key === "Escape") { e.preventDefault(); closePreview(); }
    });

    host.appendChild(card);
  }

  function recompute() { if (!st._hosts) return; drawCart(); drawTotals(); }

  // Light refresh used while typing in a cart field — updates the line amounts
  // and totals in place WITHOUT rebuilding the table, so the input keeps focus.
  function liveUpdate() {
    if (!st._hosts) return;
    const t = totals();
    (st._amountCells || []).forEach((cell, i) => { if (cell && t.lines[i]) cell.textContent = F.num(lineAmt(t.lines[i])); });
    drawTotals();
  }

  // Amount shown per cart line — taxable value on a GST bill (GST is added once,
  // in the totals below), the net amount on a Without-GST bill. Same figure the
  // printed invoice's Amount column carries, so the two always agree.
  function lineAmt(line) { return st.type === "gst" ? line.taxable : line.amount; }

  // All-products grid (tap a card to add). Filtered by the search box.
  function drawProductGrid() {
    const host = st._hosts.gridHost; host.innerHTML = "";
    const q = (st._searchQ || "").trim().toLowerCase();
    let prods = App.store.all("products");
    if (q) prods = prods.filter((p) => [p.name, p.code, p.sku, p.hsn].some((v) => String(v || "").toLowerCase().includes(q)));
    prods = prods.slice().sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (!prods.length) {
      host.appendChild(el("div.empty-state", { style: { padding: "24px" } }, [el("div.big", "📦"), el("p", q ? "No products match “" + App.dom.esc(q) + "”" : "No products yet — add them in Products")]));
      return;
    }
    const grid = el("div.pos-grid");
    prods.forEach((p) => {
      const outOf = Number(p.stock) <= 0;
      const stockCls = outOf ? "out" : Number(p.stock) <= Number(p.minStock || 0) ? "low" : "";
      const card = el("button.pos-pcard" + (outOf ? ".out" : ""), { type: "button", title: p.name });
      card.appendChild(el("div.pos-pcard-name", p.name));
      card.appendChild(el("div.pos-pcard-meta", `${p.hsn || "-"} · GST ${p.gstRate || 0}%`));
      card.appendChild(el("div.pos-pcard-foot", [
        el("span.pos-pcard-price", F.money(p.sellingPrice)),
        el("span.pos-pcard-stock" + (stockCls ? "." + stockCls : ""), outOf ? "Out" : F.num(p.stock, p.stock % 1 ? 2 : 0)),
      ]));
      card.addEventListener("click", () => { openPreview(p); });
      grid.appendChild(card);
    });
    host.appendChild(grid);
  }

  // Bill-type toggle (GST / Without GST) — segmented control above the customer.
  function drawType() {
    const host = st._hosts.typeHost; host.innerHTML = "";
    host.appendChild(el("div.card-title", { style: { marginBottom: "8px" } }, "Bill Type"));
    const seg = el("div.pos-typeseg");
    TYPE_LABELS.forEach(([v, l]) => {
      const b = el("button.pos-typebtn" + (st.type === v ? ".active" : ""), { text: l });
      b.addEventListener("click", () => { if (st.type === v) return; st.type = v; st.numberOverride = ""; drawType(); drawMeta(); drawCustomer(); drawPreview(); recompute(); });
      seg.appendChild(b);
    });
    host.appendChild(seg);
    // Show exactly which business name will print on this document.
    const s = App.store.settings() || {};
    const printName = st.type === "gst" ? (s.businessName || "") : (s.retailBusinessName || s.businessName || "");
    host.appendChild(el("div", { class: "muted", style: { fontSize: "11px", marginTop: "6px" } },
      "Prints as: " + printName + " · " + (App.invoices.TITLES[st.type] || "")));
    // Reflect the bill type in the sidebar brand (GST -> TRADERS, else CRACKERS)
    if (App.setSidebarBrand) App.setSidebarBrand(st.type);
  }

  // Editable invoice number + date. Number preview follows the selected type;
  // typing overrides it. Leave the number as-is to use the auto-generated one.
  function drawMeta() {
    const host = st._hosts.metaHost; host.innerHTML = "";
    host.appendChild(el("div.card-title", { style: { marginBottom: "8px" } }, "Invoice Details"));
    const row = el("div", { style: { display: "flex", gap: "8px" } });
    const preview = generateNumber(st.type).number;
    const numField = el("div.field", { style: { flex: "1" } }, [el("label", "Invoice No."), (function () {
      const i = el("input", { value: st.numberOverride || preview });
      i.addEventListener("input", (e) => { st.numberOverride = e.target.value; });
      return i;
    })()]);
    const dateField = el("div.field", { style: { width: "150px" } }, [el("label", "Date"), (function () {
      const i = el("input", { type: "date", value: st.date });
      i.addEventListener("input", (e) => { st.date = e.target.value || F.todayISO(); });
      return i;
    })()]);
    row.appendChild(numField); row.appendChild(dateField);
    host.appendChild(row);
    host.appendChild(el("div.hint", { style: { fontSize: "11px", marginTop: "4px" }, class: "muted" }, "Leave the number to auto-generate, or type your own."));
  }

  function drawCustomer() {
    const host = st._hosts.custBlock; host.innerHTML = "";
    host.appendChild(el("div.card-title", { style: { marginBottom: "8px" } }, "Customer Details"));

    // Pick an existing customer to auto-fill (optional)
    const sel = el("select", { style: { width: "100%", marginBottom: "8px" } });
    sel.appendChild(el("option", { value: "" }, "＋ New / Walk-in (type below)"));
    App.store.all("customers").slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((c) => sel.appendChild(el("option", { value: c.id, selected: st.customerId === c.id }, `${c.name}${c.mobile ? " · " + c.mobile : ""}`)));
    sel.addEventListener("change", (e) => { setCustomer(e.target.value); });
    host.appendChild(sel);

    // Enter in the GSTIN / mobile box fetches the customer right away — a partial
    // number is enough as long as it matches exactly one saved customer. Once the
    // details land, focus jumps to the product search: only products left to add.
    // In any other field Enter just walks to the next one.
    const seq = [sel];
    const stepOnEnter = (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const key = e.target === refs.gstin ? "gstin" : e.target === refs.mobile ? "mobile" : null;
      if (key && fetchOnEnter(key, e.target.value, ctx())) return;
      const i = seq.indexOf(e.target);
      const next = i >= 0 && seq[i + 1];
      if (next) { next.focus(); if (next.select) next.select(); return; }
      const paid = st._hosts && st._hosts.payHost && st._hosts.payHost.querySelector("input[type=number]");
      if (paid) { paid.focus(); paid.select(); }
    };
    sel.addEventListener("keydown", stepOnEnter);

    // Inline detail fields
    const refs = {};
    const field = (key, ph, type) => {
      const i = el("input", { type: type || "text", placeholder: ph, value: st.cust[key] || "" });
      i.style.cssText = "width:100%;height:36px;padding:0 10px;margin-bottom:6px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--fg);font-size:13px";
      i.addEventListener("input", (e) => { st.cust[key] = e.target.value; });
      i.addEventListener("keydown", stepOnEnter);
      seq.push(i); refs[key] = i;
      return i;
    };

    // Lookup fields come first. Either one identifies a saved customer and pulls
    // the rest of the details in, so all that's left to do is add products:
    //   GST bill      -> GSTIN or mobile number
    //   Without GST   -> mobile number
    const ctx = () => ({ refs, sel, stateSel, updateBadge });
    if (st.type === "gst") {
      const g = field("gstin", "Customer GSTIN — details fill in automatically", "text");
      g.style.textTransform = "uppercase";
      g.addEventListener("input", (e) => {
        const v = gstKey(e.target.value);
        e.target.value = v; st.cust.gstin = v;
        applyGstin(v, ctx());
      });
      host.appendChild(g);
    }
    const mob = field("mobile", "Mobile number — details fill in automatically", "tel");
    mob.addEventListener("input", (e) => { applyMobile(e.target.value, ctx()); });
    host.appendChild(mob);
    host.appendChild(el("div.muted", { style: { fontSize: "11px", margin: "-2px 0 8px" } },
      st.type === "gst"
        ? "Enter the GSTIN or the mobile number — a saved customer fills in automatically. State is read from the GSTIN code."
        : "Enter the mobile number — a saved customer fills in automatically."));

    host.appendChild(field("name", "Customer name", "text"));
    host.appendChild(field("city", "City / Place (e.g. Bengaluru, Mysore)", "text"));
    if (st.type === "gst") host.appendChild(field("address", "Address (optional)", "text"));

    // Place of Supply (state) — Tamil Nadu first. State drives CGST+SGST vs IGST.
    host.appendChild(el("label", { class: "muted", style: { fontSize: "12px", fontWeight: "600", display: "block", margin: "4px 0 4px" } }, "State (for GST — TN = split, others = IGST)"));
    const stateSel = el("select", { style: { width: "100%" } });
    const home = App.store.settings().state || "Tamil Nadu";
    const ordered = [App.gst.STATES.find(([n]) => n === home), ...App.gst.STATES.filter(([n]) => n !== home)].filter(Boolean);
    ordered.forEach(([n]) => stateSel.appendChild(el("option", { value: n, selected: st.billState === n }, n)));
    stateSel.addEventListener("change", (e) => { st.billState = e.target.value; updateBadge(); drawTotals(); });
    stateSel.addEventListener("keydown", stepOnEnter);
    seq.push(stateSel);
    host.appendChild(stateSel);

    // Intra/inter-state badge — refreshed in place so autofill never steals focus.
    const badgeHost = el("div", { style: { marginTop: "8px" } });
    host.appendChild(badgeHost);
    function updateBadge() {
      badgeHost.innerHTML = "";
      if (st.type === "gst") {
        const intra = App.gst.isIntraState(st.billState, App.store.settings().state);
        badgeHost.appendChild(el("span.badge-pill." + (intra ? "blue" : "amber"), { style: { display: "inline-flex" } },
          intra ? "Tamil Nadu → CGST 9% + SGST 9%" : "Other state → IGST 18%"));
      } else {
        badgeHost.appendChild(el("span.badge-pill.gray", "Without GST — no tax applied"));
      }
    }
    updateBadge();
  }

  /* ---------------- Customer auto-fetch (GSTIN / mobile) ---------------- */
  const gstKey = (v) => String(v || "").toUpperCase().replace(/\s+/g, "");   // uppercase, no spaces
  const digits = (v) => String(v || "").replace(/\D/g, "");                  // mobile, digits only
  const CUST_KEYS = ["name", "mobile", "city", "address", "gstin"];

  // Fill the bill from a saved customer. `key` is the field being typed — it's
  // left alone (and its live value kept) so the caret never jumps mid-typing.
  function fillFrom(c, key, typed, ctx) {
    st._autoFilled = { id: c.id, key, val: typed };
    st.customerId = c.id; st.customer = c;
    st.cust = { name: c.name || "", mobile: c.mobile || "", city: c.city || "", gstin: c.gstin || "", address: c.address || "", pin: c.pin || "" };
    st.cust[key] = typed;
    if (c.state) { st.billState = c.state; if (ctx.stateSel) ctx.stateSel.value = c.state; }
    // Write straight into the live inputs — no redraw, so focus stays put.
    CUST_KEYS.filter((k) => k !== key).forEach((k) => { if (ctx.refs[k]) ctx.refs[k].value = st.cust[k] || ""; });
    if (ctx.sel) ctx.sel.value = c.id;
    ctx.updateBadge(); drawTotals();
    App.toast.success(c.name + " auto-filled");
  }

  // Identity of a customer record — same person if name, mobile and GSTIN agree.
  const identity = (c) => [String(c.name || "").trim().toLowerCase(), digits(c.mobile), gstKey(c.gstin)].join("|");
  // How complete a record is — used to keep the richest copy of a duplicated one.
  const richness = (c) => ["name", "mobile", "gstin", "city", "address", "state", "pin"].filter((k) => String(c[k] || "").trim()).length;

  // Collapse duplicate records of the same person down to one (the fullest copy).
  function dedupeCustomers(list) {
    const byId = new Map();
    list.forEach((c) => {
      const k = identity(c);
      const prev = byId.get(k);
      if (!prev || richness(c) > richness(prev)) byId.set(k, c);
    });
    return Array.from(byId.values());
  }

  // The saved customer matching a GSTIN / mobile, if any — used on save so billing
  // the same person twice updates their record instead of cloning it.
  function findCustomer({ gstin, mobile }) {
    const all = App.store.all("customers");
    const g = gstKey(gstin), m = digits(mobile);
    let hit = g && all.find((c) => gstKey(c.gstin) === g);
    if (!hit && m.length >= 10) hit = all.find((c) => digits(c.mobile) === m);
    return hit || null;
  }

  // Attach a matched customer to the bill. Filling is skipped when they're already
  // attached, but the auto-fill marker is ALWAYS re-keyed to the field just used —
  // otherwise a lookup by one field leaves the detach watching the other one, and
  // editing the number afterwards would silently keep the old customer.
  function attach(c, key, typed, ctx) {
    if (st.customerId !== c.id) fillFrom(c, key, typed, ctx);
    else st._autoFilled = { id: c.id, key, val: typed };
  }

  // Editing away from the value that auto-filled detaches that customer, so the
  // bill is never quietly saved against the previous one.
  function autoDetach(key, typed, ctx) {
    const a = st._autoFilled;
    if (!a || a.key !== key || a.val === typed) return;
    if (st.customerId === a.id) {
      st.customerId = ""; st.customer = null;
      const keep = st.cust[key];
      st.cust = { name: "", mobile: "", city: "", gstin: "", address: "", pin: "" };
      st.cust[key] = keep;
      CUST_KEYS.filter((k) => k !== key).forEach((k) => { if (ctx.refs[k]) ctx.refs[k].value = ""; });
      if (ctx.sel) ctx.sel.value = "";
    }
    st._autoFilled = null;
  }

  // GSTIN: place of supply comes from its 2-digit state code; a full 15-char
  // GSTIN held by a saved customer pulls their whole record in.
  function applyGstin(v, ctx) {
    const hit = v.length >= 2 && App.gst.STATES.find(([, c]) => c === v.slice(0, 2));
    if (hit && st.billState !== hit[0]) { st.billState = hit[0]; if (ctx.stateSel) ctx.stateSel.value = hit[0]; ctx.updateBadge(); drawTotals(); }
    autoDetach("gstin", v, ctx);
    if (v.length < 15) return;
    const c = App.store.all("customers").find((x) => gstKey(x.gstin) === v);
    if (c) attach(c, "gstin", v, ctx);
  }

  // Enter pressed in the GSTIN / mobile box: fetch the customer now. A partial
  // value is accepted as long as exactly one saved customer starts with it, so a
  // half-typed number still fetches. Returns true when it filled the bill in.
  function fetchOnEnter(key, raw, ctx) {
    const v = key === "gstin" ? gstKey(raw) : digits(raw);
    if (!v) return false;
    const of = (c) => (key === "gstin" ? gstKey(c.gstin) : digits(c.mobile));
    const list = App.store.all("customers").filter((c) => of(c));
    let hits = list.filter((c) => of(c) === v);                       // exact first
    if (!hits.length) hits = list.filter((c) => of(c).startsWith(v)); // then partial
    // Duplicate records of the SAME customer must not block the fetch — only a
    // genuinely different customer counts as an ambiguous match.
    const people = dedupeCustomers(hits);
    if (people.length !== 1) {
      App.toast.info(people.length ? "Several customers match — keep typing" : "No saved customer with that " + (key === "gstin" ? "GSTIN" : "number"));
      return false;
    }
    const c = people[0];
    attach(c, key, raw, ctx);
    // Complete the box with the customer's full value, then go straight to products.
    if (ctx.refs[key]) { ctx.refs[key].value = (key === "gstin" ? gstKey(c.gstin) : c.mobile) || raw; st.cust[key] = ctx.refs[key].value; }
    st._autoFilled = { id: c.id, key, val: st.cust[key] };
    const search = st._hosts && st._hosts.searchInp;
    if (search) { search.focus(); search.select(); }
    return true;
  }

  // Mobile: 10+ digits matching a saved customer pulls their record in — this is
  // the lookup used on Without-GST bills, and works on GST bills too.
  function applyMobile(raw, ctx) {
    st.cust.mobile = raw;
    autoDetach("mobile", raw, ctx);
    const d = digits(raw);
    if (d.length < 10) return;
    const c = App.store.all("customers").find((x) => digits(x.mobile) === d);
    if (c) attach(c, "mobile", raw, ctx);
  }

  function setCustomer(id) {
    st.customerId = id;
    st._autoFilled = null;
    st.customer = id ? App.store.get("customers", id) : null;
    if (st.customer) {
      const c = st.customer;
      st.cust = { name: c.name || "", mobile: c.mobile || "", city: c.city || "", gstin: c.gstin || "", address: c.address || "", pin: c.pin || "" };
      if (c.state) st.billState = c.state;   // default place of supply to customer's state
    } else {
      st.cust = { name: "", mobile: "", city: "", gstin: "", address: "", pin: "" };
    }
    drawCustomer(); drawTotals();
  }

  function drawCart() {
    const host = st._hosts.cartHost; host.innerHTML = "";
    if (!st.items.length) { host.appendChild(el("div.empty-state", [el("div.big", "🛒"), el("p", "Search to add products."), el("p.muted", { style: { fontSize: "12px" } }, "Tip: press Enter to add the top match instantly.")])); return; }
    const tbl = el("table.data.cart-table");
    tbl.innerHTML = `<thead><tr><th>Item</th><th class="num" style="width:104px">Qty</th><th class="num" style="width:88px">Rate</th><th class="num" style="width:64px">Disc%</th><th class="num" style="width:104px">Amt</th><th style="width:36px"></th></tr></thead>`;
    const tb = el("tbody");
    const t = totals();
    st._amountCells = [];
    st.items.forEach((it, idx) => {
      const line = t.lines[idx];
      const tr = el("tr");
      // Item name (editable for manual)
      const nameTd = el("td");
      if (it.productId) {
        nameTd.appendChild(el("div.cart-name", it.name));
        const sub = el("div.cart-sub");
        sub.appendChild(el("span", (it.hsn || "-") + " · "));
        if (st.type === "gst") {
          // GST% is editable right on the bill — a product saved with 0% (or the
          // wrong rate) can be corrected here without leaving the billing screen.
          sub.appendChild(el("span", "GST "));
          const gi = el("input.cart-gst" + (Number(it.gstRate) ? "" : ".zero"), { type: "number", value: it.gstRate, step: "any", min: "0", title: "GST % for this line" });
          gi.addEventListener("input", (e) => {
            it.gstRate = Number(e.target.value) || 0;
            gi.classList.toggle("zero", !it.gstRate);
            liveUpdate();
          });
          sub.appendChild(gi);
          sub.appendChild(el("span", "% · "));
        } else {
          sub.appendChild(el("span", "GST " + (it.gstRate || 0) + "% · "));
        }
        sub.appendChild(el("span", it.unit || ""));
        nameTd.appendChild(sub);
      }
      else {
        const ni = el("input", { value: it.name, placeholder: "Item name", style: { height: "30px", fontSize: "12px" } });
        ni.addEventListener("input", (e) => (it.name = e.target.value));
        const gi = el("input", { type: "number", value: it.gstRate, style: { height: "26px", width: "60px", fontSize: "11px", marginTop: "4px" } });
        gi.addEventListener("input", (e) => { it.gstRate = Number(e.target.value) || 0; liveUpdate(); });
        nameTd.appendChild(ni); nameTd.appendChild(el("div", { style: { fontSize: "10px", marginTop: "2px" }, class: "muted" }, [document.createTextNode("GST% "), gi]));
      }
      // Note box beside the product — type anything, it prints on the invoice
      // under the item name (both GST and Without-GST bills).
      const noteInp = el("input.cart-note", { type: "text", value: it.note || "", placeholder: "＋ note (prints on bill)" });
      noteInp.addEventListener("input", (e) => { it.note = e.target.value; });   // no redraw — keeps focus
      nameTd.appendChild(noteInp);
      tr.appendChild(nameTd);
      // qty — − / value / + stepper card
      const qtyTd = el("td.num");
      const stepper = el("div.qty-stepper");
      const minus = el("button.qty-btn", { type: "button", html: "−", title: "Decrease" });
      const qi = el("input.qty-val", { type: "number", value: it.qty, step: "any" });
      const plus = el("button.qty-btn", { type: "button", html: "+", title: "Increase" });
      minus.addEventListener("click", () => { it.qty = Math.max(0, F.round2((Number(it.qty) || 0) - 1)); recompute(); });
      plus.addEventListener("click", () => { it.qty = F.round2((Number(it.qty) || 0) + 1); recompute(); });
      qi.addEventListener("input", (e) => { it.qty = Number(e.target.value) || 0; liveUpdate(); });
      stepper.appendChild(minus); stepper.appendChild(qi); stepper.appendChild(plus);
      qtyTd.appendChild(stepper); tr.appendChild(qtyTd);
      // rate
      const rateTd = el("td.num");
      const ri = el("input", { type: "number", value: it.price, step: "any" });
      ri.addEventListener("input", (e) => { it.price = Number(e.target.value) || 0; liveUpdate(); });
      rateTd.appendChild(ri); tr.appendChild(rateTd);
      // disc %
      const dTd = el("td.num");
      const di = el("input", { type: "number", value: it.discountPct, step: "any" });
      di.addEventListener("input", (e) => { it.discountPct = Number(e.target.value) || 0; liveUpdate(); });
      dTd.appendChild(di); tr.appendChild(dTd);
      // amount
      const amtTd = el("td.num.mono", { style: { fontWeight: 700 } }, F.num(lineAmt(line)));
      st._amountCells[idx] = amtTd;
      tr.appendChild(amtTd);
      // remove
      const rm = el("td");
      rm.appendChild(el("button.icon-btn", { html: "✕", style: { width: "28px", height: "28px" }, onClick: () => { st.items.splice(idx, 1); recompute(); } }));
      tr.appendChild(rm);
      tb.appendChild(tr);
      if (it.stock != null && it.qty > it.stock) tr.style.background = "var(--danger-soft)";
    });
    tbl.appendChild(tb); host.appendChild(tbl);
  }

  function drawTotals() {
    const host = st._hosts.totalsHost; host.innerHTML = "";
    const t = totals(); st._t = t;
    const rowT = (k, v, strong) => el("div", { style: { display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: strong ? "15px" : "13px", fontWeight: strong ? 800 : 400 } }, [el("span", { class: strong ? "" : "muted" }, k), el("span.mono", v)]);
    host.appendChild(rowT("Sub Total", F.money(t.subTotal)));
    if (t.totalDiscount) host.appendChild(rowT("Discount", "- " + F.money(t.totalDiscount)));
    if (st.type === "gst") host.appendChild(rowT("Taxable", F.money(t.taxable)));
    if (st.type === "gst") {
      if (t.intra) { host.appendChild(rowT("CGST 9%", F.money(t.cgst))); host.appendChild(rowT("SGST 9%", F.money(t.sgst))); }
      else host.appendChild(rowT("IGST 18%", F.money(t.igst)));
    }
    if (t.packaging) host.appendChild(rowT("Packaging" + (t.packagingPct ? " " + t.packagingPct + "%" : ""), F.money(t.packaging)));
    if (t.roundOff) host.appendChild(rowT("Round Off", (t.roundOff > 0 ? "+" : "-") + F.money(Math.abs(t.roundOff))));
    host.appendChild(el("div.divider", { style: { margin: "6px 0" } }));
    host.appendChild(rowT("Grand Total", F.money(t.grandTotal), true));

    // A GST bill carrying 0%-rated lines produces no tax — say so loudly rather
    // than printing a tax invoice with a blank GST column.
    if (st.type === "gst") {
      const zero = st.items.filter((it) => !Number(it.gstRate));
      if (zero.length) {
        host.appendChild(el("div.pos-gst-warn", { style: { marginTop: "8px" } },
          `⚠ ${zero.length} item${zero.length > 1 ? "s have" : " has"} GST 0% — no tax will be charged. Set the GST % on the line above (18% for fireworks).`));
      }
    }

    // extra controls
    const ctl = el("div", { style: { display: "flex", gap: "10px", marginTop: "8px", flexWrap: "wrap", fontSize: "12px" } });
    const discInp = el("input", { type: "number", value: st.billDiscountAmt || "", placeholder: "0", style: { height: "30px", width: "90px" } });
    discInp.addEventListener("input", (e) => { st.billDiscountAmt = Number(e.target.value) || 0; drawTotals(); });
    ctl.appendChild(el("label", { style: { display: "flex", alignItems: "center", gap: "5px" } }, [document.createTextNode("Bill Disc ₹"), discInp]));
    // Packaging charges (%) — Without-GST bills only
    if (st.type !== "gst") {
      const pkgInp = el("input", { type: "number", value: st.packagingPct || "", placeholder: "0", style: { height: "30px", width: "70px" } });
      pkgInp.addEventListener("input", (e) => { st.packagingPct = Number(e.target.value) || 0; drawTotals(); });
      ctl.appendChild(el("label", { style: { display: "flex", alignItems: "center", gap: "5px" } }, [document.createTextNode("Packaging %"), pkgInp]));
    }
    const roLabel = el("label", { style: { display: "flex", alignItems: "center", gap: "5px" } });
    const ro = el("input", { type: "checkbox" }); ro.checked = st.roundOff;
    ro.addEventListener("change", (e) => { st.roundOff = e.target.checked; drawTotals(); });
    roLabel.appendChild(ro); roLabel.appendChild(document.createTextNode("Round off"));
    ctl.appendChild(roLabel);
    const tiLabel = el("label", { style: { display: "flex", alignItems: "center", gap: "5px" } });
    const ti = el("input", { type: "checkbox" }); ti.checked = st.taxInclusive;
    ti.addEventListener("change", (e) => { st.taxInclusive = e.target.checked; recompute(); });
    tiLabel.appendChild(ti); tiLabel.appendChild(document.createTextNode("Price incl. tax"));
    ctl.appendChild(tiLabel);
    host.appendChild(ctl);
  }

  function drawPay() {
    const host = st._hosts.payHost; host.innerHTML = "";
    host.appendChild(el("div.card-title", { style: { marginBottom: "8px" } }, "Payment"));
    const modeWrap = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } });
    PAY_MODES.forEach((m) => {
      const b = el("button.btn.sm" + (st.paymentMode === m ? ".primary" : ""), { text: m, onClick: () => { st.paymentMode = m; st.split = null; drawPay(); } });
      modeWrap.appendChild(b);
    });
    const splitBtn = el("button.btn.sm" + (st.split ? ".primary" : ""), { text: "Split", onClick: openSplit });
    modeWrap.appendChild(splitBtn);
    host.appendChild(modeWrap);
    if (st.split) {
      host.appendChild(el("div.muted", { style: { fontSize: "12px", marginTop: "6px" } }, st.split.map((s) => `${s.mode}: ${F.money(s.amount)}`).join("  ·  ")));
    }
    // paid amount
    const paidRow = el("div", { style: { marginTop: "8px" } });
    paidRow.appendChild(el("label", { style: { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }, class: "muted" }, "Amount Received"));
    const paidInp = el("input", { type: "number", step: "any", placeholder: "Full amount", value: st.paid != null ? st.paid : "", style: { width: "100%", height: "38px" } });
    paidInp.addEventListener("input", (e) => { st.paid = e.target.value === "" ? null : Number(e.target.value) || 0; });
    paidRow.appendChild(paidInp);
    host.appendChild(paidRow);
  }

  function openSplit() {
    const t = st._t || totals();
    const rows = st.split || [{ mode: "Cash", amount: t.grandTotal }, { mode: "UPI", amount: 0 }];
    const body = el("div");
    const host = el("div"); body.appendChild(host);
    function draw() {
      host.innerHTML = "";
      rows.forEach((r, i) => {
        const line = el("div", { style: { display: "flex", gap: "8px", marginBottom: "8px" } });
        const ms = el("select", { style: { width: "150px" } });
        PAY_MODES.forEach((m) => ms.appendChild(el("option", { value: m, selected: r.mode === m }, m)));
        ms.addEventListener("change", (e) => (r.mode = e.target.value));
        const amt = el("input", { type: "number", value: r.amount, step: "any", style: { flex: "1" } });
        amt.addEventListener("input", (e) => { r.amount = Number(e.target.value) || 0; sum(); });
        line.appendChild(ms); line.appendChild(amt);
        line.appendChild(el("button.icon-btn", { html: "✕", onClick: () => { rows.splice(i, 1); draw(); } }));
        host.appendChild(line);
      });
      sum();
    }
    const sumEl = el("div.muted", { style: { fontSize: "13px", marginTop: "8px" } });
    function sum() { const s = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0); sumEl.innerHTML = `Total split: <b>${F.money(s)}</b> / Grand ${F.money(t.grandTotal)} ${Math.abs(s - t.grandTotal) < 0.5 ? "✓" : "⚠ mismatch"}`; }
    body.appendChild(el("button.btn.sm", { html: "＋ Add mode", onClick: () => { rows.push({ mode: "Card", amount: 0 }); draw(); } }));
    body.appendChild(sumEl);
    draw();
    App.modal.open({ title: "Split Payment", size: "narrow", body, footer: [
      { text: "Cancel", class: "ghost", onClick: () => {} },
      { text: "Apply", class: "primary", onClick: () => { st.split = rows.filter((r) => r.amount > 0); st.paymentMode = "Split"; st.paid = st.split.reduce((a, r) => a + r.amount, 0); drawPay(); } },
    ] });
  }

  /* ---------------- Save ---------------- */
  // mode: "print" (or true) → print sheet · "download" → PDF into Downloads ·
  // anything else → preview modal.
  function saveBill(mode) {
    const after = mode === true || mode === "print" ? "print" : mode === "download" ? "download" : "preview";
    if (!st.items.length) { App.toast.error("Add at least one item"); return; }
    if (st.items.some((it) => !it.name)) { App.toast.error("Every item needs a name"); return; }
    const s = App.store.settings() || {};
    const t = totals();
    const gen = generateNumber(st.type);
    // Use a manually-typed number if provided; otherwise the auto number.
    const override = (st.numberOverride || "").trim();
    const number = override || gen.number;
    const main = gen.main && !override; // only advance the counter when using the auto number
    const isSale = st.type === "retail" || st.type === "gst";
    const paid = st.paid != null ? st.paid : (st.paymentMode === "Credit" ? 0 : t.grandTotal);

    // Use the inline-entered details; if a new name was typed (no existing
    // customer selected), save it to the customer master for next time.
    const cu = st.cust || {};
    let customerId = st.customerId;
    if (!customerId && (cu.name || "").trim()) {
      // Billing the same GSTIN / mobile again UPDATES that customer instead of
      // saving a second copy — duplicates are what broke the auto-fetch before.
      const existing = findCustomer(cu);
      const rec = App.store.upsert("customers", {
        ...(existing || {}),
        name: cu.name.trim(), mobile: cu.mobile || "", city: cu.city || "",
        gstin: cu.gstin || "", address: cu.address || "", state: st.billState || "", pin: cu.pin || "",
      });
      customerId = rec.id;
    }

    const inv = {
      number, type: st.type, date: st.date || F.todayISO(),
      customerId: customerId, customerName: (cu.name || "").trim() || "Walk-in Customer",
      customerMobile: cu.mobile || "", customerGstin: cu.gstin || "", customerCity: cu.city || "",
      customerState: st.billState || s.state || "Tamil Nadu",
      customerAddress: cu.address || "", customerPin: cu.pin || "",
      items: t.lines.map((l) => ({ productId: l.productId, name: l.name, hsn: l.hsn, unit: l.unit, qty: l.qty, price: l.price, discount: l.discount, gstRate: l.gstRate, cgst: l.cgst, sgst: l.sgst, igst: l.igst, taxable: l.taxable, amount: l.amount, note: l.note })),
      totals: t, paymentMode: st.paymentMode, split: st.split, paid: F.round2(paid), note: st.note, status: "active",
      servedBy: s.businessName,
    };
    App.store.upsert("invoices", inv);
    if (main) App.store.saveSettings({ nextInvoiceNo: (s.nextInvoiceNo || 1) + 1 });

    // Reduce stock for sales (retail/gst/challan)
    if (isSale || st.type === "challan") {
      st.items.forEach((it) => {
        if (!it.productId) return;
        const p = App.store.get("products", it.productId);
        if (p) {
          App.store.upsert("products", { ...p, stock: F.round2((Number(p.stock) || 0) - it.qty) });
          App.store.upsert("stockMoves", { productId: p.id, productName: p.name, type: "sale", qty: -it.qty, balance: F.round2((Number(p.stock) || 0) - it.qty), reason: number, date: inv.date });
        }
      });
    }

    App.toast.success(`${App.invoices.TITLES[st.type]} ${number} saved`);
    if (after === "print") App.invoices.print(inv);
    else if (after === "download") App.invoices.downloadPDF(inv);
    else App.invoices.preview(inv);
    st = fresh();
    App.ui.refresh("pos"); App.ui.navigate("pos");
    App.refreshLowStock();
  }

  function clearBill() {
    if (!st.items.length) return;
    App.modal.confirm({ message: "Clear the current bill?", confirmText: "Clear", danger: true }).then((ok) => { if (ok) { st = fresh(); App.ui.refresh("pos"); App.ui.navigate("pos"); } });
  }

  App.modules.pos = { render, saveBill, setCustomer: (id) => {
    if (!st) st = fresh();
    if (st._hosts) return setCustomer(id);
    const c = App.store.get("customers", id);
    st.customerId = id; st.customer = c;
    if (c) { st.cust = { name: c.name || "", mobile: c.mobile || "", gstin: c.gstin || "", address: c.address || "", pin: c.pin || "" }; if (c.state) st.billState = c.state; }
  } };
})();
