/* =========================================================================
   backup.js — full JSON backup/restore + Cloudflare Worker (KV) cloud sync.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el, esc, download, pickFile, readFileText } = App.dom;
  const F = App.format;

  // Byte length of a JSON-serialised value (UTF-8)
  function byteLen(v) { try { return new Blob([JSON.stringify(v)]).size; } catch (e) { return 0; } }
  function fmtBytes(b) {
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(2) + " MB";
    return (b / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }

  function render(container) {
    const s = App.store.settings() || {};
    const wrap = el("div");
    wrap.appendChild(el("div.page-head", [el("div", [el("h2", "Backup & Cloud Sync"), el("div.sub", "Your data is stored permanently in this browser and never auto-deleted.")])]));

    // Local backup
    const local = el("div.card.pad", { style: { marginBottom: "16px" } });
    local.appendChild(el("div.card-title", "💾 Local Backup"));
    const counts = App.store.COLLECTIONS.map((c) => `${App.store.all(c).length} ${c}`).join(" · ");
    local.appendChild(el("div.muted", { style: { fontSize: "13px", marginBottom: "12px" } }, counts));
    local.appendChild(el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
      el("button.btn.primary", { html: "⬇ Export Full Backup (JSON)", onClick: exportBackup }),
      el("button.btn", { html: "⬆ Import / Restore Backup", onClick: importBackup }),
    ]));
    wrap.appendChild(local);

    // Automatic local backup
    const auto = el("div.card.pad", { style: { marginBottom: "16px" } });
    auto.appendChild(el("div.card-title", "🗄️ Automatic Local Backup"));
    auto.appendChild(el("div.muted", { style: { fontSize: "13px", marginBottom: "12px" } },
      "Keeps a dated copy of ALL your data on this device, updated once a day automatically — so even a huge history is safe without relying only on the cloud."));
    const abCb = el("input", { type: "checkbox" }); abCb.checked = s.autoLocalBackup !== false;
    abCb.addEventListener("change", () => App.store.saveSettings({ autoLocalBackup: abCb.checked }));
    auto.appendChild(el("label", { style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" } },
      [abCb, document.createTextNode("Enable daily automatic local backup")]));
    const abStatus = el("div.muted", { style: { fontSize: "13px", marginBottom: "12px", minHeight: "18px" } }, "Checking…");
    auto.appendChild(abStatus);
    const abBtns = el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } });
    if (fsSupported()) {
      abBtns.appendChild(el("button.btn.primary", { html: "📁 Choose backup folder", onClick: async () => { await chooseBackupFolder(); App.ui.refresh("backup"); App.ui.navigate("backup"); } }));
    }
    abBtns.appendChild(el("button.btn", { html: "⬇ Back up now", onClick: async () => { await runAutoBackup({ force: true, silent: false, gesture: true }); App.ui.refresh("backup"); App.ui.navigate("backup"); } }));
    auto.appendChild(abBtns);
    wrap.appendChild(auto);
    // Fill the status line asynchronously (folder name, last backup, permission).
    (async () => {
      const last = await App.db.kvGet(AB_LAST);
      const handle = await getDirHandle();
      let line;
      if (!fsSupported()) line = "This browser saves the daily backup to your Downloads folder.";
      else if (!handle) line = "⚠ No backup folder chosen yet — click “Choose backup folder” to turn on silent daily backups.";
      else if (!(await permitted(handle, false))) line = "📁 Folder: " + handle.name + " — permission needs re-authorizing (click “Choose backup folder”).";
      else line = "📁 Saving to folder: " + handle.name;
      abStatus.textContent = line + (last ? "   ·   Last backup: " + last : "   ·   No backup yet");
    })();

    // Storage usage meter (reassures the data stays tiny vs Cloudflare's 1 GB free KV)
    const usage = el("div.card.pad", { style: { marginBottom: "16px" } });
    usage.appendChild(el("div.card-title", "📦 Storage Usage"));
    const sizes = App.store.COLLECTIONS.map((c) => ({ c, bytes: byteLen(App.store.all(c)) }));
    const settingsBytes = byteLen(App.store.settings());
    const totalBytes = sizes.reduce((s, x) => s + x.bytes, 0) + settingsBytes;
    const FREE = 1024 * 1024 * 1024; // 1 GB
    const pct = Math.max(0.2, (totalBytes / FREE) * 100);
    usage.appendChild(el("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" } }, [
      el("span", { html: "Total data: <b>" + fmtBytes(totalBytes) + "</b>" }),
      el("span.muted", "of 1 GB free KV (" + pct.toFixed(pct < 1 ? 3 : 1) + "%)"),
    ]));
    usage.appendChild(el("div.progress", [el("span", { style: { width: Math.min(100, pct) + "%" } })]));
    const rows = sizes.filter((x) => x.bytes > 0).sort((a, b) => b.bytes - a.bytes)
      .map((x) => `${x.c}: ${fmtBytes(x.bytes)}`).concat("settings/assets: " + fmtBytes(settingsBytes));
    usage.appendChild(el("div.muted", { style: { fontSize: "12px", marginTop: "10px", lineHeight: "1.7" } }, rows.join("  ·  ")));
    // warn if a large image is embedded in settings
    const s2 = App.store.settings() || {};
    const embedded = ["logo", "signature", "stamp", "upiQr"].filter((k) => typeof s2[k] === "string" && s2[k].startsWith("data:"));
    if (embedded.length && settingsBytes > 120000) {
      usage.appendChild(el("div", { style: { marginTop: "8px", fontSize: "12px", color: "var(--warning)" } },
        "⚠ Embedded images (" + embedded.join(", ") + ") add ~" + fmtBytes(settingsBytes) + ". Use small PNG/JPG (<150 KB) to keep syncs light."));
    }
    wrap.appendChild(usage);

    // Cloud sync
    const cloud = el("div.card.pad");
    cloud.appendChild(el("div.card-title", "☁️ Cloudflare Worker Sync (KV)"));
    cloud.appendChild(el("div.muted", { style: { fontSize: "13px", marginBottom: "12px" } }, "Deploy the Worker in /workers, then paste its URL + API token below to sync all data to Cloudflare Workers KV for permanent cloud backup."));
    const grid = el("div.form-grid");
    const urlInp = el("input", { value: s.workerUrl || "", placeholder: "https://retailpro-api.<you>.workers.dev" });
    const tokInp = el("input", { value: s.syncToken || "", placeholder: "API token (matches Worker secret)" });
    const autoCb = el("input", { type: "checkbox" }); autoCb.checked = !!s.autoSync;
    grid.appendChild(el("div.field.col-full", [el("label", "Worker URL"), urlInp]));
    grid.appendChild(el("div.field.col-full", [el("label", "Sync Token"), tokInp]));
    const autoField = el("div.field.col-full", [el("label", { style: { display: "flex", gap: "8px", alignItems: "center" } }, [autoCb, document.createTextNode("Auto-sync on every change")])]);
    grid.appendChild(autoField);
    cloud.appendChild(grid);
    const status = el("div.muted", { style: { fontSize: "13px", marginTop: "10px", minHeight: "20px" } });
    cloud.appendChild(el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" } }, [
      el("button.btn.primary", { html: "Save & Test", onClick: async () => {
        App.store.saveSettings({ workerUrl: urlInp.value.trim(), syncToken: tokInp.value.trim(), autoSync: autoCb.checked });
        status.textContent = "Testing…";
        try { await App.sync.test(); status.innerHTML = '<span style="color:var(--success)">✓ Connected to Worker.</span>'; App.toast.success("Worker connected"); }
        catch (e) { status.innerHTML = '<span style="color:var(--danger)">✕ ' + esc(e.message) + "</span>"; }
      } }),
      el("button.btn", { html: "⬆ Push all to Cloud", onClick: async () => { try { status.textContent = "Pushing…"; await App.sync.pushAll(); status.innerHTML = '<span style="color:var(--success)">✓ Pushed full backup to KV.</span>'; App.toast.success("Backup pushed to Cloudflare"); } catch (e) { status.innerHTML = '<span style="color:var(--danger)">✕ ' + esc(e.message) + "</span>"; App.toast.error(e.message); } } }),
      el("button.btn", { html: "⬇ Pull from Cloud", onClick: pullFromCloud }),
    ]));
    cloud.appendChild(status);
    wrap.appendChild(cloud);

    // Danger zone
    const danger = el("div.card.pad", { style: { marginTop: "16px", borderColor: "var(--danger)" } });
    danger.appendChild(el("div.card-title", { style: { color: "var(--danger)" } }, "⚠ Danger Zone"));
    danger.appendChild(el("div.muted", { style: { fontSize: "13px", marginBottom: "12px" } }, "Reset wipes ALL local data (kept only if you exported a backup first)."));
    danger.appendChild(el("button.btn.danger", { html: "Reset all local data", onClick: resetAll }));
    wrap.appendChild(danger);

    container.appendChild(wrap);
  }

  function exportBackup() {
    const data = App.store.exportAll();
    download("retailpro_backup_" + F.todayISO() + ".json", JSON.stringify(data, null, 2), "application/json");
    App.toast.success("Full backup downloaded");
  }

  /* ----------------------------------------------------------------------
     Automatic local backup — keeps a copy of all data ON THE DEVICE so a
     large database (tens of thousands of invoices) is never one wipe away
     from loss, independent of the cloud. Preferred path: the File System
     Access API writes a dated JSON into a folder you pick once, silently, on
     app open (at most once/day) and prunes to the last N days. Fallback (no
     API / no folder): a plain daily download to the Downloads folder.
     ---------------------------------------------------------------------- */
  const AB_DIR = "autoBackupDir";     // IndexedDB kv: FileSystemDirectoryHandle
  const AB_LAST = "autoBackupLast";   // last successful backup date (YYYY-MM-DD)
  const fsSupported = () => typeof window.showDirectoryPicker === "function";

  async function getDirHandle() { try { return await App.db.kvGet(AB_DIR); } catch (e) { return null; } }

  async function chooseBackupFolder() {
    if (!fsSupported()) { App.toast.error("This browser can't pick a folder — daily backups will download instead."); return null; }
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "retailpro-backup" });
      await App.db.kvPut(AB_DIR, handle);
      App.store.saveSettings({ autoLocalBackup: true });
      await runAutoBackup({ force: true, silent: false });
      return handle;
    } catch (e) { return null; } // user cancelled the picker
  }

  async function permitted(handle, prompt) {
    if (!handle || !handle.queryPermission) return false;
    const opts = { mode: "readwrite" };
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if (prompt && (await handle.requestPermission(opts)) === "granted") return true;
    return false;
  }

  async function writeFile(handle, name, text) {
    const fh = await handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(text); await w.close();
  }

  // Delete dated backups older than `keepDays` so the folder doesn't grow forever.
  async function pruneOld(handle, keepDays) {
    try {
      const cutoff = Date.now() - keepDays * 86400000;
      for await (const [name, entry] of handle.entries()) {
        const m = /^retailpro_backup_(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
        if (!m || entry.kind !== "file") continue;
        if (new Date(m[1] + "T00:00:00").getTime() < cutoff) { try { await handle.removeEntry(name); } catch (e) {} }
      }
    } catch (e) { /* iteration unsupported — skip pruning */ }
  }

  // gesture=true means this was triggered by a click (so we may prompt for the
  // folder permission); on silent boot runs we only write if permission is
  // already granted, never nagging the user with a permission popup at startup.
  async function runAutoBackup({ force = false, silent = true, gesture = false } = {}) {
    const s = App.store.settings() || {};
    if (!force && !s.autoLocalBackup) return { ok: false, reason: "disabled" };
    const today = F.todayISO();
    if (!force && (await App.db.kvGet(AB_LAST)) === today) return { ok: true, reason: "already-today" };

    const text = JSON.stringify(App.store.exportAll());
    const handle = await getDirHandle();
    try {
      if (handle && (await permitted(handle, gesture || force))) {
        await writeFile(handle, "retailpro_backup_" + today + ".json", text);
        await writeFile(handle, "retailpro_backup_latest.json", text);
        await pruneOld(handle, Number(s.autoBackupKeepDays) || 14);
      } else if (handle) {
        // Folder chosen but permission not granted without a prompt — don't nag on
        // boot; the Backup page will offer a "re-authorize" button.
        return { ok: false, reason: "needs-permission" };
      } else if (!fsSupported()) {
        download("retailpro_backup_" + today + ".json", text, "application/json"); // fallback
      } else {
        return { ok: false, reason: "no-folder" }; // FS supported but no folder picked yet
      }
      await App.db.kvPut(AB_LAST, today);
      if (!silent) App.toast.success("Local backup saved");
      return { ok: true };
    } catch (e) {
      console.warn("auto local backup failed", e);
      if (!silent) App.toast.error("Local backup failed: " + e.message);
      return { ok: false, reason: e.message };
    }
  }

  async function importBackup() {
    const file = await pickFile(".json"); if (!file) return;
    try {
      const data = JSON.parse(await readFileText(file));
      const ok = await App.modal.confirm({ title: "Restore Backup", message: "Replace ALL current data with this backup? Consider exporting a backup of current data first.", confirmText: "Restore", danger: true });
      if (!ok) return;
      await App.store.importAll(data, { merge: false });
      App.applyTheme((App.store.settings() || {}).theme || "light");
      App.refreshBranding(); App.refreshLowStock();
      App.toast.success("Backup restored");
      App.ui.refresh("backup"); App.ui.navigate("dashboard");
    } catch (e) { App.toast.error("Invalid backup file: " + e.message); }
  }

  async function pullFromCloud() {
    const ok = await App.modal.confirm({ title: "Pull from Cloud", message: "Overwrite local data with the cloud backup?", confirmText: "Pull & Replace", danger: true });
    if (!ok) return;
    try {
      const data = await App.sync.pullAll();
      await App.store.importAll(data, { merge: false });
      App.refreshBranding(); App.refreshLowStock();
      App.toast.success("Pulled from Cloudflare");
      App.ui.navigate("dashboard");
    } catch (e) { App.toast.error(e.message); }
  }

  async function resetAll() {
    const ok = await App.modal.confirm({ title: "Reset Everything", message: "This deletes ALL local data permanently. Type-safe: export a backup first. Continue?", confirmText: "Yes, reset", danger: true });
    if (!ok) return;
    await App.store.importAll({ settings: App.seed.defaultSettings(), products: [], customers: [], suppliers: [], invoices: [], purchases: [], expenses: [], stockMoves: [] }, { merge: false });
    App.refreshBranding(); App.refreshLowStock();
    App.toast.success("All data reset");
    App.ui.navigate("dashboard");
  }

  App.modules.backup = { render, runAutoBackup, chooseBackupFolder };
})();
