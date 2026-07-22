/* =========================================================================
   dashboard.js — KPIs, sales chart, top products, recent bills, alerts.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el, esc } = App.dom;
  const F = App.format;

  const SALE_TYPES = ["retail", "gst"];
  const isSale = (inv) => SALE_TYPES.includes(inv.type) && inv.status !== "cancelled";

  function metrics() {
    const invs = App.store.all("invoices");
    const today = F.todayISO(), mk = F.monthKey(), yk = F.yearKey();
    let todaySales = 0, monthSales = 0, yearSales = 0, gstCollected = 0, todayBills = 0, outstanding = 0, pendingCount = 0;
    const prodQty = {}; const prodAmt = {};
    invs.forEach((inv) => {
      if (!isSale(inv)) return;
      const g = inv.totals?.grandTotal || 0;
      if (inv.date === today) { todaySales += g; todayBills++; }
      if (F.monthKey(inv.date) === mk) monthSales += g;
      if (F.yearKey(inv.date) === yk) yearSales += g;
      gstCollected += inv.totals?.totalTax || 0;
      const bal = F.round2(g - (inv.paid || 0));
      if (bal > 0.5) { outstanding += bal; pendingCount++; }
      (inv.items || []).forEach((it) => {
        prodQty[it.name] = (prodQty[it.name] || 0) + (Number(it.qty) || 0);
        prodAmt[it.name] = (prodAmt[it.name] || 0) + (Number(it.amount) || 0);
      });
    });
    const totalBills = invs.filter(isSale).length;
    const top = Object.keys(prodQty).map((n) => ({ name: n, qty: prodQty[n], amt: prodAmt[n] })).sort((a, b) => b.qty - a.qty).slice(0, 5);
    return {
      todaySales, monthSales, yearSales, gstCollected, todayBills, totalBills, outstanding, pendingCount,
      customers: App.store.all("customers").length,
      products: App.store.all("products").length,
      suppliers: App.store.all("suppliers").length,
      top,
    };
  }

  // Last 7 days sales for the bar chart
  function last7() {
    const out = [];
    const base = new Date(F.todayISO());
    const map = {};
    App.store.all("invoices").forEach((inv) => { if (isSale(inv)) map[inv.date] = (map[inv.date] || 0) + (inv.totals?.grandTotal || 0); });
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base); d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      out.push({ label: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()], val: map[iso] || 0 });
    }
    return out;
  }

  function statTile(icon, tint, label, value, sub) {
    return el("div.stat", [
      el("div.stat-ic." + tint, icon),
      el("div.stat-label", label),
      el("div.stat-value", value),
      sub ? el("div.stat-sub", sub) : null,
    ]);
  }

  function render(container) {
    const m = metrics();
    const wrap = el("div");

    wrap.appendChild(el("div.page-head", [
      el("div", [el("h2", "Dashboard"), el("div.sub", "Welcome back — here's your business at a glance.")]),
      el("div.actions", [
        el("button.btn.primary", { html: "＋ New Bill", onClick: () => App.ui.navigate("pos") }),
        el("button.btn", { html: "📊 Reports", onClick: () => App.ui.navigate("reports") }),
      ]),
    ]));

    // Stat grid
    const grid = el("div.stat-grid");
    grid.appendChild(statTile("₹", "tint-green", "Today's Sales", F.compact(m.todaySales), m.todayBills + " bills today"));
    grid.appendChild(statTile("📅", "tint-blue", "This Month", F.compact(m.monthSales)));
    grid.appendChild(statTile("📈", "tint-violet", "This Year", F.compact(m.yearSales)));
    grid.appendChild(statTile("🧾", "tint-blue", "Total Bills", F.num(m.totalBills, 0)));
    grid.appendChild(statTile("⏳", "tint-amber", "Pending Payments", F.num(m.pendingCount, 0), "invoices unpaid"));
    grid.appendChild(statTile("💰", "tint-red", "Outstanding", F.compact(m.outstanding)));
    grid.appendChild(statTile("🏦", "tint-green", "GST Collected", F.compact(m.gstCollected)));
    grid.appendChild(statTile("👥", "tint-blue", "Customers", F.num(m.customers, 0)));
    grid.appendChild(statTile("📦", "tint-violet", "Products", F.num(m.products, 0)));
    grid.appendChild(statTile("🚚", "tint-amber", "Suppliers", F.num(m.suppliers, 0)));
    wrap.appendChild(grid);

    // Two-column: chart + top products
    const row = el("div.two-col", { style: { marginTop: "16px" } });

    // Sales chart
    const chartCard = el("div.card.pad");
    chartCard.appendChild(el("div.card-title", "Sales — Last 7 Days"));
    const data = last7();
    const max = Math.max(1, ...data.map((d) => d.val));
    const bars = el("div.bars");
    data.forEach((d) => {
      const col = el("div.bar-col");
      const bar = el("div.bar", { style: { height: (d.val / max * 100) + "%" }, dataset: { val: F.compact(d.val) } });
      col.appendChild(bar);
      col.appendChild(el("div.bar-label", d.label));
      bars.appendChild(col);
    });
    chartCard.appendChild(bars);
    row.appendChild(chartCard);

    // Top products
    const topCard = el("div.card.pad");
    topCard.appendChild(el("div.card-title", "🏆 Top Selling"));
    if (!m.top.length) topCard.appendChild(el("div.muted", { style: { fontSize: "13px" } }, "No sales yet."));
    m.top.forEach((p, i) => {
      const rowp = el("div", { style: { display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: "1px solid var(--border)" } });
      rowp.appendChild(el("div", { style: { width: "24px", height: "24px", borderRadius: "7px", background: "var(--brand-soft)", color: "var(--brand)", display: "grid", placeItems: "center", fontWeight: "700", fontSize: "12px" } }, String(i + 1)));
      rowp.appendChild(el("div", { style: { flex: "1" } }, [el("div", { style: { fontWeight: "600", fontSize: "13px" } }, p.name), el("div.muted", { style: { fontSize: "11.5px" } }, F.num(p.qty, 0) + " sold")]));
      rowp.appendChild(el("div.mono", { style: { fontWeight: "700", fontSize: "13px" } }, F.compact(p.amt)));
      topCard.appendChild(rowp);
    });
    row.appendChild(topCard);
    wrap.appendChild(row);

    // Recent bills + low stock
    const row2 = el("div.two-col", { style: { marginTop: "16px" } });

    const recentCard = el("div.card.pad");
    recentCard.appendChild(el("div.card-title", { html: "🧾 Recent Bills" }, ));
    const recent = App.store.all("invoices").filter(isSale).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);
    if (!recent.length) recentCard.appendChild(el("div.muted", { style: { fontSize: "13px" } }, "No bills yet. Create your first bill from the POS screen."));
    else {
      const tw = el("div.table-wrap", { style: { border: "none" } });
      const tbl = el("table.data");
      tbl.innerHTML = "<thead><tr><th>Invoice</th><th>Customer</th><th class='num'>Amount</th><th>Status</th></tr></thead>";
      const tb = el("tbody");
      recent.forEach((inv) => {
        const bal = F.round2((inv.totals?.grandTotal || 0) - (inv.paid || 0));
        const tr = el("tr", { style: { cursor: "pointer" }, onClick: () => App.modules.history.openView(inv.id) });
        tr.innerHTML = `<td><b>${esc(inv.number)}</b><br><span class="muted" style="font-size:11px">${F.fmtDate(inv.date)}</span></td>
          <td>${esc(inv.customerName || "Walk-in")}</td>
          <td class="num mono">${F.money(inv.totals?.grandTotal || 0)}</td>
          <td>${bal > 0.5 ? '<span class="badge-pill amber">Due ' + F.moneyPlain(bal) + '</span>' : '<span class="badge-pill green">Paid</span>'}</td>`;
        tb.appendChild(tr);
      });
      tbl.appendChild(tb); tw.appendChild(tbl); recentCard.appendChild(tw);
    }
    row2.appendChild(recentCard);

    const lowCard = el("div.card.pad");
    lowCard.appendChild(el("div.card-title", { html: "⚠️ Low Stock Alerts" }));
    const low = App.store.all("products").filter((p) => Number(p.stock) <= Number(p.minStock || 0)).sort((a, b) => a.stock - b.stock).slice(0, 8);
    if (!low.length) lowCard.appendChild(el("div.muted", { style: { fontSize: "13px" } }, "All products are well stocked. 🎉"));
    low.forEach((p) => {
      const r = el("div", { style: { display: "flex", alignItems: "center", gap: "10px", padding: "7px 0", borderBottom: "1px solid var(--border)" } });
      r.appendChild(el("div", { style: { flex: "1", fontSize: "13px", fontWeight: "600" } }, p.name));
      r.appendChild(el("span.badge-pill." + (p.stock <= 0 ? "red" : "amber"), (p.stock <= 0 ? "Out of stock" : p.stock + " left")));
      lowCard.appendChild(r);
    });
    if (low.length) lowCard.appendChild(el("button.btn.sm", { html: "Manage Inventory →", style: { marginTop: "12px" }, onClick: () => App.ui.navigate("inventory") }));
    row2.appendChild(lowCard);
    wrap.appendChild(row2);

    container.appendChild(wrap);
  }

  App.modules.dashboard = { render };
})();
