/* =========================================================================
   modal.js — modal dialogs + confirm() dialog. Attaches App.modal.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const { el, $ } = App.dom;

  let backdrop;
  function ensure() {
    if (!backdrop) {
      backdrop = el("div.modal-backdrop");
      backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop && backdrop._closeable) close(); });
      document.body.appendChild(backdrop);
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && backdrop.classList.contains("open") && backdrop._closeable) close(); });
    }
    return backdrop;
  }

  /**
   * open({ title, body(Node|string), size, closeable, footer: [ {text,class,onClick,close} ], onOpen })
   * Returns { close, root }.
   */
  function open(opts = {}) {
    const bd = ensure();
    bd._closeable = opts.closeable !== false;
    bd.innerHTML = "";
    const modal = el("div.modal" + (opts.size ? "." + opts.size : ""));

    const head = el("div.modal-head");
    head.appendChild(el("h3", opts.title || ""));
    if (bd._closeable) head.appendChild(el("button.icon-btn.close", { html: "✕", onClick: close }));
    modal.appendChild(head);

    const body = el("div.modal-body");
    if (typeof opts.body === "string") body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    modal.appendChild(body);

    if (opts.footer && opts.footer.length) {
      const foot = el("div.modal-foot");
      opts.footer.forEach((b) => {
        const btn = el("button.btn" + (b.class ? "." + b.class : ""), { text: b.text });
        btn.addEventListener("click", () => {
          let keep = false;
          if (b.onClick) keep = b.onClick() === false;
          if (b.close !== false && !keep) close();
        });
        foot.appendChild(btn);
      });
      modal.appendChild(foot);
    }

    bd.appendChild(modal);
    bd.classList.add("open");
    if (opts.onOpen) requestAnimationFrame(() => opts.onOpen(body, modal));
    const firstInput = body.querySelector("input,select,textarea");
    if (firstInput) setTimeout(() => firstInput.focus(), 60);
    return { close, root: modal, body };
  }

  function close() { if (backdrop) backdrop.classList.remove("open"); }

  // Promise-based confirm
  function confirm(opts = {}) {
    if (typeof opts === "string") opts = { message: opts };
    return new Promise((resolve) => {
      open({
        title: opts.title || "Confirm",
        size: "narrow",
        body: el("div", { html: `<p style="font-size:14px;line-height:1.6">${App.dom.esc(opts.message || "Are you sure?")}</p>` }),
        footer: [
          { text: opts.cancelText || "Cancel", class: "ghost", onClick: () => resolve(false) },
          { text: opts.confirmText || "Confirm", class: opts.danger ? "danger" : "primary", onClick: () => resolve(true) },
        ],
      });
    });
  }

  App.modal = { open, close, confirm };
})();
