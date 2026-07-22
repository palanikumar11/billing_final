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

  App.dom = { $, $$, el, esc, debounce, uid, readFileDataURL, readFileText, download, pickFile };
})();
