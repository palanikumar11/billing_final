/* =========================================================================
   app.js — bootstrap, router, keyboard shortcuts, theme, global search.
   Loaded last: every module has already registered on App.modules.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { $, $$, el, esc, debounce } = App.dom;

  App.modules = App.modules || {};
  const ROUTES = ["dashboard","pos","history","products","customers","suppliers","purchases","inventory","expenses","reports","settings","backup"];
  const TITLES = {
    dashboard: "Dashboard", pos: "New Bill", history: "Bill History", products: "Products",
    customers: "Customers", suppliers: "Suppliers", purchases: "Purchases", inventory: "Inventory",
    expenses: "Expenses", reports: "Reports", settings: "Settings", backup: "Backup & Cloud Sync",
  };

  const rendered = {};
  let current = null;

  const ui = {
    navigate(route, opts = {}) {
      if (!ROUTES.includes(route)) route = "dashboard";
      current = route;
      $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === route));
      $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.route === route));
      $$(".mt-item[data-route]").forEach((n) => n.classList.toggle("active", n.dataset.route === route));
      $("#pageTitle").textContent = TITLES[route] || route;
      const container = $(`.view[data-view="${route}"]`);
      const mod = App.modules[route];
      if (mod) {
        if (!rendered[route] || opts.force) { container.innerHTML = ""; mod.render(container); rendered[route] = true; }
        if (mod.onShow) mod.onShow(container, opts);
      } else {
        container.innerHTML = `<div class="empty-state"><div class="big">🚧</div><p>Module “${esc(route)}” coming soon.</p></div>`;
      }
      if (location.hash.slice(1) !== route) history.replaceState(null, "", "#" + route);
      $(".view-wrap").scrollTop = 0;
    },
    // Force re-render a route (e.g. after data changes). Only re-renders if built before.
    refresh(route) { if (rendered[route]) { const c = $(`.view[data-view="${route}"]`); c.innerHTML = ""; App.modules[route].render(c); if (current === route) {} } },
    refreshCurrent() { if (current) this.refresh(current); },
    current: () => current,
  };
  App.ui = ui;

  /* ---------------- Theme ---------------- */
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    $("#themeBtn").textContent = t === "dark" ? "☀️" : "🌙";
  }
  function toggleTheme() {
    const t = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(t);
    App.store.saveSettings({ theme: t });
  }
  App.applyTheme = applyTheme;

  /* ---------------- Branding ---------------- */
  App.DEFAULT_LOGO = "assets/logo.png";
  App.refreshBranding = function () {
    const s = App.store.settings() || {};
    // Sidebar shows the trade name (…CRACKERS) — page branding only.
    // GST invoices still use the registered name (…TRADERS).
    $("#brandName").textContent = s.retailBusinessName || s.businessName || "RetailPro";
    const bl = $("#brandLogo");
    const src = s.logo || App.DEFAULT_LOGO;
    if (src) { bl.innerHTML = ""; bl.style.background = "#fff"; bl.appendChild(el("img", { src, style: { width: "100%", height: "100%", objectFit: "contain", borderRadius: "10px" } })); }
    else { bl.textContent = (s.businessName || "R").trim()[0].toUpperCase(); bl.style.background = ""; }
  };

  // Sidebar brand name follows the active bill type: GST -> registered name
  // (…TRADERS); Without-GST / Estimate -> trade name (…CRACKERS).
  App.setSidebarBrand = function (type) {
    const s = App.store.settings() || {};
    const name = type === "gst" ? s.businessName : (s.retailBusinessName || s.businessName);
    const bn = $("#brandName"); if (bn) bn.textContent = name || "RetailPro";
  };

  /* ---------------- Low stock badge ---------------- */
  App.refreshLowStock = function () {
    const low = App.store.all("products").filter((p) => Number(p.stock) <= Number(p.minStock || 0)).length;
    const b = $("#lowStockBadge");
    if (low > 0) { b.style.display = ""; b.textContent = low; } else b.style.display = "none";
  };

  /* ---------------- Mobile nav + lock ---------------- */
  function closeMobileNav() { document.body.classList.remove("nav-open"); }
  function addLockButton() {
    if ($("#lockBtn")) return;
    const btn = el("button.icon-btn#lockBtn", { title: "Lock app", html: "🔒", onClick: () => App.auth.lock() });
    $("#themeBtn").after(btn);
  }
  App.addLockButton = addLockButton;
  // Tap outside the drawer closes it on mobile
  document.addEventListener("click", (e) => {
    if (document.body.classList.contains("nav-open") && !e.target.closest(".sidebar") && !e.target.closest("#menuBtn")) closeMobileNav();
  });

  /* ---------------- Global search ---------------- */
  function globalSearch(q) {
    const box = $("#searchResults");
    q = q.trim().toLowerCase();
    if (!q) { box.classList.remove("open"); return; }
    const groups = [];
    const match = (arr, fields) => arr.filter((r) => fields.some((f) => String(r[f] || "").toLowerCase().includes(q))).slice(0, 5);

    const prods = match(App.store.all("products"), ["name", "code", "sku", "hsn"]);
    const custs = match(App.store.all("customers"), ["name", "mobile", "gstin", "email"]);
    const bills = match(App.store.all("invoices"), ["number", "customerName", "customerMobile", "customerGstin"]);
    const sups = match(App.store.all("suppliers"), ["name", "gstin", "phone"]);

    if (prods.length) groups.push(["Products", prods.map((p) => ({ icon: "📦", label: p.name, sub: `${App.format.money(p.sellingPrice)} · Stock ${p.stock}`, go: () => App.modules.products.openEdit(p.id) }))]);
    if (custs.length) groups.push(["Customers", custs.map((c) => ({ icon: "👥", label: c.name, sub: `${c.mobile || ""} ${c.state || ""}`, go: () => App.modules.customers.openEdit(c.id) }))]);
    if (bills.length) groups.push(["Bills", bills.map((b) => ({ icon: "📄", label: b.number, sub: `${b.customerName || "Walk-in"} · ${App.format.money(b.grandTotal)}`, go: () => App.modules.history.openView(b.id) }))]);
    if (sups.length) groups.push(["Suppliers", sups.map((s) => ({ icon: "🚚", label: s.name, sub: s.gstin || s.phone || "", go: () => App.modules.suppliers.openEdit(s.id) }))]);

    box.innerHTML = "";
    if (!groups.length) { box.innerHTML = `<div class="sr-item muted">No results for “${esc(q)}”</div>`; box.classList.add("open"); return; }
    groups.forEach(([name, items]) => {
      const g = el("div.sr-group");
      g.appendChild(el("div.sr-head", name));
      items.forEach((it) => {
        const row = el("div.sr-item", [el("span", it.icon), el("div", [el("div", { style: { fontWeight: 600 } }, it.label), el("div.muted", { style: { fontSize: "12px" } }, it.sub)])]);
        row.addEventListener("click", () => { box.classList.remove("open"); $("#globalSearch").value = ""; it.go(); });
        g.appendChild(row);
      });
      box.appendChild(g);
    });
    box.classList.add("open");
  }

  /* ---------------- Keyboard shortcuts ---------------- */
  function shortcuts(e) {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    // Ctrl/Cmd combos
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === "k") { e.preventDefault(); $("#globalSearch").focus(); return; }
      if (k === "d") { e.preventDefault(); toggleTheme(); return; }
      if (k === "b" && App.modules.pos && App.modules.pos.saveBill) { e.preventDefault(); App.ui.navigate("pos"); return; }
      if (k === "s" && App.ui.current() === "pos") { e.preventDefault(); App.modules.pos.saveBill && App.modules.pos.saveBill("print"); return; }
      return;
    }
    if (typing) { if (e.key === "Escape") document.activeElement.blur(); return; }
    // Function keys / single keys (only when not typing)
    if (e.key === "F2") { e.preventDefault(); App.ui.navigate("pos"); }
    else if (e.key === "F1") { e.preventDefault(); App.ui.navigate("dashboard"); }
    else if (e.key === "/") { e.preventDefault(); $("#globalSearch").focus(); }
  }

  /* ---------------- Boot ---------------- */
  // Pull the cloud backup on startup so data survives clearing/resetting the browser.
  // Empty local DB => cloud replaces it; existing local => merge (never lose local records).
  async function tryCloudRestore() {
    try {
      if (!App.sync || !App.sync.cfg) return;
      const c = App.sync.cfg();
      if (!c.url) return;
      const cloud = await App.sync.pullAll();
      if (!cloud || typeof cloud !== "object") return;
      const cols = ["invoices", "products", "customers", "suppliers", "purchases", "expenses", "stockMoves"];
      const cloudCount = cols.reduce((n, k) => n + (Array.isArray(cloud[k]) ? cloud[k].length : 0), 0);
      if (!cloudCount) return; // nothing in the cloud yet — keep local as-is
      const localCount = ["invoices", "products", "customers"].reduce((n, k) => n + App.store.all(k).length, 0);
      const merge = localCount > 0; // empty browser => cloud wins; otherwise merge
      await App.store.importAll(cloud, { merge });
      console.info("Cloud restore:", merge ? "merged" : "restored from cloud", "· " + cloudCount + " records");
    } catch (e) {
      console.warn("Cloud restore skipped (offline/unreachable):", e && e.message);
    }
  }

  async function boot() {
    try {
      await App.store.load();
      const firstRun = !App.store.settings();
      // Ensure default settings exist first so cloud sync (worker URL + token) is configured.
      if (firstRun) App.store.saveSettings(App.seed.defaultSettings());

      // Cloud restore — pull the permanent Cloudflare KV backup so DATA SURVIVES a
      // browser wipe / reset / cache-clear. On an empty (cleared) browser the cloud
      // is the source of truth; otherwise we merge so no local-only record is lost.
      // No-op when offline or when the cloud has nothing yet.
      await tryCloudRestore();

      // Seed demo catalogue only on a genuine first run with nothing in the cloud.
      if (firstRun && !App.store.all("products").length && !App.store.all("invoices").length) {
        App.seed.demoData(App.store);
      }
      if (firstRun) await App.store.flush();
      const s = App.store.settings();
      // Backfill settings keys added in newer app versions without touching
      // anything the user has already set (even to an empty string).
      const defs = App.seed.defaultSettings();
      const missing = {};
      Object.keys(defs).forEach((k) => { if (s[k] === undefined) missing[k] = defs[k]; });
      if (Object.keys(missing).length) App.store.saveSettings(missing);
      // One-time: round-off now starts OFF on a new bill. Runs once; re-enable any
      // time from Settings › Auto round-off totals, or tick it on the bill itself.
      if (!s.roundOffDefaultOff) App.store.saveSettings({ autoRoundOff: false, roundOffDefaultOff: true });
      applyTheme(s.theme || "light");
      App.refreshBranding();
      App.refreshLowStock();

      // Re-render current view when its data changes
      App.store.on("*", debounce((evt) => {
        if (typeof evt !== "string" || !evt.startsWith("change:")) return;
        App.refreshLowStock();
        const cur = App.ui.current();
        // dashboard/inventory/history depend on many collections — refresh if active
        if (["dashboard", "inventory", "history", "reports"].includes(cur)) App.ui.refresh(cur), App.ui.navigate(cur);
        if (evt === "change:settings") { App.refreshBranding(); }
      }, 300));

      // Optional app lock (login) — waits for unlock if a password is configured.
      // After a successful login we always land on the Home (Dashboard) page.
      let justLoggedIn = false;
      if (App.auth && App.auth.isConfigured()) { await App.auth.requireUnlock(); addLockButton(); justLoggedIn = true; }

      // Nav
      $$(".nav-item").forEach((n) => n.addEventListener("click", () => { ui.navigate(n.dataset.route); closeMobileNav(); }));
      $("#menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
      // Mobile bottom tab bar
      $$(".mt-item[data-route]").forEach((n) => n.addEventListener("click", () => { ui.navigate(n.dataset.route); closeMobileNav(); }));
      const mtMore = $("#mtMore"); if (mtMore) mtMore.addEventListener("click", (e) => { e.stopPropagation(); document.body.classList.toggle("nav-open"); });
      $("#themeBtn").addEventListener("click", toggleTheme);
      $("#quickBillBtn").addEventListener("click", () => ui.navigate("pos"));

      // Sidebar Logout — only meaningful when a password is set; locks & reloads to the login screen.
      const logoutEl = $("#sidebarLogout");
      if (logoutEl) {
        if (!(App.auth && App.auth.isConfigured())) logoutEl.style.display = "none";
        logoutEl.addEventListener("click", async () => {
          closeMobileNav();
          const ok = App.modal ? await App.modal.confirm({ title: "Logout", message: "Lock the app and return to the login screen?", confirmText: "Logout" }) : true;
          if (ok) App.auth.lock();
        });
      }

      // Cloud backup status indicator — reflects sync state; click to back up now.
      const syncEl = $("#syncStatus");
      if (syncEl) {
        const applySync = (state) => {
          const cls = state === "syncing" ? "syncing" : state === "offline" ? "offline" : "synced";
          const label = state === "syncing" ? "Syncing…" : state === "offline" ? "Offline" : "Synced";
          syncEl.className = "sync-status " + cls;
          const lbl = syncEl.querySelector(".lbl"); if (lbl) lbl.textContent = label;
          syncEl.title = state === "offline" ? "Cloud backup — offline, will retry. Click to try now." : "Cloud backup — click to back up now";
        };
        const scfg = (App.sync && App.sync.cfg) ? App.sync.cfg() : {};
        applySync(navigator.onLine && scfg.url ? "synced" : "offline");
        if (App.sync && App.sync.onStatus) App.sync.onStatus(applySync);
        window.addEventListener("online", () => applySync("synced"));
        window.addEventListener("offline", () => applySync("offline"));
        syncEl.addEventListener("click", async () => {
          if (!App.sync || !App.sync.pushAll) return;
          applySync("syncing");
          try { await App.sync.pushAll(); applySync("synced"); App.toast && App.toast.success("Backed up to cloud"); }
          catch (e) { applySync("offline"); App.toast && App.toast.error("Backup failed — check your connection"); }
        });
      }

      // Search
      const gs = $("#globalSearch");
      gs.addEventListener("input", debounce(() => globalSearch(gs.value), 160));
      gs.addEventListener("focus", () => gs.value && globalSearch(gs.value));
      document.addEventListener("click", (e) => { if (!e.target.closest(".global-search")) $("#searchResults").classList.remove("open"); });

      document.addEventListener("keydown", shortcuts);
      window.addEventListener("hashchange", () => ui.navigate(location.hash.slice(1)));

      // Initial route — after login always show Home (Dashboard); otherwise honour the URL hash.
      ui.navigate(justLoggedIn ? "dashboard" : (location.hash.slice(1) || "dashboard"));

      // Hide splash
      const sp = $("#splash");
      sp.style.opacity = "0";
      $("#app").style.display = "grid";
      setTimeout(() => sp.remove(), 400);
    } catch (err) {
      console.error("Boot failed", err);
      $("#splash").innerHTML = `<div class="s-inner"><div class="s-logo" style="background:#dc2626">!</div><p style="max-width:420px">Failed to start: ${esc(err.message)}<br><br>Try a modern browser (Chrome/Edge/Firefox). If opened from file://, IndexedDB may be blocked in private mode.</p></div>`;
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
