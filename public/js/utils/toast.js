/* =========================================================================
   toast.js — toast notifications with optional action (used for Undo delete).
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el } = App.dom;

  let stack;
  function ensure() {
    if (!stack) { stack = el("div.toast-stack"); document.body.appendChild(stack); }
    return stack;
  }
  const ICONS = { success: "✓", error: "✕", warn: "⚠", info: "ℹ" };

  function show(opts) {
    if (typeof opts === "string") opts = { message: opts };
    const { title, message = "", type = "info", timeout = 3600, action, onAction } = opts;
    const node = el("div.toast." + type);
    node.appendChild(el("div.t-ic", ICONS[type] || "ℹ"));
    const body = el("div.t-body");
    if (title) body.appendChild(el("div.t-title", title));
    body.appendChild(el("div.t-msg", message));
    if (action) {
      const btn = el("button.t-action", { text: action, onClick: () => { onAction && onAction(); dismiss(node); } });
      body.appendChild(btn);
    }
    node.appendChild(body);
    ensure().appendChild(node);
    const t = setTimeout(() => dismiss(node), timeout);
    node._t = t;
    return node;
  }
  function dismiss(node) {
    if (!node || node._out) return;
    node._out = true;
    clearTimeout(node._t);
    node.classList.add("out");
    setTimeout(() => node.remove(), 260);
  }

  const toast = {
    show,
    success: (m, t) => show({ message: m, title: t, type: "success" }),
    error: (m, t) => show({ message: m, title: t || "Error", type: "error", timeout: 5000 }),
    warn: (m, t) => show({ message: m, title: t, type: "warn" }),
    info: (m, t) => show({ message: m, title: t, type: "info" }),
    dismiss,
  };
  App.toast = toast;
})();
