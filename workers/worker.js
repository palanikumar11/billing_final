/**
 * RetailPro Cloudflare Worker — multi-device cloud sync on D1 (SQLite).
 *
 * Every record of every collection is one row keyed by (collection, id). Writes
 * merge newest-wins (by the client's updated_at) and deletes are tombstones, so
 * two devices editing at once can never overwrite or lose each other's invoices.
 * `rev` is a server-assigned monotonic revision — a device pulls everything with
 * rev greater than the last rev it has already seen (cursor-based delta sync).
 *
 * Routes (all under the deployed Worker origin):
 *   GET  /api/health                      -> { ok, backend:"d1", time }
 *   POST /api/sync   (body: {since,up,del})-> apply changes, return {rev,changes,more}
 *   GET  /api/backup                      -> full snapshot { settings, invoices, ... }
 *   PUT  /api/backup (body: snapshot)     -> import/seed a snapshot (newest-wins)
 *   POST /api/migrate                     -> one-time copy of legacy KV data into D1
 *   GET  /api/collection/:name            -> one collection array (read/compat)
 *   PUT  /api/collection/:name (body arr) -> per-record merge upsert (legacy client compat)
 *
 * Auth: if the SYNC_TOKEN secret is set, requests must send
 *   Authorization: Bearer <SYNC_TOKEN>
 *
 * Bindings (wrangler.toml): D1 database DB, (legacy) KV BILLING_KV, secret SYNC_TOKEN.
 */

const DATA_COLLECTIONS = ["products", "customers", "suppliers", "invoices", "purchases", "expenses", "stockMoves"];
const ALL_COLLECTIONS = ["settings", ...DATA_COLLECTIONS];
const SETTINGS_ID = "_singleton";
const PULL_LIMIT = 5000;   // rows returned per /api/sync pull (paginated via `more`)
const BATCH = 25;          // statements per D1 batch

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });
}
function authorized(request, env) {
  if (!env.SYNC_TOKEN) return true;
  return (request.headers.get("Authorization") || "") === "Bearer " + env.SYNC_TOKEN;
}

// Reserve a contiguous block of `n` monotonic revisions atomically, so two
// devices syncing at the same instant get disjoint rev ranges (no cursor gaps
// that would skip a record). Returns the first rev of the reserved block.
async function reserveRevs(env, n) {
  if (n <= 0) {
    const r = await env.DB.prepare("SELECT v FROM meta WHERE k='rev'").first();
    return (r && r.v) || 0;
  }
  const row = await env.DB.prepare("UPDATE meta SET v = v + ? WHERE k='rev' RETURNING v").bind(n).first();
  return row.v - n + 1; // first rev of the reserved [start, start+n-1] range
}

const UPSERT_SQL =
  "INSERT INTO records (collection,id,data,updated_at,deleted,rev) VALUES (?1,?2,?3,?4,0,?5) " +
  "ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at, " +
  "deleted=0, rev=excluded.rev WHERE excluded.updated_at >= records.updated_at";

const DELETE_SQL =
  "INSERT INTO records (collection,id,data,updated_at,deleted,rev) VALUES (?1,?2,'',?3,1,?4) " +
  "ON CONFLICT(collection,id) DO UPDATE SET data='', updated_at=excluded.updated_at, " +
  "deleted=1, rev=excluded.rev WHERE excluded.updated_at >= records.updated_at";

// Apply a set of upserts + deletes, assigning each a fresh reserved rev.
// up  = { collection: [record, ...] }   (record must carry id; updatedAt optional)
// del = { collection: [{id, updatedAt}, ...] }
async function applyChanges(env, up, del) {
  const stmts = [];
  const now = Date.now();
  const upsert = env.DB.prepare(UPSERT_SQL);
  const delete_ = env.DB.prepare(DELETE_SQL);

  const total = countChanges(up) + countChanges(del);
  let rev = await reserveRevs(env, total);

  for (const col of ALL_COLLECTIONS) {
    for (const rec of (up && up[col]) || []) {
      if (!rec || rec.id == null) continue;
      const uAt = Number(rec.updatedAt) || now;
      stmts.push(upsert.bind(col, String(rec.id), JSON.stringify(rec), uAt, rev++));
    }
  }
  for (const col of ALL_COLLECTIONS) {
    for (const d of (del && del[col]) || []) {
      if (!d || d.id == null) continue;
      const uAt = Number(d.updatedAt) || now;
      stmts.push(delete_.bind(col, String(d.id), uAt, rev++));
    }
  }
  for (let i = 0; i < stmts.length; i += BATCH) {
    await env.DB.batch(stmts.slice(i, i + BATCH));
  }
  return stmts.length;
}

function countChanges(obj) {
  let n = 0;
  for (const col of ALL_COLLECTIONS) n += ((obj && obj[col]) || []).length;
  return n;
}

