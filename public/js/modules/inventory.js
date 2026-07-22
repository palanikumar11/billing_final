/* =========================================================================
   inventory.js — stock overview, valuation, movement log, low/out alerts.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el, esc, download } = App.dom;
  const F = App.format;

  let tab = "stock", flt = "";

  function render(container) {
    const prods = App.store.all("products");
    const stockValue = prods.reduce((s, p) => s + (Number(p.stock) || 0) * (Number(p.purchasePrice) || 0), 0);
    const retailValue = prods.reduce((s, p) => s + (Number(p.stock) || 0) * (Number(p.sellingPrice) || 0), 0);
    const low = prods.filter((p) => Number(p.stock) <= Number(p.minStock || 0) && Number(p.stock) > 0).length;
    const out = prods.filter((p) => Number(p.stock) <= 0).length;

    const wrap = el("div");
    wrap.appendChild(el("div.page-head", [
      el("div", [el("h2", "Inventory"), el("div.sub", prods.length + " products tracked")]),
      el("div.actions", [el("button.btn", { html: "⬇ Export CSV", onClick: exportCSV })]),
    ]));

    const grid = el("div.stat-grid", { style: { marginBottom: "16px" } });
    grid.appendChild(el("div.stat", [el("div.stat-ic.tint-blue", "🏬"), el("div.stat-label", "Stock Value (cost)"), el("div.stat-value", F.compact(stockValue))]));
    grid.appendChild(el("div.stat", [el("div.stat-ic.tint-green", "🏷"), el("div.stat-label", "Retail Value"), el("div.stat-value", F.compact(retailValue))]));
    grid.appendChild(el("div.stat", [el("div.stat-ic.tint-amber", "⚠️"), el("div.stat-label", "Low Stock"), el("div.stat-value", String(low))]));
    grid.appendChild(el("div.stat", [el("div.stat-ic.tint-red", "⛔"), el("div.stat-label", "Out of Stock"), el("div.stat-value", String(out))]));
    wrap.appendChild(grid);

    const tabs = el("div.tabs");
    [["stock", "Stock Levels"], ["moves", "Stock Movement"]].forEach(([v, l]) => tabs.appendChild(el("div.tab" + (tab === v ? ".active" : ""), { text: l, onClick: () => { tab = v; App.ui.refresh("inventory"); App.ui.navigate("inventory"); } })));
    wrap.appendChild(tabs);

    const host = el("div"); wrap.appendChild(host);
    container.appendChild(wrap);
    tab === "stock" ? drawStock(host) : drawMoves(host);
  }

  function drawStock(host) {
    const toolbar = el("div.toolbar");
    const sb = el("div.search-box", [el("span.ic", "🔍"), el("input", { placeholder: "Search products…", value: flt })]);
    sb.querySelector("input").addEventListener("input", App.dom.debounce((e) => { flt = e.target.value; App.ui.refresh("inventory"); App.ui.navigate("inventory"); }, 200));
    toolbar.appendChild(sb);
    host.appendChild(toolbar);

    let rows = App.store.all("products").slice().sort((a, b) => (a.stock || 0) - (b.stock || 0));
    if (flt) rows = rows.filter((p) => [p.name, p.code, p.hsn].some((v) => String(v || "").toLowerCase().includes(flt.toLowerCase())));
    const tw = el("div.table-wrap"); const tbl = el("table.data");
    tbl.innerHTML = `<thead><tr><th>Product</th><th class="num">Stock</th><th class="num">Min</th><th class="num">Cost Value</th><th>Status</th><th></th></tr></thead>`;
    const tb = el("tbody");
    rows.forEach((p) => {
      const status = Number(p.stock) <= 0 ? '<span class="badge-pill red">Out of stock</span>' : Number(p.stock) <= Number(p.minStock || 0) ? '<span class="badge-pill amber">Low</span>' : '<span class="badge-pill green">OK</span>';
      const tr = el("tr");
      tr.innerHTML = `<td style="font-weight:600">${esc(p.name)}<div class="muted" style="font-size:11px">${esc(p.hsn || "")}</div></td>
        <td class="num">${F.num(p.stock, p.stock % 1 ? 2 : 0)} ${esc(p.unit || "")}</td><td class="num muted">${F.num(p.minStock, 0)}</td>
        <td class="num mono">${F.money((Number(p.stock) || 0) * (Number(p.purchasePrice) || 0))}</td><td>${status}</td>`;
      const act = el("td");
      act.appendChild(el("button.icon-btn", { title: "Adjust", html: "±", style: { width: "30px", height: "30px" }, onClick: () => App.modules.products.openEdit(p.id) }));
      tr.appendChild(act); tb.appendChild(tr);
    });
    tbl.appendChild(tb); tw.appendChild(tbl); host.appendChild(tw);
  }

  function drawMoves(host) {
    const moves = App.store.all("stockMoves").slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 300);
    if (!moves.length) { host.appendChild(el("div.card.empty-state", [el("div.big", "🔁"), el("p", "No stock movements yet.")])); return; }
    const tw = el("div.table-wrap"); const tbl = el("table.data");
    tbl.innerHTML = `<thead><tr><th>Date</th><th>Product</th><th>Type</th><th class="num">Qty</th><th class="num">Balance</th><th>Reference</th></tr></thead>`;
    const tb = el("tbody");
    const typeCls = { purchase: "green", sale: "blue", adjust: "amber" };
    moves.forEach((m) => {
      const tr = el("tr");
      tr.innerHTML = `<td>${F.fmtDate(m.date)}</td><td>${esc(m.productName || "")}</td>
        <td><span class="badge-pill ${typeCls[m.type] || "gray"}">${esc(m.type)}</span></td>
        <td class="num mono" style="color:${m.qty < 0 ? "var(--danger)" : "var(--success)"}">${m.qty > 0 ? "+" : ""}${F.num(m.qty, m.qty % 1 ? 2 : 0)}</td>
        <td class="num mono">${F.num(m.balance, m.balance % 1 ? 2 : 0)}</td><td class="muted">${esc(m.reason || "")}</td>`;
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); tw.appendChild(tbl); host.appendChild(tw);
  }

  function exportCSV() {
    const rows = App.store.all("products").map((p) => ({ name: p.name, hsn: p.hsn, stock: p.stock, minStock: p.minStock, unit: p.unit, purchasePrice: p.purchasePrice, costValue: F.round2((Number(p.stock) || 0) * (Number(p.purchasePrice) || 0)) }));
    download("inventory_" + F.todayISO() + ".csv", App.csv.stringify(rows), "text/csv");
    App.toast.success("Inventory exported");
  }

  App.modules.inventory = { render };
})();
