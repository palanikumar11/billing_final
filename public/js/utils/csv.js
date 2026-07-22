/* =========================================================================
   csv.js — RFC-4180-ish CSV parse/stringify + JSON helpers.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});

  function stringify(rows, columns) {
    if (!rows.length && !columns) return "";
    const cols = columns || Object.keys(rows[0] || {});
    const escCell = (v) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const head = cols.map(escCell).join(",");
    const body = rows.map((r) => cols.map((c) => escCell(r[c])).join(",")).join("\r\n");
    return head + "\r\n" + body;
  }

  function parse(text) {
    const rows = [];
    let field = "", row = [], inQ = false;
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else field += c;
      }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows[0].map((h) => h.trim());
    return rows.slice(1).filter((r) => r.some((c) => c !== "")).map((r) => {
      const o = {};
      headers.forEach((h, i) => (o[h] = r[i] !== undefined ? r[i] : ""));
      return o;
    });
  }

  App.csv = { stringify, parse };
})();
