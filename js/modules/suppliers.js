/* =========================================================================
   suppliers.js — supplier master: CRUD + purchase history + outstanding.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el, esc, download } = App.dom;
  const F = App.format;

  let q = "";
  const FIELDS = [
    ["name", "Supplier Name", "text", true], ["gstin", "GST Number", "text"], ["phone", "Phone", "text"],
    ["state", "State", "state"], ["address", "Address", "textarea"],
  ];

  function purchasesFor(id) { return App.store.all("purchases").filter((p) => p.supplierId === id); }
  function outstandingFor(id) {
    return F.round2(purchasesFor(id).filter((p) => p.status !== "cancelled").reduce((s, p) => s + F.round2((p.totals?.grandTotal || 0) - (p.paid || 0)), 0));
  }

  function filtered() {
    let rows = App.store.all("suppliers").slice();
    const s = q.toLowerCase();
    if (s) rows = rows.filter((c) => [c.name, c.phone, c.gstin, c.state].some((v) => String(v || "").toLowerCase().includes(s)));
    return rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }

  function render(container) {
    const wrap = el("div");
    wrap.appendChild(el("div.page-head", [
      el("div", [el("h2", "Suppliers"), el("div.sub", App.store.all("suppliers").length + " suppliers")]),
      el("div.actions", [
        el("button.btn", { html: "⬇ Export CSV", onClick: () => { download("suppliers_" + F.todayISO() + ".csv", App.csv.stringify(App.store.all("suppliers"), FIELDS.map((f) => f[0])), "text/csv"); App.toast.success("Exported"); } }),
        el("button.btn.primary", { html: "＋ Add Supplier", onClick: () => openEdit() }),
      ]),
    ]));
    const toolbar = el("div.toolbar");
    const sb = el("div.search-box", [el("span.ic", "🔍"), el("input", { placeholder: "Search suppliers…", value: q })]);
    sb.querySelector("input").addEventListener("input", App.dom.debounce((e) => { q = e.target.value; drawTable(host); }, 160));
    toolbar.appendChild(sb);
    wrap.appendChild(toolbar);
    const host = el("div"); wrap.appendChild(host);
    container.appendChild(wrap);
    drawTable(host);
  }

  function drawTable(host) {
    host.innerHTML = "";
    const rows = filtered();
    if (!rows.length) { host.appendChild(el("div.card.empty-state", [el("div.big", "🚚"), el("p", "No suppliers yet.")])); return; }
    const tw = el("div.table-wrap"); const tbl = el("table.data");
    tbl.innerHTML = `<thead><tr><th>Supplier</th><th>Phone</th><th>State</th><th>GSTIN</th><th class="num">Purchases</th><th class="num">Outstanding</th><th></th></tr></thead>`;
    const tb = el("tbody");
    rows.forEach((c) => {
      const ps = purchasesFor(c.id); const out = outstandingFor(c.id);
      const tr = el("tr");
      tr.innerHTML = `<td style="font-weight:600">${esc(c.name)}</td><td>${esc(c.phone || "—")}</td><td>${esc(c.state || "—")}</td>
        <td class="mono" style="font-size:12px">${esc(c.gstin || "—")}</td>
        <td class="num">${ps.length}</td>
        <td class="num mono">${out > 0.5 ? '<span class="badge-pill amber">' + F.money(out) + "</span>" : '<span class="muted">—</span>'}</td>`;
      const act = el("td"); const ra = el("div.row-actions");
      ra.appendChild(el("button.icon-btn", { title: "History", html: "🕘", style: { width: "30px", height: "30px" }, onClick: () => openView(c.id) }));
      ra.appendChild(el("button.icon-btn", { title: "Edit", html: "✎", style: { width: "30px", height: "30px" }, onClick: () => openEdit(c.id) }));
      ra.appendChild(el("button.icon-btn", { title: "Delete", html: "🗑", style: { width: "30px", height: "30px" }, onClick: () => remove(c.id) }));
      act.appendChild(ra); tr.appendChild(act); tb.appendChild(tr);
    });
    tbl.appendChild(tb); tw.appendChild(tbl); host.appendChild(tw);
  }

  function openEdit(id) {
    const c = id ? App.store.get("suppliers", id) : {};
    const form = el("div.form-grid"); const inputs = {};
    FIELDS.forEach(([key, label, type, req]) => {
      const field = el("div.field" + (type === "textarea" ? ".col-full" : ""));
      field.appendChild(el("label", { html: esc(label) + (req ? ' <span class="req">*</span>' : "") }));
      let input;
      if (type === "textarea") input = el("textarea");
      else if (type === "state") { input = el("select"); input.appendChild(el("option", { value: "" }, "Select state")); App.gst.STATES.forEach(([n]) => input.appendChild(el("option", { value: n, selected: c[key] === n }, n))); }
      else input = el("input", { type });
      if (type !== "state") input.value = c[key] != null ? c[key] : "";
      inputs[key] = input; field.appendChild(input); form.appendChild(field);
    });
    App.modal.open({ title: id ? "Edit Supplier" : "Add Supplier", body: form,
      footer: [{ text: "Cancel", class: "ghost" }, { text: id ? "Save" : "Add", class: "primary", onClick: () => {
        const rec = id ? { ...c } : {};
        FIELDS.forEach(([key]) => (rec[key] = inputs[key].value.trim()));
        if (!rec.name) { App.toast.error("Name is required"); return false; }
        App.store.upsert("suppliers", rec); App.toast.success((id ? "Updated " : "Added ") + rec.name);
        App.ui.refresh("suppliers"); App.ui.navigate("suppliers");
      } }] });
  }

  function remove(id) {
    const c = App.store.get("suppliers", id); if (!c) return;
    const removed = App.store.remove("suppliers", id);
    App.ui.refresh("suppliers"); App.ui.navigate("suppliers");
    App.toast.show({ type: "warn", title: "Supplier deleted", message: c.name, action: "Undo", onAction: () => { App.store.restore("suppliers", removed); App.ui.refresh("suppliers"); App.ui.navigate("suppliers"); } });
  }

  function openView(id) {
    const c = App.store.get("suppliers", id); if (!c) return;
    const ps = purchasesFor(id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const body = el("div");
    const total = ps.reduce((s, p) => s + (p.totals?.grandTotal || 0), 0);
    body.appendChild(el("div.card.pad", { style: { marginBottom: "16px" }, html: `<div class="card-title">${esc(c.name)}</div><div class="muted" style="font-size:13px;line-height:1.8">☎ ${esc(c.phone || "—")}<br>${esc(c.address || "")} ${esc(c.state || "")}<br>GSTIN: ${esc(c.gstin || "—")} · Total purchases: ${F.money(total)} · Outstanding: ${F.money(outstandingFor(id))}</div>` }));
    body.appendChild(el("div.card-title", "Purchase History"));
    if (!ps.length) body.appendChild(el("div.muted", "No purchases recorded."));
    else {
      const tw = el("div.table-wrap"); const tbl = el("table.data");
      tbl.innerHTML = `<thead><tr><th>Bill No</th><th>Date</th><th class="num">Amount</th><th class="num">Paid</th></tr></thead>`;
      const tb = el("tbody");
      ps.forEach((p) => { const tr = el("tr"); tr.innerHTML = `<td><b>${esc(p.number)}</b></td><td>${F.fmtDate(p.date)}</td><td class="num mono">${F.money(p.totals?.grandTotal || 0)}</td><td class="num mono">${F.money(p.paid || 0)}</td>`; tb.appendChild(tr); });
      tbl.appendChild(tb); tw.appendChild(tbl); body.appendChild(tw);
    }
    App.modal.open({ title: "Supplier · " + c.name, size: "wide", body, footer: [{ text: "Close", class: "ghost" }, { text: "Edit", class: "primary", onClick: () => openEdit(id) }] });
  }

  App.modules.suppliers = { render, openEdit, openView, outstandingFor };
})();
