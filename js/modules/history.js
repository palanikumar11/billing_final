/* =========================================================================
   history.js — bill history: search, filters, view, reprint, duplicate,
   cancel, return, record payment.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el, esc, download } = App.dom;
  const F = App.format;

  let filter = { q: "", type: "", pay: "", from: "", to: "" };
  let selected = new Set();   // ids of bills ticked for bulk actions
  let _bulk = null;           // { bar, count } refs for the bulk action bar

  function filtered() {
    let rows = App.store.all("invoices").slice();
    const q = filter.q.toLowerCase();
    if (q) rows = rows.filter((i) => [i.number, i.customerName, i.customerMobile, i.customerGstin].some((v) => String(v || "").toLowerCase().includes(q)));
    if (filter.type) rows = rows.filter((i) => i.type === filter.type);
    if (filter.pay) rows = rows.filter((i) => i.paymentMode === filter.pay);
    if (filter.from) rows = rows.filter((i) => i.date >= filter.from);
    if (filter.to) rows = rows.filter((i) => i.date <= filter.to);
    return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  function render(container) {
    selected.clear();
    const wrap = el("div");
    const invs = App.store.all("invoices");
    const totalVal = invs.filter((i) => i.status !== "cancelled").reduce((s, i) => s + (i.totals?.grandTotal || 0), 0);
    wrap.appendChild(el("div.page-head", [
      el("div", [el("h2", "Bill History"), el("div.sub", `${invs.length} documents · ${F.compact(totalVal)} total value`)]),
      el("div.actions", [el("button.btn", { html: "⬇ Export CSV", onClick: exportCSV }), el("button.btn.primary", { html: "＋ New Bill", onClick: () => App.ui.navigate("pos") })]),
    ]));

    const toolbar = el("div.toolbar");
    const sb = el("div.search-box", [el("span.ic", "🔍"), el("input", { placeholder: "Invoice #, customer, phone, GSTIN…", value: filter.q })]);
    sb.querySelector("input").addEventListener("input", App.dom.debounce((e) => { filter.q = e.target.value; draw(host); }, 160));
    toolbar.appendChild(sb);
    const typeSel = el("select"); typeSel.appendChild(el("option", { value: "" }, "All Bills"));
    [["gst", "GST Bills"], ["retail", "Without-GST Bills"], ["estimate", "Estimates"], ["credit_note", "Credit Notes"]].forEach(([v, l]) => typeSel.appendChild(el("option", { value: v, selected: filter.type === v }, l)));
    typeSel.addEventListener("change", (e) => { filter.type = e.target.value; draw(host); });
    toolbar.appendChild(typeSel);
    const paySel = el("select"); paySel.appendChild(el("option", { value: "" }, "All Payments"));
    ["Cash", "UPI", "Card", "Bank Transfer", "Credit", "Split"].forEach((m) => paySel.appendChild(el("option", { value: m, selected: filter.pay === m }, m)));
    paySel.addEventListener("change", (e) => { filter.pay = e.target.value; draw(host); });
    toolbar.appendChild(paySel);
    const fromI = el("input", { type: "date", value: filter.from, title: "From date" });
    fromI.addEventListener("change", (e) => { filter.from = e.target.value; draw(host); });
    const toI = el("input", { type: "date", value: filter.to, title: "To date" });
    toI.addEventListener("change", (e) => { filter.to = e.target.value; draw(host); });
    toolbar.appendChild(fromI); toolbar.appendChild(toI);
    wrap.appendChild(toolbar);

    const host = el("div"); wrap.appendChild(host);
    container.appendChild(wrap);
    draw(host);
  }

  function draw(host) {
    host.innerHTML = "";
    const rows = filtered();

    // Bulk action bar — shown when ≥1 bill is ticked
    const bulk = el("div", { style: { display: "none", alignItems: "center", gap: "10px", padding: "10px 14px", marginBottom: "12px", background: "var(--brand-soft)", border: "1px solid var(--brand)", borderRadius: "var(--radius)" } });
    const bulkCount = el("b", "0 selected");
    bulk.appendChild(bulkCount);
    bulk.appendChild(el("div", { style: { flex: "1" } }));
    bulk.appendChild(el("button.btn.sm", { html: "⬇ Download CSV", onClick: bulkDownloadCSV }));
    bulk.appendChild(el("button.btn.sm.danger", { html: "🗑 Delete Selected", onClick: bulkDelete }));
    bulk.appendChild(el("button.btn.sm.ghost", { html: "Clear", onClick: () => { selected.clear(); draw(host); } }));
    host.appendChild(bulk);
    _bulk = { bar: bulk, count: bulkCount };

    if (!rows.length) { host.appendChild(el("div.card.empty-state", [el("div.big", "📄"), el("p", "No bills match your filters.")])); return; }
    const tw = el("div.table-wrap"); const tbl = el("table.data");
    tbl.innerHTML = `<thead><tr><th style="width:38px"></th><th>Invoice</th><th>Date</th><th>Customer</th><th>Type</th><th>Payment</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead>`;
    // Select-all checkbox (ticks every bill currently in view)
    const selAll = el("input", { type: "checkbox", title: "Select all" });
    selAll.checked = rows.length > 0 && rows.every((r) => selected.has(r.id));
    selAll.addEventListener("change", () => { if (selAll.checked) rows.forEach((r) => selected.add(r.id)); else rows.forEach((r) => selected.delete(r.id)); draw(host); });
    tbl.querySelector("thead th").appendChild(selAll);
    const tb = el("tbody");
    rows.forEach((i) => {
      const bal = F.round2((i.totals?.grandTotal || 0) - (i.paid || 0));
      const status = i.status === "cancelled" ? '<span class="badge-pill red">Cancelled</span>' : i.status === "returned" ? '<span class="badge-pill gray">Returned</span>' : bal > 0.5 ? '<span class="badge-pill amber">Due ' + F.moneyPlain(bal) + "</span>" : '<span class="badge-pill green">Paid</span>';
      const typeBadge = i.type === "gst" ? '<span class="badge-pill blue">GST</span>'
        : i.type === "retail" ? '<span class="badge-pill gray">Without GST</span>'
        : '<span class="badge-pill gray">' + esc(App.invoices.TITLES[i.type] || i.type) + "</span>";
      const tr = el("tr");
      tr.innerHTML = `<td class="selcol"></td><td style="cursor:pointer"><b>${esc(i.number)}</b></td><td>${F.fmtDate(i.date)}</td><td>${esc(i.customerName || "Walk-in")}</td>
        <td>${typeBadge}</td><td>${esc(i.paymentMode || "")}</td>
        <td class="num mono">${F.money(i.totals?.grandTotal || 0)}</td><td>${status}</td>`;
      const cb = el("input", { type: "checkbox" }); cb.checked = selected.has(i.id);
      cb.addEventListener("change", () => { if (cb.checked) selected.add(i.id); else selected.delete(i.id); updateBulk(); });
      tr.querySelector(".selcol").appendChild(cb);
      tr.querySelectorAll("td")[1].addEventListener("click", () => openView(i.id));
      const act = el("td"); const ra = el("div.row-actions");
      ra.appendChild(el("button.icon-btn", { title: "View", html: "👁", style: { width: "30px", height: "30px" }, onClick: () => openView(i.id) }));
      ra.appendChild(el("button.icon-btn", { title: "Download PDF", html: "⬇", style: { width: "30px", height: "30px" }, onClick: () => App.invoices.downloadPDF(i) }));
      ra.appendChild(el("button.icon-btn", { title: "Print", html: "🖨", style: { width: "30px", height: "30px" }, onClick: () => App.invoices.print(i) }));
      ra.appendChild(el("button.icon-btn", { title: "Delete", html: "🗑", style: { width: "30px", height: "30px" }, onClick: () => deleteBill(i.id) }));
      act.appendChild(ra); tr.appendChild(act); tb.appendChild(tr);
    });
    tbl.appendChild(tb); tw.appendChild(tbl); host.appendChild(tw);
    host.appendChild(el("div.muted", { style: { marginTop: "10px", fontSize: "12px" } }, rows.length + " documents"));
    updateBulk();
  }

  function updateBulk() {
    if (!_bulk) return;
    const n = selected.size;
    _bulk.bar.style.display = n ? "flex" : "none";
    _bulk.count.textContent = n + (n === 1 ? " bill selected" : " bills selected");
  }

  // Hard-delete a bill record. Restores stock first for active sales so
  // inventory stays correct (mirrors Cancel, but the record is removed).
  function hardDelete(i) {
    if (i.status !== "cancelled" && i.status !== "returned") restoreStock(i);
    App.store.remove("invoices", i.id);
  }

  function deleteBill(id) {
    const i = App.store.get("invoices", id); if (!i) return;
    App.modal.confirm({ title: "Delete Bill", message: `Permanently delete ${i.number}? This cannot be undone. (For GST records you are meant to keep, use “Cancel Bill” instead — it keeps the record.)`, confirmText: "Delete", danger: true }).then((ok) => {
      if (!ok) return;
      hardDelete(i);
      App.toast.warn(i.number + " deleted");
      App.ui.refresh("history"); App.ui.navigate("history"); App.refreshLowStock();
    });
  }

  function bulkDelete() {
    const ids = [...selected]; if (!ids.length) return;
    App.modal.confirm({ title: "Delete Selected Bills", message: `Permanently delete ${ids.length} bill${ids.length === 1 ? "" : "s"}? This cannot be undone. Stock for active sales is added back.`, confirmText: "Delete " + ids.length, danger: true }).then((ok) => {
      if (!ok) return;
      let n = 0; ids.forEach((id) => { const i = App.store.get("invoices", id); if (i) { hardDelete(i); n++; } });
      selected.clear();
      App.toast.warn(n + " bill" + (n === 1 ? "" : "s") + " deleted");
      App.ui.refresh("history"); App.ui.navigate("history"); App.refreshLowStock();
    });
  }

  function csvRow(i) {
    return { number: i.number, date: i.date, type: i.type, customer: i.customerName, mobile: i.customerMobile,
      gstin: i.customerGstin, state: i.customerState, taxable: i.totals?.taxable, cgst: i.totals?.cgst,
      sgst: i.totals?.sgst, igst: i.totals?.igst, total: i.totals?.grandTotal, paid: i.paid,
      payment: i.paymentMode, status: i.status };
  }

  function bulkDownloadCSV() {
    const ids = new Set(selected);
    const rows = App.store.all("invoices").filter((i) => ids.has(i.id)).map(csvRow);
    if (!rows.length) { App.toast.info("Select some bills first"); return; }
    download("bills_selected_" + F.todayISO() + ".csv", App.csv.stringify(rows), "text/csv");
    App.toast.success("Downloaded " + rows.length + " bill" + (rows.length === 1 ? "" : "s"));
  }

  function openView(id) {
    const i = App.store.get("invoices", id); if (!i) return;
    const t = i.totals || {};
    const bal = F.round2((t.grandTotal || 0) - (i.paid || 0));
    const body = el("div");
    body.appendChild(el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "14px" } }, [
      el("div.stat", { style: { flex: "1" } }, [el("div.stat-label", "Grand Total"), el("div.stat-value", F.compact(t.grandTotal || 0))]),
      el("div.stat", { style: { flex: "1" } }, [el("div.stat-label", "Paid"), el("div.stat-value", F.compact(i.paid || 0))]),
      el("div.stat", { style: { flex: "1" } }, [el("div.stat-label", "Balance"), el("div.stat-value", F.compact(bal))]),
    ]));
    body.appendChild(el("div.card.pad", { html: `<div style="font-size:13px;line-height:1.9">
      <b>${esc(i.number)}</b> · ${esc(App.invoices.TITLES[i.type] || i.type)} · ${F.fmtDate(i.date)}<br>
      Customer: <b>${esc(i.customerName || "Walk-in")}</b> ${i.customerMobile ? "· " + esc(i.customerMobile) : ""} ${i.customerGstin ? "· " + esc(i.customerGstin) : ""}<br>
      State: ${esc(i.customerState || "—")} · Payment: ${esc(i.paymentMode || "")} · ${t.intra ? "CGST+SGST" : "IGST"} · Items: ${i.items?.length || 0}</div>` }));
    // items
    const tw = el("div.table-wrap", { style: { marginTop: "12px" } }); const tbl = el("table.data");
    tbl.innerHTML = `<thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Tax</th><th class="num">Amount</th></tr></thead>`;
    const tb = el("tbody");
    (i.items || []).forEach((it) => { const tr = el("tr"); tr.innerHTML = `<td>${esc(it.name)}</td><td class="num">${F.num(it.qty, it.qty % 1 ? 2 : 0)}</td><td class="num mono">${F.money(it.price)}</td><td class="num mono">${F.money((it.cgst || 0) + (it.sgst || 0) + (it.igst || 0))}</td><td class="num mono">${F.money(it.amount)}</td>`; tb.appendChild(tr); });
    tbl.appendChild(tb); tw.appendChild(tbl); body.appendChild(tw);

    const cancelled = i.status === "cancelled";
    const footer = [
      { text: "Close", class: "ghost" },
      { text: "⧉ Duplicate", onClick: () => duplicate(i) },
    ];
    if (!cancelled) {
      if (bal > 0.5) footer.push({ text: "💵 Record Payment", onClick: () => recordPayment(i) });
      footer.push({ text: "↩ Return", onClick: () => returnBill(i) });
      footer.push({ text: "✕ Cancel Bill", class: "danger", onClick: () => cancelBill(i), close: false });
    }
    footer.push({ text: "⬇ Download PDF", onClick: () => { App.invoices.downloadPDF(i); return false; } });
    footer.push({ text: "🖨 Print", class: "primary", onClick: () => { App.invoices.print(i); return false; } });
    App.modal.open({ title: "Invoice " + i.number, size: "wide", body, footer });
  }

  function recordPayment(i) {
    const bal = F.round2((i.totals?.grandTotal || 0) - (i.paid || 0));
    const inp = el("input", { type: "number", value: bal, step: "any", style: { width: "100%" } });
    App.modal.open({ title: "Record Payment · " + i.number, size: "narrow",
      body: el("div", [el("p.muted", { style: { marginBottom: "10px", fontSize: "13px" } }, "Balance due: " + F.money(bal)), el("div.field", [el("label", "Amount received"), inp])]),
      footer: [{ text: "Cancel", class: "ghost" }, { text: "Save", class: "primary", onClick: () => {
        const amt = Number(inp.value) || 0;
        App.store.upsert("invoices", { ...i, paid: F.round2((i.paid || 0) + amt) });
        App.toast.success("Payment recorded");
        App.ui.refresh("history"); App.ui.navigate("history");
      } }] });
  }

  function cancelBill(i) {
    App.modal.confirm({ title: "Cancel Bill", message: `Cancel ${i.number}? Stock for its items will be restored. The record is kept (never deleted).`, confirmText: "Cancel Bill", danger: true }).then((ok) => {
      if (!ok) return;
      restoreStock(i);
      App.store.upsert("invoices", { ...i, status: "cancelled" });
      App.toast.warn(i.number + " cancelled");
      App.modal.close(); App.ui.refresh("history"); App.ui.navigate("history"); App.refreshLowStock();
    });
  }

  function returnBill(i) {
    App.modal.confirm({ title: "Return Bill", message: `Create a return for ${i.number}? A Credit Note is generated and stock is added back.`, confirmText: "Create Return" }).then((ok) => {
      if (!ok) return;
      restoreStock(i);
      const { number } = App.numbering.generateNumber("credit_note");
      const cn = { ...i, id: undefined, number, type: "credit_note", date: F.todayISO(), refInvoice: i.number, status: "active", paid: 0, note: "Return against " + i.number };
      App.store.upsert("invoices", cn);
      App.store.upsert("invoices", { ...i, status: "returned" });
      App.toast.success("Credit Note " + number + " created");
      App.modal.close(); App.ui.refresh("history"); App.ui.navigate("history"); App.refreshLowStock();
      App.invoices.preview(App.store.get("invoices", cn.id) || cn);
    });
  }

  function restoreStock(i) {
    if (!["retail", "gst", "challan"].includes(i.type)) return;
    (i.items || []).forEach((it) => {
      if (!it.productId) return;
      const p = App.store.get("products", it.productId);
      if (p) App.store.upsert("products", { ...p, stock: F.round2((Number(p.stock) || 0) + it.qty) });
    });
  }

  function duplicate(i) {
    App.modal.close();
    App.ui.navigate("pos");
    // Rebuild POS state from invoice
    const pos = App.modules.pos;
    if (pos && pos.setCustomer) {
      // simplest: inform user
      App.toast.info("Opened new bill. Re-add items to duplicate " + i.number + ".");
      if (i.customerId) pos.setCustomer(i.customerId);
    }
  }

  function exportCSV() {
    const rows = filtered().map(csvRow);
    download("bills_" + F.todayISO() + ".csv", App.csv.stringify(rows), "text/csv");
    App.toast.success("Exported " + rows.length + " bills");
  }

  App.modules.history = { render, openView };
})();
