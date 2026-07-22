/* =========================================================================
   products.js — product master: CRUD, search, filters, duplicate,
   CSV/JSON import-export, stock adjustment.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el, esc, download, pickFile, readFileText } = App.dom;
  const F = App.format;

  let filter = { q: "", cat: "", stock: "" };

  const FIELDS = [
    ["name", "Product Name", "text", true], ["code", "Product Code", "text"], ["sku", "SKU", "text"],
    ["category", "Category", "text"], ["hsn", "HSN Code", "text"],
    ["gstRate", "GST %", "number"], ["unit", "Unit", "text"],
    ["purchasePrice", "Purchase Price", "number"], ["sellingPrice", "Selling Price", "number", true],
    ["mrp", "MRP", "number"], ["stock", "Current Stock", "number"], ["minStock", "Minimum Stock", "number"],
    ["description", "Description", "textarea"],
  ];

  function categories() {
    return [...new Set(App.store.all("products").map((p) => p.category).filter(Boolean))].sort();
  }

  function filtered() {
    let rows = App.store.all("products").slice();
    const q = filter.q.toLowerCase();
    if (q) rows = rows.filter((p) => [p.name, p.code, p.sku, p.hsn, p.category].some((v) => String(v || "").toLowerCase().includes(q)));
    if (filter.cat) rows = rows.filter((p) => p.category === filter.cat);
    if (filter.stock === "low") rows = rows.filter((p) => Number(p.stock) <= Number(p.minStock || 0) && Number(p.stock) > 0);
    if (filter.stock === "out") rows = rows.filter((p) => Number(p.stock) <= 0);
    return rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }

  function render(container) {
    const wrap = el("div");
    wrap.appendChild(el("div.page-head", [
      el("div", [el("h2", "Products"), el("div.sub", App.store.all("products").length + " products in catalogue")]),
      el("div.actions", [
        el("button.btn", { html: "⬆ Import", onClick: importMenu }),
        el("button.btn", { html: "⬇ Export", onClick: exportMenu }),
        el("button.btn.primary", { html: "＋ Add Product", onClick: () => openEdit() }),
      ]),
    ]));

    // Toolbar
    const toolbar = el("div.toolbar");
    const sb = el("div.search-box", [el("span.ic", "🔍"), el("input", { placeholder: "Search by name, code, SKU, HSN…", value: filter.q })]);
    sb.querySelector("input").addEventListener("input", App.dom.debounce((e) => { filter.q = e.target.value; redraw(); }, 160));
    toolbar.appendChild(sb);
    const catSel = el("select");
    catSel.appendChild(el("option", { value: "" }, "All Categories"));
    categories().forEach((c) => catSel.appendChild(el("option", { value: c, selected: filter.cat === c }, c)));
    catSel.addEventListener("change", (e) => { filter.cat = e.target.value; redraw(); });
    toolbar.appendChild(catSel);
    const stkSel = el("select");
    [["", "All Stock"], ["low", "Low Stock"], ["out", "Out of Stock"]].forEach(([v, l]) => stkSel.appendChild(el("option", { value: v, selected: filter.stock === v }, l)));
    stkSel.addEventListener("change", (e) => { filter.stock = e.target.value; redraw(); });
    toolbar.appendChild(stkSel);
    wrap.appendChild(toolbar);

    const tableHost = el("div#prodTableHost");
    wrap.appendChild(tableHost);
    container.appendChild(wrap);
    drawTable(tableHost);

    function redraw() { drawTable(tableHost); }
  }

  function drawTable(host) {
    host.innerHTML = "";
    const rows = filtered();
    if (!rows.length) {
      host.appendChild(el("div.card.empty-state", [el("div.big", "📦"), el("p", "No products found."), el("button.btn.primary", { html: "＋ Add your first product", style: { marginTop: "12px" }, onClick: () => openEdit() })]));
      return;
    }
    const tw = el("div.table-wrap");
    const tbl = el("table.data");
    tbl.innerHTML = `<thead><tr><th>Product</th><th>Category</th><th>HSN / GST</th><th class="num">Purchase</th><th class="num">Selling</th><th class="num">MRP</th><th class="num">Stock</th><th></th></tr></thead>`;
    const tb = el("tbody");
    rows.forEach((p) => {
      const lowCls = Number(p.stock) <= 0 ? "red" : Number(p.stock) <= Number(p.minStock || 0) ? "amber" : "green";
      const tr = el("tr");
      tr.innerHTML = `
        <td><div style="font-weight:600">${esc(p.name)}</div><div class="muted" style="font-size:11px">${esc(p.code || "")}${p.sku ? " · " + esc(p.sku) : ""}</div></td>
        <td>${p.category ? '<span class="chip">' + esc(p.category) + "</span>" : '<span class="muted">—</span>'}</td>
        <td>${esc(p.hsn || "—")} <span class="muted">· ${p.gstRate || 0}%</span></td>
        <td class="num mono">${F.money(p.purchasePrice)}</td>
        <td class="num mono">${F.money(p.sellingPrice)}</td>
        <td class="num mono muted">${F.money(p.mrp)}</td>
        <td class="num"><span class="badge-pill ${lowCls}">${F.num(p.stock, p.stock % 1 ? 2 : 0)} ${esc(p.unit || "")}</span></td>`;
      const act = el("td");
      const ra = el("div.row-actions");
      ra.appendChild(el("button.icon-btn", { title: "Stock adjust", html: "±", style: { width: "30px", height: "30px" }, onClick: () => adjustStock(p.id) }));
      ra.appendChild(el("button.icon-btn", { title: "Edit", html: "✎", style: { width: "30px", height: "30px" }, onClick: () => openEdit(p.id) }));
      ra.appendChild(el("button.icon-btn", { title: "Duplicate", html: "⧉", style: { width: "30px", height: "30px" }, onClick: () => duplicate(p.id) }));
      ra.appendChild(el("button.icon-btn", { title: "Delete", html: "🗑", style: { width: "30px", height: "30px" }, onClick: () => remove(p.id) }));
      act.appendChild(ra); tr.appendChild(act);
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); tw.appendChild(tbl); host.appendChild(tw);
    host.appendChild(el("div.muted", { style: { marginTop: "10px", fontSize: "12px" } }, rows.length + " products shown"));
  }

  function openEdit(id) {
    const p = id ? App.store.get("products", id) : {};
    const s = App.store.settings() || {};
    const form = el("div.form-grid");
    const inputs = {};
    FIELDS.forEach(([key, label, type, req]) => {
      const field = el("div.field" + (type === "textarea" ? ".col-full" : ""));
      field.appendChild(el("label", { html: esc(label) + (req ? ' <span class="req">*</span>' : "") }));
      let input;
      if (type === "textarea") input = el("textarea");
      else input = el("input", { type });
      input.value = p[key] != null ? p[key] : (key === "gstRate" ? s.defaultGstRate : key === "minStock" ? s.lowStockThresholdDefault : "");
      inputs[key] = input;
      field.appendChild(input);
      form.appendChild(field);
    });

    App.modal.open({
      title: id ? "Edit Product" : "Add Product",
      body: form,
      footer: [
        { text: "Cancel", class: "ghost" },
        { text: id ? "Save Changes" : "Add Product", class: "primary", onClick: () => {
          const rec = id ? { ...p } : {};
          FIELDS.forEach(([key, , type]) => { rec[key] = type === "number" ? (Number(inputs[key].value) || 0) : inputs[key].value.trim(); });
          if (!rec.name) { App.toast.error("Product name is required"); return false; }
          App.store.upsert("products", rec);
          App.toast.success((id ? "Updated " : "Added ") + rec.name);
          App.ui.refresh("products"); App.ui.navigate("products");
        } },
      ],
    });
  }

  function duplicate(id) {
    const p = App.store.get("products", id);
    if (!p) return;
    const copy = { ...p }; delete copy.id; delete copy.createdAt; delete copy.updatedAt;
    copy.name = p.name + " (Copy)"; copy.code = ""; copy.sku = "";
    App.store.upsert("products", copy);
    App.toast.success("Duplicated " + p.name);
    App.ui.refresh("products"); App.ui.navigate("products");
  }

  function remove(id) {
    const p = App.store.get("products", id);
    if (!p) return;
    const removed = App.store.remove("products", id);
    App.ui.refresh("products"); App.ui.navigate("products");
    App.toast.show({ type: "warn", title: "Product deleted", message: p.name, action: "Undo", onAction: () => { App.store.restore("products", removed); App.ui.refresh("products"); App.ui.navigate("products"); App.toast.success("Restored"); } });
  }

  function adjustStock(id) {
    const p = App.store.get("products", id);
    if (!p) return;
    const body = el("div");
    body.appendChild(el("p", { style: { marginBottom: "12px" } }, [document.createTextNode("Current stock: "), el("b", F.num(p.stock, 2) + " " + (p.unit || ""))]));
    const grid = el("div.form-grid");
    const typeSel = el("select");
    [["add", "Add (Stock In)"], ["remove", "Remove (Stock Out)"], ["set", "Set exact value"]].forEach(([v, l]) => typeSel.appendChild(el("option", { value: v }, l)));
    const qtyInp = el("input", { type: "number", value: "0", step: "any" });
    const reasonInp = el("input", { type: "text", placeholder: "e.g. Damage, Recount, Manual" });
    grid.appendChild(el("div.field", [el("label", "Adjustment"), typeSel]));
    grid.appendChild(el("div.field", [el("label", "Quantity"), qtyInp]));
    grid.appendChild(el("div.field.col-full", [el("label", "Reason / Note"), reasonInp]));
    body.appendChild(grid);
    App.modal.open({
      title: "Stock Adjustment · " + p.name, size: "narrow", body,
      footer: [{ text: "Cancel", class: "ghost" }, { text: "Apply", class: "primary", onClick: () => {
        const q = Number(qtyInp.value) || 0;
        let ns = Number(p.stock) || 0;
        if (typeSel.value === "add") ns += q; else if (typeSel.value === "remove") ns -= q; else ns = q;
        App.store.upsert("products", { ...p, stock: F.round2(ns) });
        App.store.upsert("stockMoves", { productId: p.id, productName: p.name, type: "adjust", qty: typeSel.value === "set" ? q - (Number(p.stock) || 0) : (typeSel.value === "remove" ? -q : q), balance: F.round2(ns), reason: reasonInp.value, date: F.todayISO() });
        App.toast.success("Stock updated to " + F.num(ns, 2));
        App.ui.refresh("products"); App.ui.navigate("products");
      } }],
    });
  }

  /* ---------- Import / Export ---------- */
  function exportMenu() {
    App.modal.open({ title: "Export Products", size: "narrow", body: el("div", { html: "<p class='muted' style='font-size:13px'>Choose a format to export all " + App.store.all("products").length + " products.</p>" }),
      footer: [
        { text: "⬇ Excel (.xlsx)", class: "primary", onClick: exportXLSX },
        { text: "CSV", onClick: exportCSV },
        { text: "JSON", onClick: exportJSON },
        { text: "Close", class: "ghost" },
      ] });
  }
  function exportCSV() {
    const cols = FIELDS.map((f) => f[0]);
    download("products_" + F.todayISO() + ".csv", App.csv.stringify(App.store.all("products"), cols), "text/csv");
    App.toast.success("Products exported to CSV");
  }
  function exportJSON() {
    download("products_" + F.todayISO() + ".json", JSON.stringify(App.store.all("products"), null, 2), "application/json");
    App.toast.success("Products exported to JSON");
  }
  function exportXLSX() {
    const cols = FIELDS.map((f) => f[0]);
    const blob = App.xlsx.fromObjects(App.store.all("products"), cols, "Products");
    download("products_" + F.todayISO() + ".xlsx", blob);
    App.toast.success("Products exported to Excel");
  }
  // A ready-to-fill Excel template with headers + two example rows.
  function downloadSample() {
    const cols = FIELDS.map((f) => f[0]);
    const example1 = { name: "Sparkler 10cm (1 Box)", code: "P2001", sku: "SKU2001", category: "Fireworks", hsn: "36041000", gstRate: 18, unit: "BOX", purchasePrice: 120, sellingPrice: 180, mrp: 200, stock: 50, minStock: 10, description: "Example row — replace with your product" };
    const example2 = { name: "Flower Pot (Big)", code: "P2002", sku: "SKU2002", category: "Fireworks", hsn: "36041000", gstRate: 18, unit: "PCS", purchasePrice: 15, sellingPrice: 25, mrp: 30, stock: 200, minStock: 25, description: "" };
    const blob = App.xlsx.fromObjects([example1, example2], cols, "Products Template");
    download("products_sample_template.xlsx", blob);
    App.toast.success("Sample Excel template downloaded");
  }
  function importMenu() {
    App.modal.open({ title: "Import Products", size: "narrow",
      body: el("div", { html: "<p class='muted' style='font-size:13px'>Bulk import products from a <b>CSV</b> or <b>JSON</b> file. Existing products with the same <b>code</b> are updated; others are added.</p><p class='muted' style='font-size:12px;margin-top:8px'>Download the sample below, fill it in Excel, then <b>Save As → CSV</b> and import. Columns: name, code, sku, category, hsn, gstRate, unit, purchasePrice, sellingPrice, mrp, stock, minStock, description.</p>" }),
      footer: [
        { text: "⬇ Sample Excel", onClick: () => { downloadSample(); return false; } },
        { text: "Choose CSV", class: "primary", onClick: () => doImport("csv") },
        { text: "Choose JSON", onClick: () => doImport("json") },
        { text: "Cancel", class: "ghost" },
      ] });
  }
  async function doImport(kind) {
    const file = await pickFile(kind === "csv" ? ".csv" : ".json");
    if (!file) return;
    try {
      const text = await readFileText(file);
      let records = kind === "csv" ? App.csv.parse(text) : JSON.parse(text);
      if (!Array.isArray(records)) records = records.products || [];
      const existing = App.store.all("products");
      let added = 0, updated = 0;
      records.forEach((r) => {
        const rec = {};
        FIELDS.forEach(([key, , type]) => { if (r[key] !== undefined && r[key] !== "") rec[key] = type === "number" ? Number(r[key]) || 0 : String(r[key]); });
        if (!rec.name) return;
        const match = existing.find((p) => rec.code && p.code === rec.code);
        // A file with no GST column would otherwise import every product at 0% —
        // and a 0% product silently produces a tax invoice with no tax on it.
        if (rec.gstRate === undefined && !(match && match.gstRate)) rec.gstRate = Number(App.store.settings().defaultGstRate) || 0;
        if (match) { App.store.upsert("products", { ...match, ...rec }); updated++; }
        else { App.store.upsert("products", rec); added++; }
      });
      App.modal.close();
      App.toast.success(`Import complete — ${added} added, ${updated} updated`);
      App.ui.refresh("products"); App.ui.navigate("products");
    } catch (e) { App.toast.error("Import failed: " + e.message); }
  }

  App.modules.products = { render, openEdit };
})();
