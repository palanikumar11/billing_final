/**
 * RetailPro Cloudflare Worker — permanent cloud persistence via Workers KV.
 *
 * Routes (all under the deployed Worker origin):
 *   GET  /api/health                     -> { ok, time }
 *   GET  /api/backup                     -> full snapshot { settings, products, ... }
 *   PUT  /api/backup        (body: snap) -> stores full snapshot, returns { ok }
 *   GET  /api/collection/:name           -> one collection (array or settings object)
 *   PUT  /api/collection/:name (body)    -> stores one collection, returns { ok }
 *
 * Auth: if the SYNC_TOKEN secret is set, requests must send
 *   Authorization: Bearer <SYNC_TOKEN>
 *
 * Bindings (wrangler.toml):
 *   - KV namespace  BILLING_KV
 *   - (optional) secret SYNC_TOKEN
 *   - (optional) R2 bucket BILLING_R2 for large asset/backup blobs
 */

const COLLECTIONS = ["settings", "products", "customers", "suppliers", "invoices", "purchases", "expenses", "stockMoves"];

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
  if (!env.SYNC_TOKEN) return true; // open if no token configured
  const h = request.headers.get("Authorization") || "";
  return h === "Bearer " + env.SYNC_TOKEN;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    if (path === "/api/health") return json({ ok: true, time: Date.now() });

    if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
    if (!env.BILLING_KV) return json({ error: "KV namespace BILLING_KV not bound" }, 500);

    try {
      // ---- Full backup ----
      if (path === "/api/backup") {
        if (request.method === "GET") {
          const out = { _meta: { app: "RetailPro", source: "cloudflare-kv", time: Date.now() } };
          for (const c of COLLECTIONS) {
            const v = await env.BILLING_KV.get("col:" + c, "json");
            out[c] = v != null ? v : (c === "settings" ? null : []);
          }
          return json(out);
        }
        if (request.method === "PUT") {
          const body = await request.json();
          for (const c of COLLECTIONS) {
            if (body[c] !== undefined) await env.BILLING_KV.put("col:" + c, JSON.stringify(body[c]));
          }
          await env.BILLING_KV.put("meta:lastBackup", JSON.stringify({ time: Date.now() }));
          return json({ ok: true, saved: COLLECTIONS.filter((c) => body[c] !== undefined) });
        }
      }

      // ---- Single collection ----
      const m = path.match(/^\/api\/collection\/([a-zA-Z]+)$/);
      if (m) {
        const name = m[1];
        if (!COLLECTIONS.includes(name)) return json({ error: "unknown collection" }, 404);
        if (request.method === "GET") {
          const v = await env.BILLING_KV.get("col:" + name, "json");
          return json(v != null ? v : (name === "settings" ? null : []));
        }
        if (request.method === "PUT") {
          const body = await request.json();
          await env.BILLING_KV.put("col:" + name, JSON.stringify(body));
          return json({ ok: true });
        }
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      return json({ error: String(err && err.message || err) }, 500);
    }
  },
};
