/* =========================================================================
   expenses.js — record business expenses by category, monthly summary.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el, esc, download } = App.dom;
  const F = App.format;

  const CATS = ["Rent", "Salary", "Electricity", "Fuel", "Transport", "Office Expenses", "Miscellaneous"];
  let month = F.monthKey();

  function render(container) {
    const wrap = el("div");
    wrap.appendChild(el("div.page-head", [
      el("div", [el("h2", "Expenses"), el("div.sub", "Track operating costs")]),
      el("div.actions", [el("button.btn", { html: "⬇ Export CSV", onClick: exportCSV }), el("button.btn.primary", { html: "＋ Add Expense", onClick: () => openEntry() })]),
    ]));

    // month filter + summary
    const bar = el("div.toolbar");
    const mInp = el("input", { type: "month", value: month });
    mInp.addEventListener("change", (e) => { month = e.target.value; App.ui.refresh("expenses"); App.ui.navigate("expenses"); });
    bar.appendChild(el("label", { style: { fontSize: "13px", fontWeight: 600 }, class: "muted" }, "Month:"));
    bar.appendChild(mInp);
    wrap.appendChild(bar);

    const rows = App.store.all("expenses").filter((e) => F.monthKey(e.date) === month).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const byCat = {}; let total = 0;
    rows.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + (Number(e.amount) || 0); total += Number(e.amount) || 0; });

    // summary tiles
    const grid = el("div.stat-grid", { style: { marginBottom: "16px" } });
    grid.appendChild(el("div.stat", [el("div.stat-ic.tint-red", "💸"), el("div.stat-label", "Total (month)"), el("div.stat-value", F.compact(total))]));
    Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 4).forEach(([c, v]) => grid.appendChild(el("div.stat", [el("div.stat-label", c), el("div.stat-value", F.compact(v))])));
    wrap.appendChild(grid);

    // table
    if (!rows.length) wrap.appendChild(el("div.card.empty-state", [el("div.big", "💸"), el("p", "No expenses this month.")]));
    else {
      const tw = el("div.table-wrap"); const tbl = el("table.data");
      tbl.innerHTML = `<thead><tr><th>Date</th><th>Category</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead>`;
      const tb = el("tbody");
      rows.forEach((e) => {
        const tr = el("tr");
        tr.innerHTML = `<td>${F.fmtDate(e.date)}</td><td><span class="chip">${esc(e.category)}</span></td><td>${esc(e.note || "")}</td><td class="num mono">${F.money(e.amount)}</td>`;
        const act = el("td"); const ra = el("div.row-actions");
        ra.appendChild(el("button.icon-btn", { html: "✎", style: { width: "30px", height: "30px" }, onClick: () => openEntry(e.id) }));
        ra.appendChild(el("button.icon-btn", { html: "🗑", style: { width: "30px", height: "30px" }, onClick: () => { const rm = App.store.remove("expenses", e.id); App.ui.refresh("expenses"); App.ui.navigate("expenses"); App.toast.show({ type: "warn", title: "Expense deleted", message: F.money(e.amount), action: "Undo", onAction: () => { App.store.restore("expenses", rm); App.ui.refresh("expenses"); App.ui.navigate("expenses"); } }); } }));
        act.appendChild(ra); tr.appendChild(act); tb.appendChild(tr);
      });
      tbl.appendChild(tb); tw.appendChild(tbl); wrap.appendChild(tw);
    }
    container.appendChild(wrap);
  }

  function openEntry(id) {
    const e = id ? App.store.get("expenses", id) : { date: F.todayISO(), category: "Rent" };
    const grid = el("div.form-grid");
    const dateI = el("input", { type: "date", value: e.date || F.todayISO() });
    const catSel = el("select"); CATS.forEach((c) => catSel.appendChild(el("option", { value: c, selected: e.category === c }, c)));
    const amtI = el("input", { type: "number", value: e.amount || "", step: "any" });
    const noteI = el("input", { value: e.note || "", placeholder: "Optional note" });
    grid.appendChild(el("div.field", [el("label", "Date"), dateI]));
    grid.appendChild(el("div.field", [el("label", "Category"), catSel]));
    grid.appendChild(el("div.field", [el("label", "Amount"), amtI]));
    grid.appendChild(el("div.field.col-full", [el("label", "Note"), noteI]));
    App.modal.open({ title: id ? "Edit Expense" : "Add Expense", body: grid, footer: [
      { text: "Cancel", class: "ghost" },
      { text: "Save", class: "primary", onClick: () => {
        const amt = Number(amtI.value) || 0;
        if (amt <= 0) { App.toast.error("Enter an amount"); return false; }
        App.store.upsert("expenses", { ...(id ? e : {}), date: dateI.value, category: catSel.value, amount: amt, note: noteI.value });
        App.toast.success("Expense saved");
        App.ui.refresh("expenses"); App.ui.navigate("expenses");
      } },
    ] });
  }

  function exportCSV() {
    download("expenses_" + F.todayISO() + ".csv", App.csv.stringify(App.store.all("expenses"), ["date", "category", "amount", "note"]), "text/csv");
    App.toast.success("Exported");
  }

  App.modules.expenses = { render };
})();
