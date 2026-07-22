/* =========================================================================
   settings.js — business profile, invoice config, bank/UPI, branding assets
   (logo/signature/stamp/QR), footer & terms. Autosaves to store.settings.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el, esc, pickFile } = App.dom;

  let tab = "business";

  function field(key, label, type, s, opts = {}) {
    const f = el("div.field" + (type === "textarea" || opts.full ? ".col-full" : ""));
    f.appendChild(el("label", label));
    let input;
    if (type === "textarea") input = el("textarea", { rows: opts.rows || 3 });
    else if (type === "state") { input = el("select"); input.appendChild(el("option", { value: "" }, "Select state")); App.gst.STATES.forEach(([n]) => input.appendChild(el("option", { value: n, selected: s[key] === n }, n))); }
    else if (type === "checkbox") { input = el("input", { type: "checkbox" }); input.checked = !!s[key]; }
    else input = el("input", { type: type || "text" });
    if (type !== "state" && type !== "checkbox") input.value = s[key] != null ? s[key] : "";
    input.dataset.key = key;
    input.dataset.type = type || "text";
    f.appendChild(input);
    if (opts.hint) f.appendChild(el("div.hint", opts.hint));
    return f;
  }

  function assetSlot(key, label, s) {
    const wrap = el("div.field.col-full");
    wrap.appendChild(el("label", label));
    const box = el("div", { style: { display: "flex", gap: "12px", alignItems: "center" } });
    const preview = el("div", { style: { width: "90px", height: "90px", border: "1px dashed var(--border-strong)", borderRadius: "10px", display: "grid", placeItems: "center", background: "var(--surface-2)", overflow: "hidden" } });
    function refresh() {
      preview.innerHTML = "";
      if (s[key]) preview.appendChild(el("img", { src: s[key], style: { maxWidth: "88px", maxHeight: "88px", objectFit: "contain" } }));
      else preview.appendChild(el("span.muted", { style: { fontSize: "11px" } }, "No image"));
    }
    refresh();
    const btns = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } });
    btns.appendChild(el("button.btn.sm", { html: "⬆ Upload", onClick: async () => {
      const file = await pickFile("image/*"); if (!file) return;
      if (file.size > 1500000) { App.toast.warn("Large image — consider under 1.5 MB for fast PDFs."); }
      const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
      s[key] = dataUrl; App.store.saveSettings({ [key]: dataUrl }); refresh();
      App.refreshBranding(); App.toast.success(label + " updated");
    } }));
    btns.appendChild(el("button.btn.sm.ghost", { html: "✕ Remove", onClick: () => { s[key] = ""; App.store.saveSettings({ [key]: "" }); refresh(); App.refreshBranding(); } }));
    box.appendChild(preview); box.appendChild(btns);
    wrap.appendChild(box);
    return wrap;
  }

  function render(container) {
    const s = App.store.settings() || {};
    const wrap = el("div");
    wrap.appendChild(el("div.page-head", [el("div", [el("h2", "Settings"), el("div.sub", "Business profile, invoice configuration & branding")])]));

    const tabs = el("div.tabs");
    [["business", "Business"], ["invoice", "Invoice & GST"], ["bank", "Bank & UPI"], ["branding", "Logo & Signature"], ["text", "Footer & Terms"], ["security", "Security & Login"]].forEach(([v, l]) => {
      tabs.appendChild(el("div.tab" + (tab === v ? ".active" : ""), { text: l, onClick: () => { tab = v; App.ui.refresh("settings"); App.ui.navigate("settings"); } }));
    });
    wrap.appendChild(tabs);

    const card = el("div.card.pad");
    const grid = el("div.form-grid");
    const s2 = App.store.settings();

    if (tab === "business") {
      grid.appendChild(field("businessName", "Business Name (GST bills)", "text", s2, { full: true, hint: "Shown on GST Tax Invoices — e.g. …TRADERS" }));
      grid.appendChild(field("retailBusinessName", "Retail Name (non-GST bills)", "text", s2, { full: true, hint: "Shown on Retail/non-GST bills — e.g. …CRACKERS" }));
      grid.appendChild(field("contactPerson", "Contact Person", "text", s2));
      grid.appendChild(field("tagline", "Tagline", "text", s2));
      grid.appendChild(field("phone", "Phone", "text", s2));
      grid.appendChild(field("email", "Email", "text", s2));
      grid.appendChild(field("website", "Website", "text", s2));
      grid.appendChild(field("gstin", "GSTIN", "text", s2, { hint: "Your business GST number (shown on GST invoices)." }));
      grid.appendChild(field("pan", "PAN", "text", s2));
      grid.appendChild(field("address", "Address", "textarea", s2));
      grid.appendChild(field("city", "City", "text", s2));
      grid.appendChild(field("state", "State", "state", s2, { hint: "Home state — drives CGST+SGST vs IGST." }));
      grid.appendChild(field("pin", "PIN Code", "text", s2));
    } else if (tab === "invoice") {
      grid.appendChild(field("invoicePrefix", "Invoice Prefix", "text", s2));
      grid.appendChild(field("nextInvoiceNo", "Next Invoice Number", "number", s2));
      grid.appendChild(field("financialYear", "Financial Year", "text", s2, { hint: "e.g. 2026-27" }));
      grid.appendChild(field("estimatePrefix", "Estimate Prefix", "text", s2));
      grid.appendChild(field("quotePrefix", "Quotation Prefix", "text", s2));
      grid.appendChild(field("challanPrefix", "Delivery Challan Prefix", "text", s2));
      grid.appendChild(field("purchasePrefix", "Purchase Prefix", "text", s2));
      grid.appendChild(field("creditNotePrefix", "Credit Note Prefix", "text", s2));
      grid.appendChild(field("debitNotePrefix", "Debit Note Prefix", "text", s2));
      grid.appendChild(field("defaultGstRate", "Default GST %", "number", s2));
      grid.appendChild(field("lowStockThresholdDefault", "Default Low-Stock Level", "number", s2));
      const cb1 = field("priceIncludesTax", "Prices include tax by default", "checkbox", s2, { full: true });
      const cb2 = field("autoRoundOff", "Auto round-off totals", "checkbox", s2, { full: true });
      grid.appendChild(cb1); grid.appendChild(cb2);
    } else if (tab === "bank") {
      grid.appendChild(field("bankName", "Bank Name", "text", s2));
      grid.appendChild(field("bankAccountType", "Account Type", "text", s2, { hint: "e.g. Current Account / Savings" }));
      grid.appendChild(field("bankBranch", "Branch", "text", s2));
      grid.appendChild(field("bankAccount", "Account Number", "text", s2));
      grid.appendChild(field("bankIfsc", "IFSC Code", "text", s2));
      grid.appendChild(field("upiId", "UPI ID", "text", s2, { hint: "Shown on invoices for quick payment." }));
    } else if (tab === "branding") {
      grid.appendChild(assetSlot("logo", "Company Logo", s2));
      grid.appendChild(assetSlot("signature", "Authorised Signature", s2));
      grid.appendChild(assetSlot("stamp", "Company Stamp", s2));
      grid.appendChild(assetSlot("upiQr", "UPI QR Code", s2));
      grid.appendChild(el("div.field.col-full", { html: "<div class='hint'>Logo appears in every invoice header. On <b>Retail Bills</b> it also becomes the faint centered watermark. GST invoices show the logo in the header only (no watermark).</div>" }));
    } else if (tab === "text") {
      grid.appendChild(field("footerNote", "Retail Footer Note", "text", s2, { full: true }));
      grid.appendChild(field("terms", "Terms & Conditions", "textarea", s2, { full: true, rows: 4 }));
      grid.appendChild(field("declaration", "GST Declaration", "textarea", s2, { full: true, rows: 2 }));
    } else if (tab === "security") {
      renderSecurity(grid);
    }

    card.appendChild(grid);
    if (tab !== "branding" && tab !== "security") {
      card.appendChild(el("div", { style: { marginTop: "18px", display: "flex", gap: "8px" } }, [
        el("button.btn.primary", { html: "💾 Save Settings", onClick: () => saveFrom(grid) }),
        el("button.btn.ghost", { html: "Reset section", onClick: () => { App.ui.refresh("settings"); App.ui.navigate("settings"); } }),
      ]));
    }
    wrap.appendChild(card);
    container.appendChild(wrap);
  }

  function saveFrom(grid) {
    const patch = {};
    grid.querySelectorAll("[data-key]").forEach((inp) => {
      const k = inp.dataset.key, t = inp.dataset.type;
      patch[k] = t === "number" ? Number(inp.value) || 0 : t === "checkbox" ? inp.checked : inp.value;
    });
    App.store.saveSettings(patch);
    App.refreshBranding();
    App.toast.success("Settings saved");
  }

  function showRecovery(code) {
    App.modal.open({
      title: "🔑 Save Your Recovery Code", size: "narrow", closeable: false,
      body: el("div", { html:
        `<p style="font-size:13px;line-height:1.6">This is the <b>only</b> way to reset your password if you forget it. Write it down and keep it safe — it won't be shown again.</p>
         <div style="margin:14px 0;padding:14px;background:var(--surface-2);border:1px dashed var(--border-strong);border-radius:10px;text-align:center;font-family:var(--mono);font-size:18px;font-weight:700;letter-spacing:2px">${esc(code)}</div>` }),
      footer: [{ text: "Copy", onClick: () => { navigator.clipboard && navigator.clipboard.writeText(code); App.toast.success("Copied"); return false; } }, { text: "I've saved it", class: "primary" }],
    });
  }

  function renderSecurity(grid) {
    const configured = App.auth && App.auth.isConfigured();
    const s = App.store.settings() || {};
    const head = el("div.field.col-full");
    head.innerHTML = `<div class="card-title">${configured ? "🔒 App Lock is ON" : "🔓 App Lock is OFF"}</div>
      <div class="hint">${configured ? "A password is required to open the app. User: <b>" + esc(s.security.user || "Owner") + "</b>" : "Set a password to require login when the app opens. When off, the app opens directly (as originally designed)."}</div>`;
    grid.appendChild(head);

    if (!configured) {
      const user = el("input", { placeholder: "e.g. Owner", value: "Owner" });
      const p1 = el("input", { type: "password", placeholder: "Choose a password", autocomplete: "new-password" });
      const p2 = el("input", { type: "password", placeholder: "Confirm password", autocomplete: "new-password" });
      grid.appendChild(el("div.field", [el("label", "Login Name"), user]));
      grid.appendChild(el("div.field", [el("label", "Password"), p1]));
      grid.appendChild(el("div.field", [el("label", "Confirm Password"), p2]));
      grid.appendChild(el("div.field.col-full", [el("button.btn.primary", { html: "🔒 Enable Login", onClick: async () => {
        if ((p1.value || "").length < 4) return App.toast.error("Password must be at least 4 characters");
        if (p1.value !== p2.value) return App.toast.error("Passwords do not match");
        const code = await App.auth.setPassword(user.value.trim(), p1.value);
        App.addLockButton && App.addLockButton();
        App.toast.success("App lock enabled");
        showRecovery(code);
      } })]));
    } else {
      const cur = el("input", { type: "password", placeholder: "Current password", autocomplete: "current-password" });
      const np = el("input", { type: "password", placeholder: "New password", autocomplete: "new-password" });
      const np2 = el("input", { type: "password", placeholder: "Confirm new password", autocomplete: "new-password" });
      grid.appendChild(el("div.field", [el("label", "Current Password"), cur]));
      grid.appendChild(el("div.field", [el("label", "New Password"), np]));
      grid.appendChild(el("div.field", [el("label", "Confirm New Password"), np2]));
      grid.appendChild(el("div.field.col-full", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
        el("button.btn.primary", { html: "Change Password", onClick: async () => {
          if (!(await App.auth.verify(cur.value))) return App.toast.error("Current password is incorrect");
          if ((np.value || "").length < 4) return App.toast.error("New password too short");
          if (np.value !== np2.value) return App.toast.error("Passwords do not match");
          const code = await App.auth.setPassword(s.security.user, np.value);
          App.toast.success("Password changed"); showRecovery(code);
        } }),
        el("button.btn", { html: "🔒 Lock Now", onClick: () => App.auth.lock() }),
        el("button.btn.danger", { html: "Disable Login", onClick: async () => {
          const ok = await App.modal.confirm({ title: "Disable Login", message: "Remove the password so the app opens without login?", confirmText: "Disable", danger: true });
          if (!ok) return;
          if (!(await App.auth.verify(cur.value))) return App.toast.error("Enter your current password first, then click Disable");
          App.auth.disable(); App.toast.success("App lock disabled");
          const lb = document.getElementById("lockBtn"); if (lb) lb.remove();
          App.ui.refresh("settings"); App.ui.navigate("settings");
        } }),
      ]));
    }
  }

  App.modules.settings = { render };
})();
