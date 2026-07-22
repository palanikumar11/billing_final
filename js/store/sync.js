/* =========================================================================
   sync.js — Cloudflare Worker + KV sync client.
   Pushes each collection to the Worker; can pull a full snapshot and restore.
   Configured via Settings: workerUrl + syncToken. No-ops when unconfigured.
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

  let queue = Promise.resolve();
  let pending = {};
  let flushTimer = null;

  // ---- Status broadcasting for the top-bar cloud indicator ----
  let _status = "synced"; // synced | syncing | offline
  const _statusFns = new Set();
  function setStatus(s) { _status = s; _statusFns.forEach((fn) => { try { fn(s); } catch (e) {} }); }
  function onStatus(fn) { _statusFns.add(fn); try { fn(_status); } catch (e) {} return () => _statusFns.delete(fn); }

  // Debounced push of a collection (called by store on autosave).
  function push(collection, data) {
    const { url, auto } = cfg();
    if (!url || !auto) return;
    pending[collection] = data;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushPending, 1200);
  }

  function flushPending() {
    const { url, token } = cfg();
    if (!url) return;
    const items = pending; pending = {};
    setStatus("syncing");
    queue = queue.then(async () => {
      let ok = true;
      for (const key in items) {
        try {
          await fetch(url + "/api/collection/" + key, { method: "PUT", headers: headers(token), body: JSON.stringify(items[key]) });
        } catch (e) { ok = false; console.warn("sync push failed", key, e); }
      }
      setStatus(ok ? "synced" : "offline");
    });
  }

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

  App.sync = { push, pushAll, pullAll, test, cfg, onStatus, status: () => _status };
})();
