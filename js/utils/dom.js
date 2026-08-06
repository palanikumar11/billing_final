/* =========================================================================
   dom.js — tiny DOM + helper toolkit. Attaches to window.App.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  // Namespaces that later scripts populate. dom.js loads first, so create the
  // module registry up front — every module does `App.modules.X = {...}` at load
  // time, well before app.js runs.
  App.modules = App.modules || {};

  // Query helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Element factory: el('div.klass#id', {attrs}, [children|string])
  function el(tag, attrs, children) {
    let cls = "", id = "";
    const parts = tag.split(/(?=[.#])/);
    const name = parts[0];
    parts.slice(1).forEach((p) => {
      if (p[0] === ".") cls += (cls ? " " : "") + p.slice(1);
      else if (p[0] === "#") id = p.slice(1);
    });
    const node = document.createElement(name || "div");
    if (cls) node.className = cls;
    if (id) node.id = id;
    if (attrs && typeof attrs === "object" && !Array.isArray(attrs) && !(attrs instanceof Node)) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "html") node.innerHTML = v;
        else if (k === "text") node.textContent = v;
        else if (k === "dataset") Object.assign(node.dataset, v);
        else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
        else node.setAttribute(k, v);
      }
    } else if (attrs != null) {
      children = attrs;
    }
    // Number inputs accept decimals by default. Without step="any" the browser
    // uses step=1, which rejects values like 2.5 or 18.75 on validation — the
    // recurring "percentage won't take decimals" complaint. Any caller that
    // needs whole numbers can still pass an explicit step.
    if (node.tagName === "INPUT" && node.getAttribute("type") === "number" && !node.hasAttribute("step")) {
      node.setAttribute("step", "any");
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null || c === false) return;
        node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
      });
    }
    return node;
  }

  // Safe HTML escaping for user-supplied strings inserted via innerHTML
  function esc(s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Debounce
  function debounce(fn, ms = 220) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  }

  // Unique id
  function uid(prefix = "id") {
    return prefix + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  // Read a File as data URL (for logo/signature/stamp uploads)
  function readFileDataURL(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsText ? r.readAsDataURL(file) : rej();
    });
  }
  function readFileText(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsText(file);
    });
  }

  // Trigger a client-side file download
  function download(filename, content, type = "application/octet-stream") {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  }

  // Pick a file via hidden input
  function pickFile(accept, multiple = false) {
    return new Promise((res) => {
      const inp = el("input", { type: "file", accept, style: { display: "none" } });
      if (multiple) inp.multiple = true;
      inp.onchange = () => res(multiple ? Array.from(inp.files) : inp.files[0]);
      document.body.appendChild(inp);
      inp.click();
      setTimeout(() => inp.remove(), 60000);
    });
  }

  // ---- Professional SVG icon set (Lucide-style, monochrome, currentColor) ----
  // Replaces the old emoji/text-glyph action icons (± ✎ ⧉ 🗑 …) with a uniform,
  // crisp stroke set that inherits the button's colour (so the hover tints in
  // components.css apply). Use via App.icons.get("edit") in an el(..,{html}).
  const ICONS = {
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
    delete: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    duplicate: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    adjust: '<line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><line x1="14" y1="2" x2="14" y2="6"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="16" y1="18" x2="16" y2="22"/>',
    view: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    history: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    return: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  };
  function icon(name, size = 16) {
    const p = ICONS[name];
    if (!p) return "";
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + p + "</svg>";
  }
  App.icons = { get: icon, svg: icon, map: ICONS };

  App.dom = { $, $$, el, esc, debounce, uid, readFileDataURL, readFileText, download, pickFile };
})();
