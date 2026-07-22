/* =========================================================================
   purchases.js — purchase entry (supplier, GST, items), stock-in, history.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el, esc } = App.dom;
  const F = App.format;

  function render(container) {
    const wrap = el("div");
    const ps = App.store.all("purchases");
    const total = ps.filter((p) => p.status !== "cancelled").reduce((s, p) => s + (p.totals?.grandTotal || 0), 0);
    wrap.appendChild(el("div.page-head", [
      el("div", [el("h2", "Purchases"), el("div.sub", `${ps.length} purchase bills · ${F.compact(total)} total`)]),
      el("div.actions", [el("button.btn.primary", { html: "＋ New Purchase", onClick: () => openEntry() })]),
    ]));
    const host = el("div"); wrap.appendChild(host);
    container.appendChild(wrap);
    drawTable(host);
  }

  function drawTable(host) {
    host.innerHTML = "";
    const rows = App.store.all("purchases").slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (!rows.length) { host.appendChild(el("div.card.empty-state", [el("div.big", "🛒"), el("p", "No purchases recorded."), el("button.btn.primary", { style: { marginTop: "12px" }, html: "＋ Record a purchase", onClick: () => openEntry() })])); return; }
    const tw = el("div.table-wrap"); const tbl = el("table.data");
    tbl.innerHTML = `<thead><tr><th>Bill No</th><th>Date</th><th>Supplier</th><th class="num">Taxable</th><th class="num">GST</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>`;
    const tb = el("tbody");
    rows.forEach((p) => {
      const tr = el("tr");
      tr.innerHTML = `<td><b>${esc(p.number)}</b><div class="muted" style="font-size:11px">${esc(p.supplierBillNo || "")}</div></td><td>${F.fmtDate(p.date)}</td><td>${esc(p.supplierName || "—")}</td>
        <td class="num mono">${F.money(p.totals?.taxable || 0)}</td><td class="num mono">${F.money(p.totals?.totalTax || 0)}</td><td class="num mono">${F.money(p.totals?.grandTotal || 0)}</td>
        <td>${p.status === "cancelled" ? '<span class="badge-pill red">Cancelled</span>' : '<span class="badge-pill green">Recorded</span>'}</td>`;
      const act = el("td"); const ra = el("div.row-actions");
      ra.appendChild(el("button.icon-btn", { title: "Print", html: "🖨", style: { width: "30px", height: "30px" }, onClick: () => App.invoices.print({ ...p, type: "purchase" }) }));
      ra.appendChild(el("button.icon-btn", { title: "Return / Cancel", html: "↩", style: { width: "30px", height: "30px" }, onClick: () => cancelPurchase(p) }));
      act.appendChild(ra); tr.appendChild(act); tb.appendChild(tr);
    });
    tbl.appendChild(tb); tw.appendChild(tbl); host.appendChild(tw);
  }

  function openEntry() {
    const s = App.store.settings() || {};
    const state = { items: [], supplierId: "", paid: null, supplierBillNo: "" };

    const body = el("div");
    // supplier + bill no
    const top = el("div.form-grid", { style: { marginBottom: "12px" } });
    const supSel = el("select");
    supSel.appendChild(el("option", { value: "" }, "Select supplier"));
    App.store.all("suppliers").forEach((sp) => supSel.appendChild(el("option", { value: sp.id }, sp.name)));
    supSel.addEventListener("change", (e) => (state.supplierId = e.target.value));
    const billNo = el("input", { placeholder: "Supplier bill / ref no" });
    billNo.addEventListener("input", (e) => (state.supplierBillNo = e.target.value));
    top.appendChild(el("div.field", [el("label", "Supplier"), supSel]));
    top.appendChild(el("div.field", [el("label", "Supplier Bill No"), billNo]));
    body.appendChild(top);

    // add product
    const addRow = el("div", { style: { display: "flex", gap: "8px", marginBottom: "10px" } });
    const prodSel = el("select", { style: { flex: "1" } });
    prodSel.appendChild(el("option", { value: "" }, "Add existing product…"));
    App.store.all("products").forEach((p) => prodSel.appendChild(el("option", { value: p.id }, p.name)));
    addRow.appendChild(prodSel);
    addRow.appendChild(el("button.btn.primary", { html: "＋ Add", onClick: () => {
      const p = App.store.get("products", prodSel.value);
      if (!p) return;
      state.items.push({ productId: p.id, name: p.name, hsn: p.hsn, unit: p.unit, gstRate: Number(p.gstRate) || 0, price: Number(p.purchasePrice) || 0, qty: 1, discountPct: 0, discountAmt: 0 });
      drawItems();
    } }));
    body.appendChild(addRow);

    const itemsHost = el("div"); body.appendChild(itemsHost);
    const totalsHost = el("div", { style: { marginTop: "12px" } }); body.appendChild(totalsHost);

    function calc() {
      const sup = App.store.get("suppliers", state.supplierId);
      return App.gst.computeBill(state.items, { customerState: sup?.state || s.state, homeState: s.state, roundOff: true });
    }
    function drawItems() {
      itemsHost.innerHTML = "";
      if (!state.items.length) { itemsHost.appendChild(el("div.muted", { style: { fontSize: "13px" } }, "No items yet.")); drawTotals(); return; }
      const tbl = el("table.data");
      tbl.innerHTML = `<thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">GST%</th><th class="num">Amount</th><th></th></tr></thead>`;
      const tb = el("tbody"); const t = calc();
      state.items.forEach((it, i) => {
        const line = t.lines[i];
        const tr = el("tr");
        const nameTd = el("td");
        if (it.productId) nameTd.textContent = it.name;
        else { const ni = el("input", { value: it.name, placeholder: "Item", style: { height: "30px" } }); ni.addEventListener("input", (e) => (it.name = e.target.value)); nameTd.appendChild(ni); }
        tr.appendChild(nameTd);
        const mk = (val, on, w = 60) => { const inp = el("input", { type: "number", value: val, step: "any", style: { height: "30px", width: w + "px", textAlign: "right" } }); inp.addEventListener("input", on); const td = el("td.num"); td.appendChild(inp); return td; };
        tr.appendChild(mk(it.qty, (e) => { it.qty = Number(e.target.value) || 0; drawItems(); }));
        tr.appendChild(mk(it.price, (e) => { it.price = Number(e.target.value) || 0; drawItems(); }, 80));
        tr.appendChild(mk(it.gstRate, (e) => { it.gstRate = Number(e.target.value) || 0; drawItems(); }, 55));
        tr.appendChild(el("td.num.mono", F.num(line.amount)));
        const rm = el("td"); rm.appendChild(el("button.icon-btn", { html: "✕", style: { width: "28px", height: "28px" }, onClick: () => { state.items.splice(i, 1); drawItems(); } })); tr.appendChild(rm);
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      const tw = el("div.table-wrap"); tw.appendChild(tbl); itemsHost.appendChild(tw);
      drawTotals();
    }
    function drawTotals() {
      const t = calc(); state._t = t;
      totalsHost.innerHTML = `<div style="display:flex;justify-content:flex-end;gap:24px;font-size:14px">
        <span class="muted">Taxable: <b>${F.money(t.taxable)}</b></span>
        <span class="muted">GST: <b>${F.money(t.totalTax)}</b></span>
        <span style="font-size:16px;font-weight:800">Total: ${F.money(t.grandTotal)}</span></div>`;
    }
    drawItems();

    App.modal.open({ title: "New Purchase Entry", size: "wide", body, footer: [
      { text: "Cancel", class: "ghost" },
      { text: "💾 Save Purchase", class: "primary", onClick: () => {
        if (!state.items.length) { App.toast.error("Add at least one item"); return false; }
        const sup = App.store.get("suppliers", state.supplierId);
        const t = calc();
        const { number } = App.numbering.generateNumber("purchase");
        const rec = {
          number, type: "purchase", date: F.todayISO(), supplierId: state.supplierId, supplierName: sup?.name || "—",
          supplierBillNo: state.supplierBillNo, items: t.lines, totals: t, paid: state.paid != null ? state.paid : t.grandTotal, status: "active",
        };
        App.store.upsert("purchases", rec);
        // increase stock + update purchase price
        state.items.forEach((it) => {
          if (!it.productId) return;
          const p = App.store.get("products", it.productId);
          if (p) { App.store.upsert("products", { ...p, stock: F.round2((Number(p.stock) || 0) + it.qty), purchasePrice: it.price || p.purchasePrice }); App.store.upsert("stockMoves", { productId: p.id, productName: p.name, type: "purchase", qty: it.qty, balance: F.round2((Number(p.stock) || 0) + it.qty), reason: number, date: rec.date }); }
        });
        App.toast.success("Purchase " + number + " saved");
        App.ui.refresh("purchases"); App.ui.navigate("purchases"); App.refreshLowStock();
      } },
    ] });
  }

  function cancelPurchase(p) {
    if (p.status === "cancelled") return;
    App.modal.confirm({ title: "Cancel / Return Purchase", message: `Reverse ${p.number}? Stock added by this purchase will be removed.`, confirmText: "Reverse", danger: true }).then((ok) => {
      if (!ok) return;
      (p.items || []).forEach((it) => { if (!it.productId) return; const pr = App.store.get("products", it.productId); if (pr) App.store.upsert("products", { ...pr, stock: F.round2((Number(pr.stock) || 0) - it.qty) }); });
      App.store.upsert("purchases", { ...p, status: "cancelled" });
      App.toast.warn(p.number + " reversed");
      App.ui.refresh("purchases"); App.ui.navigate("purchases"); App.refreshLowStock();
    });
  }

  App.modules.purchases = { render };
})();
