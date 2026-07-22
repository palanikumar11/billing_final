/* =========================================================================
   reports.js — sales, GST, product, customer, supplier, purchase, expense,
   profit, outstanding & inventory reports. Export CSV / JSON / PDF (print).
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el, esc, download } = App.dom;
  const F = App.format;

  const SALE_TYPES = ["retail", "gst"];
  const isSale = (i) => SALE_TYPES.includes(i.type) && i.status !== "cancelled";

  const REPORTS = [
    ["customers", "👥 Customer Report"],
    ["inventory", "🏬 Inventory Report"],
    ["gst", "🏦 GST Bills Report"],
    ["nongst", "🧾 Without-GST Report"],
  ];

  let cur = "customers";
  let range = { from: monthStart(), to: F.todayISO() };
  let lastReport = { title: "", columns: [], rows: [] };

  function monthStart() { const d = new Date(F.todayISO()); d.setDate(1); return d.toISOString().slice(0, 10); }
  function inRange(date) { return (!range.from || date >= range.from) && (!range.to || date <= range.to); }

  function render(container) {
    const wrap = el("div");
    wrap.appendChild(el("div.page-head", [el("div", [el("h2", "Reports"), el("div.sub", "Analyse sales, tax, stock and profit")])]));

    const layout = el("div.reports-layout");
    // left menu (horizontal scroller on mobile)
    const menu = el("div.card.reports-menu", { style: { padding: "8px", height: "fit-content" } });
    REPORTS.forEach(([v, l]) => {
      const it = el("div.report-item" + (cur === v ? ".active" : ""), { text: l });
      it.addEventListener("click", () => { cur = v; App.ui.refresh("reports"); App.ui.navigate("reports"); });
      menu.appendChild(it);
    });
    layout.appendChild(menu);

    // right panel
    const panel = el("div");
    const bar = el("div.toolbar");
    const fromI = el("input", { type: "date", value: range.from }); fromI.addEventListener("change", (e) => { range.from = e.target.value; App.ui.refresh("reports"); App.ui.navigate("reports"); });
    const toI = el("input", { type: "date", value: range.to }); toI.addEventListener("change", (e) => { range.to = e.target.value; App.ui.refresh("reports"); App.ui.navigate("reports"); });
    bar.appendChild(el("label", { class: "muted", style: { fontSize: "13px", fontWeight: 600 } }, "From")); bar.appendChild(fromI);
    bar.appendChild(el("label", { class: "muted", style: { fontSize: "13px", fontWeight: 600 } }, "To")); bar.appendChild(toI);
    bar.appendChild(el("div.grow"));
    bar.appendChild(el("button.btn.sm", { html: "⬇ CSV", onClick: () => exportCSV() }));
    bar.appendChild(el("button.btn.sm", { html: "⬇ JSON", onClick: () => exportJSON() }));
    bar.appendChild(el("button.btn.sm", { html: "🖨 PDF", onClick: () => printReport() }));
    panel.appendChild(bar);

    const out = el("div"); panel.appendChild(out);
    layout.appendChild(panel);
    wrap.appendChild(layout);
    container.appendChild(wrap);

    buildReport(out);
  }

  function tableFrom(columns, rows, opts = {}) {
    const tw = el("div.table-wrap"); const tbl = el("table.data");
    const head = el("thead"); const hr = el("tr");
    columns.forEach((c) => hr.appendChild(el("th" + (c.num ? ".num" : ""), c.label)));
    head.appendChild(hr); tbl.appendChild(head);
    const tb = el("tbody");
    rows.forEach((r) => { const tr = el("tr"); columns.forEach((c) => { const td = el("td" + (c.num ? ".num mono" : "")); td.innerHTML = c.render ? c.render(r) : esc(r[c.key] == null ? "" : String(r[c.key])); tr.appendChild(td); }); tb.appendChild(tr); });
    if (opts.totals) { const tr = el("tr", { style: { fontWeight: 800, background: "var(--surface-2)" } }); columns.forEach((c, i) => tr.appendChild(el("td" + (c.num ? ".num mono" : ""), i === 0 ? "TOTAL" : (opts.totals[c.key] != null ? F.money(opts.totals[c.key]) : "")))); tb.appendChild(tr); }
    tbl.appendChild(tb); tw.appendChild(tbl);
    return tw;
  }

  function money(v) { return F.money(v || 0); }

  function buildReport(out) {
    out.innerHTML = "";
    const invs = App.store.all("invoices").filter((i) => isSale(i) && inRange(i.date));
    let title = "", columns = [], rows = [], totals = null, extra = null;

    if (cur === "sales") {
      title = "Sales Summary";
      const map = {};
      invs.forEach((i) => { const k = i.date; (map[k] = map[k] || { date: k, bills: 0, taxable: 0, tax: 0, total: 0 }); map[k].bills++; map[k].taxable += i.totals?.taxable || 0; map[k].tax += i.totals?.totalTax || 0; map[k].total += i.totals?.grandTotal || 0; });
      rows = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
      columns = [{ key: "date", label: "Date", render: (r) => F.fmtDate(r.date) }, { key: "bills", label: "Bills", num: true }, { key: "taxable", label: "Taxable", num: true, render: (r) => money(r.taxable) }, { key: "tax", label: "GST", num: true, render: (r) => money(r.tax) }, { key: "total", label: "Total", num: true, render: (r) => money(r.total) }];
      totals = { taxable: sum(rows, "taxable"), tax: sum(rows, "tax"), total: sum(rows, "total") };
    } else if (cur === "gst") {
      title = "GST Bills Report";
      rows = invs.filter((i) => i.type === "gst").map((i) => ({ number: i.number, date: i.date, party: i.customerName, gstin: i.customerGstin, state: i.customerState, taxable: i.totals?.taxable || 0, cgst: i.totals?.cgst || 0, sgst: i.totals?.sgst || 0, igst: i.totals?.igst || 0, total: i.totals?.grandTotal || 0 }));
      columns = [{ key: "number", label: "Invoice" }, { key: "date", label: "Date", render: (r) => F.fmtDate(r.date) }, { key: "party", label: "Party" }, { key: "gstin", label: "GSTIN" }, { key: "taxable", label: "Taxable", num: true, render: (r) => money(r.taxable) }, { key: "cgst", label: "CGST", num: true, render: (r) => money(r.cgst) }, { key: "sgst", label: "SGST", num: true, render: (r) => money(r.sgst) }, { key: "igst", label: "IGST", num: true, render: (r) => money(r.igst) }, { key: "total", label: "Total", num: true, render: (r) => money(r.total) }];
      totals = { taxable: sum(rows, "taxable"), cgst: sum(rows, "cgst"), sgst: sum(rows, "sgst"), igst: sum(rows, "igst"), total: sum(rows, "total") };
    } else if (cur === "nongst") {
      title = "Without-GST Bills Report";
      rows = invs.filter((i) => i.type === "retail").map((i) => ({ number: i.number, date: i.date, party: i.customerName, mobile: i.customerMobile, total: i.totals?.grandTotal || 0, paid: i.paid || 0 }));
      columns = [{ key: "number", label: "Bill No" }, { key: "date", label: "Date", render: (r) => F.fmtDate(r.date) }, { key: "party", label: "Customer" }, { key: "mobile", label: "Mobile" }, { key: "total", label: "Amount", num: true, render: (r) => money(r.total) }, { key: "paid", label: "Paid", num: true, render: (r) => money(r.paid) }];
      totals = { total: sum(rows, "total"), paid: sum(rows, "paid") };
    } else if (cur === "products") {
      title = "Product Sales";
      const map = {};
      invs.forEach((i) => (i.items || []).forEach((it) => { const k = it.name; (map[k] = map[k] || { name: k, qty: 0, taxable: 0, total: 0 }); map[k].qty += Number(it.qty) || 0; map[k].taxable += it.taxable || 0; map[k].total += it.amount || 0; }));
      rows = Object.values(map).sort((a, b) => b.total - a.total);
      columns = [{ key: "name", label: "Product" }, { key: "qty", label: "Qty Sold", num: true, render: (r) => F.num(r.qty, r.qty % 1 ? 2 : 0) }, { key: "taxable", label: "Taxable", num: true, render: (r) => money(r.taxable) }, { key: "total", label: "Revenue", num: true, render: (r) => money(r.total) }];
      totals = { total: sum(rows, "total"), taxable: sum(rows, "taxable") };
    } else if (cur === "customers") {
      title = "Customer Report (GST vs Without-GST)";
      const map = {};
      invs.forEach((i) => {
        const k = i.customerName || "Walk-in";
        (map[k] = map[k] || { name: k, bills: 0, gst: 0, nongst: 0, total: 0, outstanding: 0 });
        map[k].bills++;
        const g = i.totals?.grandTotal || 0;
        if (i.type === "gst") map[k].gst += g; else map[k].nongst += g;
        map[k].total += g;
        map[k].outstanding += F.round2(g - (i.paid || 0));
      });
      rows = Object.values(map).sort((a, b) => b.total - a.total);
      columns = [
        { key: "name", label: "Customer" }, { key: "bills", label: "Bills", num: true },
        { key: "gst", label: "GST Sales", num: true, render: (r) => money(r.gst) },
        { key: "nongst", label: "Without-GST", num: true, render: (r) => money(r.nongst) },
        { key: "total", label: "Total", num: true, render: (r) => money(r.total) },
        { key: "outstanding", label: "Outstanding", num: true, render: (r) => money(r.outstanding) },
      ];
      totals = { gst: sum(rows, "gst"), nongst: sum(rows, "nongst"), total: sum(rows, "total"), outstanding: sum(rows, "outstanding") };
    } else if (cur === "suppliers") {
      title = "Supplier Report";
      const ps = App.store.all("purchases").filter((p) => p.status !== "cancelled" && inRange(p.date));
      const map = {};
      ps.forEach((p) => { const k = p.supplierName || "—"; (map[k] = map[k] || { name: k, bills: 0, total: 0, outstanding: 0 }); map[k].bills++; map[k].total += p.totals?.grandTotal || 0; map[k].outstanding += F.round2((p.totals?.grandTotal || 0) - (p.paid || 0)); });
      rows = Object.values(map).sort((a, b) => b.total - a.total);
      columns = [{ key: "name", label: "Supplier" }, { key: "bills", label: "Bills", num: true }, { key: "total", label: "Purchases", num: true, render: (r) => money(r.total) }, { key: "outstanding", label: "Outstanding", num: true, render: (r) => money(r.outstanding) }];
      totals = { total: sum(rows, "total"), outstanding: sum(rows, "outstanding") };
    } else if (cur === "purchases") {
      title = "Purchase Report";
      rows = App.store.all("purchases").filter((p) => p.status !== "cancelled" && inRange(p.date)).map((p) => ({ number: p.number, date: p.date, supplier: p.supplierName, taxable: p.totals?.taxable || 0, tax: p.totals?.totalTax || 0, total: p.totals?.grandTotal || 0 }));
      columns = [{ key: "number", label: "Bill" }, { key: "date", label: "Date", render: (r) => F.fmtDate(r.date) }, { key: "supplier", label: "Supplier" }, { key: "taxable", label: "Taxable", num: true, render: (r) => money(r.taxable) }, { key: "tax", label: "GST", num: true, render: (r) => money(r.tax) }, { key: "total", label: "Total", num: true, render: (r) => money(r.total) }];
      totals = { taxable: sum(rows, "taxable"), tax: sum(rows, "tax"), total: sum(rows, "total") };
    } else if (cur === "expenses") {
      title = "Expense Report";
      const exs = App.store.all("expenses").filter((e) => inRange(e.date));
      const map = {};
      exs.forEach((e) => { (map[e.category] = map[e.category] || { category: e.category, count: 0, amount: 0 }); map[e.category].count++; map[e.category].amount += Number(e.amount) || 0; });
      rows = Object.values(map).sort((a, b) => b.amount - a.amount);
      columns = [{ key: "category", label: "Category" }, { key: "count", label: "Entries", num: true }, { key: "amount", label: "Amount", num: true, render: (r) => money(r.amount) }];
      totals = { amount: sum(rows, "amount") };
    } else if (cur === "profit") {
      title = "Profit Report";
      let revenue = 0, cogs = 0;
      invs.forEach((i) => { revenue += i.totals?.taxable || 0; (i.items || []).forEach((it) => { const p = it.productId ? App.store.get("products", it.productId) : null; const cost = p ? Number(p.purchasePrice) || 0 : (it.price || 0) * 0.7; cogs += cost * (Number(it.qty) || 0); }); });
      const expenses = App.store.all("expenses").filter((e) => inRange(e.date)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const grossProfit = revenue - cogs;
      const netProfit = grossProfit - expenses;
      rows = [
        { k: "Revenue (taxable sales)", v: revenue }, { k: "Cost of Goods Sold (COGS)", v: -cogs },
        { k: "Gross Profit", v: grossProfit, bold: true }, { k: "Operating Expenses", v: -expenses },
        { k: "Net Profit", v: netProfit, bold: true },
      ];
      columns = [{ key: "k", label: "Metric", render: (r) => (r.bold ? "<b>" + esc(r.k) + "</b>" : esc(r.k)) }, { key: "v", label: "Amount", num: true, render: (r) => (r.bold ? "<b>" + money(r.v) + "</b>" : money(r.v)) }];
    } else if (cur === "outstanding") {
      title = "Outstanding Report";
      rows = App.store.all("invoices").filter((i) => isSale(i)).map((i) => ({ number: i.number, date: i.date, customer: i.customerName, total: i.totals?.grandTotal || 0, paid: i.paid || 0, balance: F.round2((i.totals?.grandTotal || 0) - (i.paid || 0)) })).filter((r) => r.balance > 0.5).sort((a, b) => b.balance - a.balance);
      columns = [{ key: "number", label: "Invoice" }, { key: "date", label: "Date", render: (r) => F.fmtDate(r.date) }, { key: "customer", label: "Customer" }, { key: "total", label: "Total", num: true, render: (r) => money(r.total) }, { key: "paid", label: "Paid", num: true, render: (r) => money(r.paid) }, { key: "balance", label: "Balance Due", num: true, render: (r) => money(r.balance) }];
      totals = { total: sum(rows, "total"), paid: sum(rows, "paid"), balance: sum(rows, "balance") };
    } else if (cur === "inventory") {
      title = "Inventory Report";
      rows = App.store.all("products").map((p) => ({ name: p.name, hsn: p.hsn, stock: p.stock, unit: p.unit, cost: (Number(p.stock) || 0) * (Number(p.purchasePrice) || 0), retail: (Number(p.stock) || 0) * (Number(p.sellingPrice) || 0) })).sort((a, b) => b.cost - a.cost);
      columns = [{ key: "name", label: "Product" }, { key: "hsn", label: "HSN" }, { key: "stock", label: "Stock", num: true, render: (r) => F.num(r.stock, r.stock % 1 ? 2 : 0) + " " + esc(r.unit || "") }, { key: "cost", label: "Cost Value", num: true, render: (r) => money(r.cost) }, { key: "retail", label: "Retail Value", num: true, render: (r) => money(r.retail) }];
      totals = { cost: sum(rows, "cost"), retail: sum(rows, "retail") };
    }

    lastReport = { title, columns, rows, totals };
    out.appendChild(el("div.card-title", { style: { margin: "8px 0" } }, title + " · " + F.fmtDate(range.from) + " → " + F.fmtDate(range.to)));
    if (!rows.length) { out.appendChild(el("div.card.empty-state", [el("div.big", "📊"), el("p", "No data for this report and date range.")])); return; }
    out.appendChild(tableFrom(columns, rows, { totals }));
  }

  function sum(rows, key) { return F.round2(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)); }

  function flatRows() {
    return lastReport.rows.map((r) => {
      const o = {};
      lastReport.columns.forEach((c) => { o[c.label] = r[c.key]; });
      return o;
    });
  }
  function exportCSV() { download("report_" + cur + "_" + F.todayISO() + ".csv", App.csv.stringify(flatRows()), "text/csv"); App.toast.success("Report exported"); }
  function exportJSON() { download("report_" + cur + "_" + F.todayISO() + ".json", JSON.stringify({ report: lastReport.title, range, rows: flatRows(), totals: lastReport.totals }, null, 2), "application/json"); App.toast.success("Report exported"); }

  function printReport() {
    const s = App.store.settings() || {};
    const root = document.getElementById("print-root");
    const page = el("div.a4", { style: { minHeight: "auto" } });
    const inner = el("div.doc-inner");
    inner.appendChild(el("div.inv-head", { style: { borderBottom: "2px solid #222", paddingBottom: "8px" } }, [el("div.co", [el("h1", s.businessName || ""), el("div.co-line", (s.address || "") + " " + (s.city || "") + " " + (s.state || ""))]), el("div.doc-title", [el("div.tt", "Report"), el("div.st", esc(lastReport.title))])]));
    inner.appendChild(el("div", { style: { fontSize: "10px", margin: "8px 0" } }, F.fmtDate(range.from) + " to " + F.fmtDate(range.to)));
    const t = el("table.inv-items");
    const th = el("thead"), hr = el("tr"); lastReport.columns.forEach((c) => hr.appendChild(el("th" + (c.num ? ".r" : ""), c.label))); th.appendChild(hr); t.appendChild(th);
    const tb = el("tbody");
    lastReport.rows.forEach((r) => { const tr = el("tr"); lastReport.columns.forEach((c) => { const td = el("td" + (c.num ? ".r" : "")); td.innerHTML = c.render ? c.render(r) : esc(String(r[c.key] == null ? "" : r[c.key])); tr.appendChild(td); }); tb.appendChild(tr); });
    t.appendChild(tb); inner.appendChild(t);
    page.appendChild(inner);
    root.innerHTML = ""; const vp = el("div.doc-viewport", { style: { background: "#fff", padding: 0 } }); vp.appendChild(page); root.appendChild(vp);
    setTimeout(() => window.print(), 120);
  }

  App.modules.reports = { render };
})();
