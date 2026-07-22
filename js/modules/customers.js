/* =========================================================================
   customers.js — customer master: CRUD + purchase/payment/invoice history.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el, esc, download } = App.dom;
  const F = App.format;

  let q = "";
  const FIELDS = [
    ["name", "Customer Name", "text", true], ["mobile", "Mobile Number", "text"], ["email", "Email", "text"],
    ["gstin", "GST Number", "text"], ["pan", "PAN (optional)", "text"],
    ["city", "City / Place", "text"], ["state", "State", "state"], ["pin", "PIN Code", "text"],
    ["creditLimit", "Credit Limit", "number"], ["address", "Address", "textarea"],
  ];

  function outstandingFor(custId) {
    let out = 0;
    App.store.all("invoices").forEach((inv) => {
      if (inv.customerId === custId && ["retail", "gst"].includes(inv.type) && inv.status !== "cancelled") {
        out += F.round2((inv.totals?.grandTotal || 0) - (inv.paid || 0));
      }
    });
    return F.round2(out);
  }

  function filtered() {
    let rows = App.store.all("customers").slice();
    const s = q.toLowerCase();
    if (s) rows = rows.filter((c) => [c.name, c.mobile, c.email, c.gstin, c.state].some((v) => String(v || "").toLowerCase().includes(s)));
    return rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }

  function render(container) {
    const wrap = el("div");
    wrap.appendChild(el("div.page-head", [
      el("div", [el("h2", "Customers"), el("div.sub", App.store.all("customers").length + " customers")]),
      el("div.actions", [
        el("button.btn", { html: "⬇ Export CSV", onClick: () => { download("customers_" + F.todayISO() + ".csv", App.csv.stringify(App.store.all("customers"), FIELDS.map((f) => f[0]).concat("outstanding")), "text/csv"); App.toast.success("Exported"); } }),
        el("button.btn.primary", { html: "＋ Add Customer", onClick: () => openEdit() }),
      ]),
    ]));
    const toolbar = el("div.toolbar");
    const sb = el("div.search-box", [el("span.ic", "🔍"), el("input", { placeholder: "Search customers…", value: q })]);
    sb.querySelector("input").addEventListener("input", App.dom.debounce((e) => { q = e.target.value; drawTable(host); }, 160));
    toolbar.appendChild(sb);
    wrap.appendChild(toolbar);
    const host = el("div");
    wrap.appendChild(host);
    container.appendChild(wrap);
    drawTable(host);
  }

  function drawTable(host) {
    host.innerHTML = "";
    const rows = filtered();
    if (!rows.length) { host.appendChild(el("div.card.empty-state", [el("div.big", "👥"), el("p", "No customers yet.")])); return; }
    const tw = el("div.table-wrap");
    const tbl = el("table.data");
    tbl.innerHTML = `<thead><tr><th>Customer</th><th>Contact</th><th>State</th><th>GSTIN</th><th class="num">Outstanding</th><th></th></tr></thead>`;
    const tb = el("tbody");
    rows.forEach((c) => {
      const out = outstandingFor(c.id);
      const tr = el("tr");
      tr.innerHTML = `
        <td style="cursor:pointer"><div style="font-weight:600">${esc(c.name)}</div><div class="muted" style="font-size:11px">${esc(c.email || "")}</div></td>
        <td>${esc(c.mobile || "—")}</td>
        <td>${esc(c.state || "—")}</td>
        <td class="mono" style="font-size:12px">${esc(c.gstin || "—")}</td>
        <td class="num mono">${out > 0.5 ? '<span class="badge-pill amber">' + F.money(out) + "</span>" : '<span class="muted">—</span>'}</td>`;
      tr.querySelector("td").addEventListener("click", () => openView(c.id));
      const act = el("td");
      const ra = el("div.row-actions");
      ra.appendChild(el("button.icon-btn", { title: "History", html: "🕘", style: { width: "30px", height: "30px" }, onClick: () => openView(c.id) }));
      ra.appendChild(el("button.icon-btn", { title: "Edit", html: "✎", style: { width: "30px", height: "30px" }, onClick: () => openEdit(c.id) }));
      ra.appendChild(el("button.icon-btn", { title: "Delete", html: "🗑", style: { width: "30px", height: "30px" }, onClick: () => remove(c.id) }));
      act.appendChild(ra); tr.appendChild(act);
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); tw.appendChild(tbl); host.appendChild(tw);
  }

  function openEdit(id) {
    const c = id ? App.store.get("customers", id) : {};
    const form = el("div.form-grid");
    const inputs = {};
    FIELDS.forEach(([key, label, type, req]) => {
      const field = el("div.field" + (type === "textarea" ? ".col-full" : ""));
      field.appendChild(el("label", { html: esc(label) + (req ? ' <span class="req">*</span>' : "") }));
      let input;
      if (type === "textarea") input = el("textarea");
      else if (type === "state") { input = el("select"); input.appendChild(el("option", { value: "" }, "Select state")); App.gst.STATES.forEach(([n]) => input.appendChild(el("option", { value: n, selected: c[key] === n }, n))); }
      else input = el("input", { type });
      if (type !== "state") input.value = c[key] != null ? c[key] : "";
      inputs[key] = input; field.appendChild(input);
      if (key === "gstin") field.appendChild(el("div.hint", "State is auto-detected for GST (CGST+SGST if Tamil Nadu, else IGST)."));
      form.appendChild(field);
    });
    App.modal.open({
      title: id ? "Edit Customer" : "Add Customer", body: form,
      footer: [{ text: "Cancel", class: "ghost" }, { text: id ? "Save" : "Add", class: "primary", onClick: () => {
        const rec = id ? { ...c } : {};
        FIELDS.forEach(([key, , type]) => { rec[key] = type === "number" ? Number(inputs[key].value) || 0 : inputs[key].value.trim(); });
        if (!rec.name) { App.toast.error("Name is required"); return false; }
        App.store.upsert("customers", rec);
        App.toast.success((id ? "Updated " : "Added ") + rec.name);
        App.ui.refresh("customers"); App.ui.navigate("customers");
      } }],
    });
  }

  function remove(id) {
    const c = App.store.get("customers", id); if (!c) return;
    const removed = App.store.remove("customers", id);
    App.ui.refresh("customers"); App.ui.navigate("customers");
    App.toast.show({ type: "warn", title: "Customer deleted", message: c.name, action: "Undo", onAction: () => { App.store.restore("customers", removed); App.ui.refresh("customers"); App.ui.navigate("customers"); } });
  }

  function openView(id) {
    const c = App.store.get("customers", id); if (!c) return;
    const invs = App.store.all("invoices").filter((i) => i.customerId === id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const totalBiz = invs.reduce((s, i) => s + (i.totals?.grandTotal || 0), 0);
    const out = outstandingFor(id);
    const body = el("div");
    body.appendChild(el("div.stat-grid", { style: { gridTemplateColumns: "repeat(3,1fr)", marginBottom: "16px" } }, [
      el("div.stat", [el("div.stat-label", "Total Business"), el("div.stat-value", F.compact(totalBiz))]),
      el("div.stat", [el("div.stat-label", "Invoices"), el("div.stat-value", String(invs.length))]),
      el("div.stat", [el("div.stat-label", "Outstanding"), el("div.stat-value", F.compact(out))]),
    ]));
    const info = el("div.card.pad", { style: { marginBottom: "16px" } });
    info.innerHTML = `<div class="card-title">${esc(c.name)}</div>
      <div class="muted" style="font-size:13px;line-height:1.8">
      ☎ ${esc(c.mobile || "—")} · ✉ ${esc(c.email || "—")}<br>
      ${esc(c.address || "")} ${esc(c.state || "")} ${esc(c.pin || "")}<br>
      GSTIN: ${esc(c.gstin || "—")} · PAN: ${esc(c.pan || "—")} · Credit Limit: ${F.money(c.creditLimit)}</div>`;
    body.appendChild(info);
    body.appendChild(el("div.card-title", "Invoice History"));
    if (!invs.length) body.appendChild(el("div.muted", "No invoices yet."));
    else {
      const tw = el("div.table-wrap"); const tbl = el("table.data");
      tbl.innerHTML = `<thead><tr><th>Invoice</th><th>Date</th><th>Type</th><th class="num">Amount</th><th class="num">Paid</th><th>Status</th></tr></thead>`;
      const tb = el("tbody");
      invs.forEach((i) => {
        const bal = F.round2((i.totals?.grandTotal || 0) - (i.paid || 0));
        const tr = el("tr", { style: { cursor: "pointer" }, onClick: () => { App.modal.close(); App.modules.history.openView(i.id); } });
        tr.innerHTML = `<td><b>${esc(i.number)}</b></td><td>${F.fmtDate(i.date)}</td><td>${esc(App.invoices.TITLES[i.type] || i.type)}</td>
          <td class="num mono">${F.money(i.totals?.grandTotal || 0)}</td><td class="num mono">${F.money(i.paid || 0)}</td>
          <td>${i.status === "cancelled" ? '<span class="badge-pill red">Cancelled</span>' : bal > 0.5 ? '<span class="badge-pill amber">Due</span>' : '<span class="badge-pill green">Paid</span>'}</td>`;
        tb.appendChild(tr);
      });
      tbl.appendChild(tb); tw.appendChild(tbl); body.appendChild(tw);
    }
    App.modal.open({ title: "Customer · " + c.name, size: "wide", body,
      footer: [
        { text: "Close", class: "ghost" },
        { text: "⬇ Statement (CSV)", onClick: () => { downloadStatement(c, invs); return false; } },
        { text: "＋ New Bill", class: "primary", onClick: () => { App.modal.close(); App.ui.navigate("pos"); App.modules.pos.setCustomer && App.modules.pos.setCustomer(id); } },
        { text: "Edit", onClick: () => openEdit(id) },
      ] });
  }

  function downloadStatement(c, invs) {
    const rows = invs.map((i) => ({
      invoice: i.number, date: i.date, type: i.type === "gst" ? "GST" : i.type === "retail" ? "Without-GST" : i.type,
      total: i.totals?.grandTotal || 0, paid: i.paid || 0, balance: F.round2((i.totals?.grandTotal || 0) - (i.paid || 0)), status: i.status || "active",
    }));
    download("statement_" + (c.name || "customer").replace(/[^\w]+/g, "_") + "_" + F.todayISO() + ".csv", App.csv.stringify(rows), "text/csv");
    App.toast.success("Statement downloaded");
  }

  App.modules.customers = { render, openEdit, openView, outstandingFor };
})();
