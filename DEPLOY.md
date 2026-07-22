# Deploying RetailPro to Cloudflare — step by step

You deploy **two** things:

1. **Frontend** (the app UI) → **Cloudflare Pages**
2. **Backend** (permanent cloud storage) → **Cloudflare Worker + Workers KV**

Wrangler 3.114 is already installed locally in `workers/` (works with your Node 20).
Every command below is copy-paste. On Windows, run them in **PowerShell** or paste them
into the Claude prompt with a leading `!` so the output is captured.

> Tip: all `npm --prefix "C:\billing\workers" run <x>` commands work from any folder.

---

## STEP 0 — Log in to Cloudflare (one time)

```
npm --prefix "C:\billing\workers" run login
```

A browser opens → sign in as **vedizone@gmail.com** → click **Allow**.
You should see “Successfully logged in.”

Verify:

```
npm --prefix "C:\billing\workers" run whoami
```

It should print your account email and account ID.

---

## STEP 1 — Create the KV namespace (permanent storage)

```
npm --prefix "C:\billing\workers" run kv:create
```

Output looks like:

```
🌀 Creating namespace with title "retailpro-api-BILLING_KV"
✨ Success!
[[kv_namespaces]]
binding = "BILLING_KV"
id = "abcd1234ef5678...."      <-- copy this id
```

Copy the **id** value.

---

## STEP 2 — Put the KV id into the config

Open `C:\billing\workers\wrangler.toml` and replace the placeholder:

```
[[kv_namespaces]]
binding = "BILLING_KV"
id = "REPLACE_WITH_YOUR_KV_NAMESPACE_ID"   <-- paste the id here
```

(Claude can do this for you — just paste the id in the chat.)

---

## STEP 3 — (Optional) Set an API token so the backend isn't public

```
npm --prefix "C:\billing\workers" exec -- wrangler secret put SYNC_TOKEN
```

It asks you to type a secret value — enter any strong password and press Enter.
Remember it; you'll paste the same value into the app later.
(Skip this step to keep the API open — fine for testing.)

---

## STEP 4 — Deploy the Worker (backend)

```
npm --prefix "C:\billing\workers" run deploy
```

At the end it prints the live URL, e.g.:

```
Published retailpro-api
  https://retailpro-api.vedizone.workers.dev
```

**Copy that URL.** Test it in a browser: add `/api/health` to the end —
`https://retailpro-api.vedizone.workers.dev/api/health` → should show `{"ok":true,...}`.

---

## STEP 5 — Deploy the frontend (Pages)

```
npm --prefix "C:\billing\workers" run pages
```

The first time it creates a project named **retailpro** and uploads the clean
`public/` folder (269 KB — no node_modules, no sample PDFs). It prints:

```
✨ Deployment complete!
  https://retailpro.pages.dev
```

That URL **is your live billing app.** Open it — it works fully offline-first even
before you connect the Worker.

> If you change the app source later, re-stage and redeploy:
> ```
> Copy-Item C:\billing\index.html,C:\billing\css,C:\billing\js,C:\billing\assets C:\billing\public -Recurse -Force
> npm --prefix "C:\billing\workers" run pages
> ```

---

## STEP 6 — Connect the app to the cloud

1. Open your live app (`https://retailpro.pages.dev`).
2. Go to **Backup & Sync** (sidebar).
3. Paste the **Worker URL** from Step 4 into **Worker URL**.
4. If you set a token in Step 3, paste the same value into **Sync Token**.
5. Tick **Auto-sync on every change**, click **Save & Test** → “✓ Connected”.
6. Click **⬆ Push all to Cloud** once to seed the cloud with your current data.

Done. Your data now lives permanently in Cloudflare KV and syncs automatically.

---

## Alternative: deploy from the Cloudflare dashboard (no CLI)

If you'd rather not use the terminal:

- **Pages:** dashboard.cloudflare.com → *Workers & Pages* → *Create* → *Pages* →
  *Upload assets* → drag the **`C:\billing\public`** folder → *Deploy*.
- **Worker:** *Create* → *Workers* → paste the contents of `workers/worker.js` →
  under *Settings → Variables → KV Namespace Bindings*, add binding `BILLING_KV`
  to a namespace you create in *Storage & Databases → KV*.

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| `Failed to fetch auth token` | Re-run Step 0 login. |
| `KV namespace ... not bound` | The `id` in `wrangler.toml` is missing/wrong (Step 2). |
| `Wrangler requires Node v22` | You're using global wrangler v4. Use the `npm --prefix` commands above — they use the local v3. |
| Health check 401 | You set a `SYNC_TOKEN`; the app must send the same token (Step 6). |
| Pages upload too big | Deploy the `public/` folder, not the project root. |
