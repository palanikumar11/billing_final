/* =========================================================================
   db.js — IndexedDB persistence + in-memory reactive store.

   App.db     : low-level IndexedDB (async).
   App.store  : in-memory cache of every collection for fast synchronous reads,
                write-through to IndexedDB, autosave debounce, change events,
                and (optional) Cloudflare Worker sync hook.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});

  const DB_NAME = "retailpro_db";
  const DB_VERSION = 1;
  // Collections. 'settings' is a single-object store; the rest are arrays of records.
  const COLLECTIONS = ["products", "customers", "suppliers", "invoices", "purchases", "expenses", "stockMoves"];
  const STORES = ["kv", ...COLLECTIONS];

  let _db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        COLLECTIONS.forEach((c) => { if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: "id" }); });
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode = "readonly") {
    return _db.transaction(store, mode).objectStore(store);
  }
  function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

  const db = {
    open: openDB,
    getAll: (store) => reqP(tx(store).getAll()),
    get: (store, key) => reqP(tx(store).get(key)),
    put: (store, val, key) => reqP(tx(store, "readwrite").put(val, key)),
    bulkPut: (store, arr) => new Promise((res, rej) => {
      const t = _db.transaction(store, "readwrite");
      const os = t.objectStore(store);
      arr.forEach((v) => os.put(v));
      t.oncomplete = () => res(true); t.onerror = () => rej(t.error);
    }),
    del: (store, key) => reqP(tx(store, "readwrite").delete(key)),
    clear: (store) => reqP(tx(store, "readwrite").clear()),
    kvGet: (k) => reqP(tx("kv").get(k)),
    kvPut: (k, v) => reqP(tx("kv", "readwrite").put(v, k)),
  };
  App.db = db;

  /* ----------------------------------------------------------------------
     In-memory reactive store
     ---------------------------------------------------------------------- */
  const cache = { settings: null };
  COLLECTIONS.forEach((c) => (cache[c] = []));
  const listeners = {}; // event -> Set(fn)
  const dirty = new Set();
  let saveTimer = null;

  function on(evt, fn) { (listeners[evt] = listeners[evt] || new Set()).add(fn); return () => listeners[evt].delete(fn); }
  function emit(evt, payload) {
    (listeners[evt] || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } });
    if (evt !== "*") (listeners["*"] || []).forEach((fn) => { try { fn(evt, payload); } catch (e) {} });
  }

  async function load() {
    await openDB();
    cache.settings = (await db.kvGet("settings")) || null;
    for (const c of COLLECTIONS) cache[c] = (await db.getAll(c)) || [];
  }

  function scheduleSave(collection) {
    dirty.add(collection);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }
  async function flush() {
    const cols = [...dirty]; dirty.clear();
    for (const c of cols) {
      try {
        if (c === "settings") await db.kvPut("settings", cache.settings);
        else { await db.clear(c); if (cache[c].length) await db.bulkPut(c, cache[c]); }
        emit("saved", c);
        if (App.sync && App.sync.push) App.sync.push(c, c === "settings" ? cache.settings : cache[c]);
      } catch (e) { console.error("save failed", c, e); App.toast && App.toast.error("Autosave failed for " + c); }
    }
  }

  const store = {
    on, emit, load, flush,

    // Collections (return live array reference — treat as read-only for iteration)
    all: (c) => cache[c] || [],
    get: (c, id) => (cache[c] || []).find((r) => r.id === id),
    settings: () => cache.settings,

    // Upsert a record; assigns id + timestamps
    upsert(c, rec) {
      const now = App.format.nowTS();
      const arr = cache[c];
      if (!rec.id) {
        rec.id = App.dom.uid(c.slice(0, 3));
        rec.createdAt = now;
        rec.updatedAt = now;
        arr.push(rec);
      } else {
        rec.updatedAt = now;
        const i = arr.findIndex((r) => r.id === rec.id);
        if (i >= 0) arr[i] = { ...arr[i], ...rec };
        else { rec.createdAt = rec.createdAt || now; arr.push(rec); }
      }
      scheduleSave(c);
      emit("change:" + c, rec);
      return rec;
    },

    remove(c, id) {
      const arr = cache[c];
      const i = arr.findIndex((r) => r.id === id);
      if (i < 0) return null;
      const [removed] = arr.splice(i, 1);
      scheduleSave(c);
      emit("change:" + c, null);
      return removed;
    },

    // Re-insert a removed record (for Undo)
    restore(c, rec) {
      cache[c].push(rec);
      scheduleSave(c);
      emit("change:" + c, rec);
      return rec;
    },

    saveSettings(patch) {
      cache.settings = { ...(cache.settings || {}), ...patch, updatedAt: App.format.nowTS() };
      scheduleSave("settings");
      emit("change:settings", cache.settings);
      return cache.settings;
    },

    // Full export/import (backup)
    exportAll() {
      const out = { _meta: { app: "RetailPro", version: 1, exportedAt: App.format.nowTS() }, settings: cache.settings };
      COLLECTIONS.forEach((c) => (out[c] = cache[c]));
      return out;
    },
    async importAll(data, { merge = false } = {}) {
      if (data.settings) cache.settings = merge ? { ...cache.settings, ...data.settings } : data.settings;
      for (const c of COLLECTIONS) {
        if (!Array.isArray(data[c])) continue;
        if (merge) {
          const byId = new Map(cache[c].map((r) => [r.id, r]));
          data[c].forEach((r) => byId.set(r.id, r));
          cache[c] = [...byId.values()];
        } else cache[c] = data[c];
      }
      dirty.add("settings"); COLLECTIONS.forEach((c) => dirty.add(c));
      await flush();
      emit("imported");
      COLLECTIONS.forEach((c) => emit("change:" + c));
    },
    COLLECTIONS,
  };

  App.store = store;
})();
