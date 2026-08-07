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

  // ---- Sync outbox: per-record changes waiting to be pushed to the cloud.
  // Upserts are tracked by id; deletes are tombstones (id -> updatedAt) so a
  // delete propagates to other devices instead of the record reappearing.
  const outUp = { settings: new Set() };
  const outDel = {};
  COLLECTIONS.forEach((c) => { outUp[c] = new Set(); outDel[c] = new Map(); });

  // Normalise a product name/code for duplicate detection: lower-cased, spaces
  // collapsed, and common "copy" decorations stripped so a duplicated or lightly
  // renamed product ("Sparkler", "Sparkler (Copy)", "Sparkler (2)", "Sparkler - copy")
  // all collapse to the same key. Kept conservative — size/spec digits that carry
  // meaning (e.g. "Sparkler 10cm") are preserved so distinct products never merge.
  function normName(v) {
    return String(v == null ? "" : v)
      .trim().toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\s*[-–]?\s*\(?\s*(?:copy|duplicate)\s*\d*\s*\)?\s*$/i, "")  // "(copy)", "- copy 2"
      .replace(/\s*\(\s*\d+\s*\)\s*$/i, "")                                   // trailing "(2)"
      .replace(/[.,\-–_]+$/g, "")                                             // trailing punctuation
      .trim();
  }

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
      } catch (e) { console.error("save failed", c, e); App.toast && App.toast.error("Autosave failed for " + c); }
    }
    // Push the queued per-record changes to the cloud (delta sync).
    if (App.sync && App.sync.schedule) App.sync.schedule();
  }

  const store = {
    on, emit, load, flush, normName,

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
      outUp[c].add(rec.id); outDel[c].delete(rec.id);
      scheduleSave(c);
      emit("change:" + c, rec);
      return rec;
    },

    remove(c, id) {
      const arr = cache[c];
      const i = arr.findIndex((r) => r.id === id);
      if (i < 0) return null;
      const [removed] = arr.splice(i, 1);
      outDel[c].set(id, App.format.nowTS()); outUp[c].delete(id);
      scheduleSave(c);
      emit("change:" + c, null);
      return removed;
    },

    // Re-insert a removed record (for Undo)
    restore(c, rec) {
      cache[c].push(rec);
      outUp[c].add(rec.id); outDel[c].delete(rec.id);
      scheduleSave(c);
      emit("change:" + c, rec);
      return rec;
    },

    // Remove duplicate customers — same mobile number (last 10 digits), or same
    // name when neither record has a mobile. Keeps the most recently updated
    // record, fills its blank fields from the duplicates, and re-points every
    // invoice at the surviving record. Returns how many duplicates were removed.
    dedupeCustomers() {
      const arr = cache.customers || [];
      const keyOf = (c) => {
        const ph = String(c.mobile || c.phone || "").replace(/\D/g, "");
        if (ph.length >= 6) return "m:" + ph.slice(-10);
        const nm = String(c.name || "").trim().toLowerCase().replace(/\s+/g, " ");
        return nm ? "n:" + nm : null;
      };
      const kept = new Map();
      const remap = {}; // dropped id -> kept id
      for (const c of arr) {
        const k = keyOf(c) || "id:" + c.id;
        const prev = kept.get(k);
        if (!prev) { kept.set(k, c); continue; }
        const newer = String(c.updatedAt || "") >= String(prev.updatedAt || "") ? c : prev;
        const older = newer === c ? prev : c;
        Object.keys(older).forEach((f) => { if (newer[f] == null || newer[f] === "") newer[f] = older[f]; });
        remap[older.id] = newer.id;
        kept.set(k, newer);
      }
      const dropped = Object.keys(remap).length;
      if (!dropped) return 0;
      const resolve = (id) => { let n = 0; while (remap[id] && n++ < 20) id = remap[id]; return id; };
      cache.customers = [...kept.values()];
      const _now = App.format.nowTS();
      Object.keys(remap).forEach((oldId) => { outDel.customers.set(oldId, _now); outUp.customers.delete(oldId); });
      Object.values(remap).forEach((keepId) => outUp.customers.add(resolve(keepId)));
      let invTouched = false;
      (cache.invoices || []).forEach((inv) => {
        if (inv.customerId && remap[inv.customerId]) { inv.customerId = resolve(inv.customerId); invTouched = true; outUp.invoices.add(inv.id); }
      });
      scheduleSave("customers");
      if (invTouched) scheduleSave("invoices");
      emit("change:customers");
      return dropped;
    },

    // Remove duplicate products — same product code (or SKU), or the same
    // name+HSN when no code exists. Keeps the most recently updated record,
    // fills its blank fields from the duplicates, and re-points every invoice
    // line and stock movement at the surviving record. This is what stops a
    // backup restore/import from piling up twin products (and makes a delete
    // stick everywhere instead of leaving a hidden copy in Inventory).
    // Returns how many duplicates were removed.
    dedupeProducts() {
      const arr = cache.products || [];
      const norm = (v) => normName(v);
      const keyOf = (p) => {
        const code = norm(p.code); if (code) return "c:" + code;
        const sku = norm(p.sku); if (sku) return "s:" + sku;
        const nm = norm(p.name); if (nm) return "n:" + nm + "|" + norm(p.hsn);
        return null;
      };
      const kept = new Map();
      const remap = {}; // dropped id -> kept id
      for (const p of arr) {
        const k = keyOf(p) || "id:" + p.id;
        const prev = kept.get(k);
        if (!prev) { kept.set(k, p); continue; }
        const newer = String(p.updatedAt || "") >= String(prev.updatedAt || "") ? p : prev;
        const older = newer === p ? prev : p;
        Object.keys(older).forEach((f) => { if (newer[f] == null || newer[f] === "") newer[f] = older[f]; });
        remap[older.id] = newer.id;
        kept.set(k, newer);
      }
      const dropped = Object.keys(remap).length;
      if (!dropped) return 0;
      const resolve = (id) => { let n = 0; while (remap[id] && n++ < 20) id = remap[id]; return id; };
      cache.products = [...kept.values()];
      const _now = App.format.nowTS();
      Object.keys(remap).forEach((oldId) => { outDel.products.set(oldId, _now); outUp.products.delete(oldId); });
      Object.values(remap).forEach((keepId) => outUp.products.add(resolve(keepId)));
      let invTouched = false, mvTouched = false;
      (cache.invoices || []).forEach((inv) => {
        (inv.items || []).forEach((it) => { if (it.productId && remap[it.productId]) { it.productId = resolve(it.productId); invTouched = true; outUp.invoices.add(inv.id); } });
      });
      (cache.stockMoves || []).forEach((m) => { if (m.productId && remap[m.productId]) { m.productId = resolve(m.productId); mvTouched = true; outUp.stockMoves.add(m.id); } });
      scheduleSave("products");
      if (invTouched) scheduleSave("invoices");
      if (mvTouched) scheduleSave("stockMoves");
      emit("change:products");
      return dropped;
    },

    saveSettings(patch) {
      cache.settings = { ...(cache.settings || {}), ...patch, updatedAt: App.format.nowTS() };
      outUp.settings.add("_singleton");
      scheduleSave("settings");
      emit("change:settings", cache.settings);
      return cache.settings;
    },

    // ---- Delta sync plumbing (used by sync.js) ----
    // Drain the outbox: return the queued per-record changes and clear them. The
    // caller re-queues (via _requeueOutbox) if the network push fails.
    _drainOutbox() {
      const up = {}, del = {};
      for (const c of COLLECTIONS) {
        if (outUp[c].size) up[c] = [...outUp[c]].map((id) => cache[c].find((r) => r.id === id)).filter(Boolean);
        if (outDel[c].size) del[c] = [...outDel[c].entries()].map(([id, updatedAt]) => ({ id, updatedAt }));
        outUp[c].clear(); outDel[c].clear();
      }
      if (outUp.settings.size && cache.settings) up.settings = [{ ...cache.settings, id: "_singleton" }];
      outUp.settings.clear();
      return { up, del };
    },
    _requeueOutbox(drained) {
      if (!drained) return;
      for (const c of COLLECTIONS) {
        (drained.up[c] || []).forEach((r) => r && r.id != null && outUp[c].add(r.id));
        (drained.del[c] || []).forEach((d) => outDel[c].set(d.id, d.updatedAt));
      }
      if (drained.up.settings) outUp.settings.add("_singleton");
    },
    // Merge cloud changes into the local cache + IndexedDB, newest-wins by
    // updatedAt. Writes directly (not via upsert) so it never echoes back to the
    // cloud, and emits change events so the current view refreshes.
    async _applyRemote(changes) {
      if (!changes) return 0;
      const touched = new Set();
      for (const col in changes) {
        if (col === "settings") {
          const rec = (changes.settings || []).filter((x) => !x.deleted).pop();
          if (rec && rec.data && (!cache.settings || (Number(rec.updatedAt) || 0) >= (Number(cache.settings.updatedAt) || 0))) {
            cache.settings = rec.data; touched.add("settings");
          }
          continue;
        }
        if (!Array.isArray(cache[col])) continue;
        const byId = new Map(cache[col].map((r) => [r.id, r]));
        for (const ch of changes[col]) {
          if (ch.deleted) { if (byId.delete(ch.id)) touched.add(col); }
          else {
            const local = byId.get(ch.id);
            if (!local || (Number(ch.updatedAt) || 0) >= (Number(local.updatedAt) || 0)) { byId.set(ch.id, ch.data); touched.add(col); }
          }
        }
        if (touched.has(col)) cache[col] = [...byId.values()];
      }
      for (const col of touched) {
        try {
          if (col === "settings") await db.kvPut("settings", cache.settings);
          else { await db.clear(col); if (cache[col].length) await db.bulkPut(col, cache[col]); }
          emit("change:" + col);
        } catch (e) { console.error("apply remote failed", col, e); }
      }
      return touched.size;
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
      const dups = store.dedupeCustomers();
      if (dups) console.info("Removed " + dups + " duplicate customer(s) during import");
      const pdups = store.dedupeProducts();
      if (pdups) console.info("Removed " + pdups + " duplicate product(s) during import");
      dirty.add("settings"); COLLECTIONS.forEach((c) => dirty.add(c));
      await flush();
      emit("imported");
      COLLECTIONS.forEach((c) => emit("change:" + c));
    },
    COLLECTIONS,
  };

  App.store = store;
})();
