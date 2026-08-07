/* =========================================================================
   sync.js — Cloudflare D1 delta-sync client.

   Every save queues the changed records in the store's outbox; this module
   pushes just those changes to the Worker's /api/sync, then pulls back anything
   newer than the device's last-seen revision (cursor). The server merges
   newest-wins with delete tombstones, so many devices billing at once never
   overwrite or lose each other's invoices.

   A background poll pulls periodically so other devices' changes appear without
   an edit here. Configured via Settings: workerUrl + syncToken + autoSync.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});

  function cfg() {
    const s = App.store.settings() || {};
    return { url: (s.workerUrl || "").replace(/\/$/, ""), token: s.syncToken || "", auto: !!s.autoSync };
  }
  function headers(token) {
    const h = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = "Bearer " + token;
    return h;
  }

  // ---- Status broadcasting for the top-bar cloud indicator ----
  let _status = "synced"; // synced | syncing | offline
  const _statusFns = new Set();
  function setStatus(s) { _status = s; _statusFns.forEach((fn) => { try { fn(s); } catch (e) {} }); }
  function onStatus(fn) { _statusFns.add(fn); try { fn(_status); } catch (e) {} return () => _statusFns.delete(fn); }

  // ---- Pull cursor (last server revision this device has merged) ----
  async function getCursor() { try { return (await App.db.kvGet("syncRev")) || 0; } catch (e) { return 0; } }
  async function setCursor(v) { try { await App.db.kvPut("syncRev", v); } catch (e) {} }

  let flushTimer = null, running = false, rerun = false, pollTimer = null;

  // Debounced sync — coalesces a burst of saves into one round trip.
  function schedule() {
    const { url, auto } = cfg();
    if (!url || !auto) return;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(runSync, 1200);
  }

  // One sync round: push the outbox, then pull everything newer than the cursor.
  async function runSync() {
    const { url, token, auto } = cfg();
    if (!url || !auto) return;
    if (running) { rerun = true; return; }        // a sync is in flight — run again after
    running = true; setStatus("syncing");
    const drained = App.store._drainOutbox();      // clears the outbox
    try {
      const since = await getCursor();
      const res = await fetch(url + "/api/sync", {
        method: "POST", headers: headers(token),
        body: JSON.stringify({ since, up: drained.up, del: drained.del }),
      });
      if (!res.ok) throw new Error("sync " + res.status);
      const data = await res.json();
      await App.store._applyRemote(data.changes || {});
      await setCursor(data.rev != null ? data.rev : since);
      setStatus("synced");
      running = false;
      if (data.more || rerun) { rerun = false; schedule(); }   // more pages, or edits arrived mid-sync
    } catch (e) {
      App.store._requeueOutbox(drained);            // nothing is lost — retry next round
      setStatus("offline");
      running = false;
      console.warn("sync failed", e && e.message);
    }
  }

  // Background pull so other devices' changes show up on their own.
  function startPolling(sec) {
    stopPolling();
    pollTimer = setInterval(() => {
      const { url, auto } = cfg();
      if (url && auto && navigator.onLine) schedule();
    }, (sec || 20) * 1000);
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  // One immediate sync round (used at startup).
  function pullDelta() { return runSync(); }

  // ---- Full snapshot (manual "Back up now" button + first-run seed) ----
  async function pushAll() {
    const { url, token } = cfg();
    if (!url) throw new Error("Worker URL not configured");
    const snapshot = App.store.exportAll();
    const res = await fetch(url + "/api/backup", { method: "PUT", headers: headers(token), body: JSON.stringify(snapshot) });
    if (!res.ok) throw new Error("Push failed: " + res.status);
    return res.json().catch(() => ({}));
  }
  async function pullAll() {
    const { url, token } = cfg();
    if (!url) throw new Error("Worker URL not configured");
    const res = await fetch(url + "/api/backup", { headers: headers(token) });
    if (!res.ok) throw new Error("Pull failed: " + res.status);
    return res.json();
  }
  async function test() {
    const { url, token } = cfg();
    if (!url) throw new Error("Worker URL not configured");
    const res = await fetch(url + "/api/health", { headers: headers(token) });
    if (!res.ok) throw new Error("Status " + res.status);
    return res.json().catch(() => ({ ok: true }));
  }

  // Back-compat: db.js used to call push(collection, data); now saves just
  // schedule a delta round via schedule(). Kept so any old caller still works.
  function push() { schedule(); }

  App.sync = { push, schedule, pushAll, pullAll, pullDelta, startPolling, stopPolling, test, cfg, onStatus, status: () => _status };
})();