// Pull every change with rev > since (capped at PULL_LIMIT; `more` signals paging).
async function pullSince(env, since) {
  const res = await env.DB.prepare(
    "SELECT collection,id,data,updated_at,deleted,rev FROM records WHERE rev > ? ORDER BY rev LIMIT ?"
  ).bind(Number(since) || 0, PULL_LIMIT).all();
  const rows = res.results || [];
  const changes = {};
  let maxRev = Number(since) || 0;
  for (const r of rows) {
    (changes[r.collection] = changes[r.collection] || []).push({
      id: r.id,
      data: r.deleted ? null : safeParse(r.data),
      updatedAt: r.updated_at,
      deleted: !!r.deleted,
    });
    if (r.rev > maxRev) maxRev = r.rev;
  }
  return { changes, rev: maxRev, more: rows.length >= PULL_LIMIT };
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

// Build a full snapshot (non-deleted) — used for manual backup + GET /api/backup.
async function buildSnapshot(env) {
  const res = await env.DB.prepare("SELECT collection,id,data FROM records WHERE deleted=0").all();
  const out = { _meta: { app: "RetailPro", source: "cloudflare-d1", time: Date.now() }, settings: null };
  DATA_COLLECTIONS.forEach((c) => (out[c] = []));
  for (const r of res.results || []) {
    if (r.collection === "settings") out.settings = safeParse(r.data);
    else if (out[r.collection]) out[r.collection].push(safeParse(r.data));
  }
  return out;
}

// Turn a snapshot { settings, invoices:[...], ... } into an `up` change set.
function snapshotToUp(snap) {
  const up = {};
  if (snap && snap.settings && typeof snap.settings === "object") {
    up.settings = [{ ...snap.settings, id: SETTINGS_ID }];
  }
  for (const c of DATA_COLLECTIONS) {
    if (Array.isArray(snap && snap[c])) up[c] = snap[c].filter((r) => r && r.id != null);
  }
  return up;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    if (path === "/api/health") return json({ ok: true, backend: "d1", time: Date.now() });

    if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
    if (!env.DB) return json({ error: "D1 database DB not bound" }, 500);

    try {
      // ---- Delta sync: apply changes, then return everything newer than `since` ----
      if (path === "/api/sync" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        await applyChanges(env, body.up || {}, body.del || {});
        const pulled = await pullSince(env, body.since || 0);
        return json({ ok: true, ...pulled });
      }

      // ---- Full snapshot (manual backup / read) ----
      if (path === "/api/backup") {
        if (request.method === "GET") return json(await buildSnapshot(env));
        if (request.method === "PUT") {
          const snap = await request.json();
          const n = await applyChanges(env, snapshotToUp(snap), {});
          return json({ ok: true, saved: n });
        }
      }

      // ---- One-time migration of legacy Workers-KV data into D1 ----
      if (path === "/api/migrate" && request.method === "POST") {
        if (!env.BILLING_KV) return json({ error: "KV namespace BILLING_KV not bound" }, 500);
        const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM records").first();
        const force = url.searchParams.get("force") === "1";
        if (count && count.n > 0 && !force) {
          return json({ ok: true, skipped: true, existing: count.n, message: "D1 already has data; pass ?force=1 to import anyway" });
        }
        const snap = { settings: await env.BILLING_KV.get("col:settings", "json") };
        for (const c of DATA_COLLECTIONS) snap[c] = (await env.BILLING_KV.get("col:" + c, "json")) || [];
        const n = await applyChanges(env, snapshotToUp(snap), {});
        return json({ ok: true, migrated: n });
      }

      // ---- Single collection (legacy client compatibility) ----
      const m = path.match(/^\/api\/collection\/([a-zA-Z]+)$/);
      if (m) {
        const name = m[1];
        if (!ALL_COLLECTIONS.includes(name)) return json({ error: "unknown collection" }, 404);
        if (request.method === "GET") {
          if (name === "settings") {
            const r = await env.DB.prepare("SELECT data FROM records WHERE collection='settings' AND id=? AND deleted=0").bind(SETTINGS_ID).first();
            return json(r ? safeParse(r.data) : null);
          }
          const res = await env.DB.prepare("SELECT data FROM records WHERE collection=? AND deleted=0").bind(name).all();
          return json((res.results || []).map((r) => safeParse(r.data)));
        }
        if (request.method === "PUT") {
          // Legacy whole-collection push -> per-record merge (newest-wins, no deletes).
          const body = await request.json();
          const up = name === "settings"
            ? { settings: [{ ...(body || {}), id: SETTINGS_ID }] }
            : { [name]: (Array.isArray(body) ? body : []).filter((r) => r && r.id != null) };
          await applyChanges(env, up, {});
          return json({ ok: true });
        }
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, 500);
    }
  },
};
