/* =========================================================================
   auth.js — optional app lock (login) screen.
   - No password set  -> app is open (as originally specified).
   - Password set (Settings → Security) -> a lock screen gates the app on load.
   - Credentials verified with SHA-256(salt + password) via SubtleCrypto.
   - "Forgot password" resets using a recovery code shown at setup.
   Session unlock is remembered for the tab (sessionStorage) so navigation
   doesn't re-prompt; a fresh load/refresh locks again.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el, esc } = App.dom;

  const SESSION_KEY = "rp_unlocked";

  function sec() { return (App.store.settings() || {}).security || null; }
  function isConfigured() { const s = sec(); return !!(s && s.hash); }

  async function sha(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function randHex(n) {
    const a = new Uint8Array(n); crypto.getRandomValues(a);
    return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function recoveryCode() {
    // Groups like ABCD-2F9K-... (uppercase, no ambiguous chars)
    const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    let s = "";
    for (let i = 0; i < 16; i++) { s += alpha[a[i] % alpha.length]; if (i % 4 === 3 && i < 15) s += "-"; }
    return s;
  }

  async function setPassword(user, password, existingRecovery) {
    const salt = randHex(16);
    const hash = await sha(salt + password);
    const recovery = existingRecovery || recoveryCode();
    const recoveryHash = await sha(salt + recovery.toUpperCase());
    App.store.saveSettings({ security: { user: user || "Owner", salt, hash, recoveryHash } });
    return recovery;
  }
  async function verify(password) {
    const s = sec(); if (!s) return true;
    return (await sha(s.salt + password)) === s.hash;
  }
  async function verifyRecovery(code) {
    const s = sec(); if (!s) return false;
    return (await sha(s.salt + String(code).trim().toUpperCase())) === s.recoveryHash;
  }
  function disable() { App.store.saveSettings({ security: null }); }

  function markUnlocked() { try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (e) {} }
  function isUnlocked() { try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch (e) { return false; } }
  function lock() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} location.reload(); }

  // Show the lock overlay; resolves when the correct password/recovery is entered.
  function requireUnlock() {
    return new Promise((resolve) => {
      if (!isConfigured() || isUnlocked()) return resolve();
      const s = sec();
      const overlay = el("div.lock-screen");
      const card = el("div.lock-card");
      const brandLogo = (App.store.settings() || {}).logo || App.DEFAULT_LOGO || "";
      card.appendChild(el("div.lock-logo", brandLogo ? [el("img", { src: brandLogo })] : (App.store.settings().businessName || "R")[0]));
      card.appendChild(el("h2", App.store.settings().businessName || "RetailPro"));
      card.appendChild(el("p.muted", "Enter your password to unlock"));

      const form = el("div.lock-form");
      form.appendChild(el("div.muted", { style: { fontSize: "12px", marginBottom: "4px" } }, "User: " + esc(s.user || "Owner")));
      const pass = el("input", { type: "password", placeholder: "Password", autocomplete: "current-password" });
      const err = el("div.lock-err");
      const btn = el("button.btn.primary.lg.block", "Unlock");
      form.appendChild(pass); form.appendChild(err); form.appendChild(btn);
      const forgot = el("a.lock-forgot", { href: "#", text: "Forgot password?" });
      form.appendChild(forgot);
      card.appendChild(form);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      setTimeout(() => pass.focus(), 100);

      async function attempt() {
        if (await verify(pass.value)) { markUnlocked(); overlay.remove(); resolve(); }
        else { err.textContent = "Incorrect password"; pass.select(); }
      }
      btn.addEventListener("click", attempt);
      pass.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
      forgot.addEventListener("click", (e) => { e.preventDefault(); showForgot(overlay, resolve); });
    });
  }

  function showForgot(overlay, resolve) {
    const card = overlay.querySelector(".lock-card");
    card.innerHTML = "";
    card.appendChild(el("h2", "Reset Password"));
    card.appendChild(el("p.muted", "Enter your recovery code to set a new password."));
    const form = el("div.lock-form");
    const code = el("input", { placeholder: "Recovery code (XXXX-XXXX-…)", autocomplete: "off" });
    const np = el("input", { type: "password", placeholder: "New password", autocomplete: "new-password" });
    const err = el("div.lock-err");
    const btn = el("button.btn.primary.lg.block", "Reset & Unlock");
    const back = el("a.lock-forgot", { href: "#", text: "← Back to login" });
    form.appendChild(code); form.appendChild(np); form.appendChild(err); form.appendChild(btn); form.appendChild(back);
    card.appendChild(form);
    setTimeout(() => code.focus(), 60);
    btn.addEventListener("click", async () => {
      if (!(await verifyRecovery(code.value))) { err.textContent = "Invalid recovery code"; return; }
      if ((np.value || "").length < 4) { err.textContent = "Password must be at least 4 characters"; return; }
      await setPassword(sec().user, np.value, code.value.trim().toUpperCase());
      markUnlocked(); overlay.remove(); App.toast && App.toast.success("Password reset"); resolve();
    });
    back.addEventListener("click", (e) => { e.preventDefault(); overlay.remove(); requireUnlock().then(resolve); });
  }

  App.auth = { isConfigured, setPassword, verify, verifyRecovery, disable, requireUnlock, lock, recoveryCode, sha };
})();
