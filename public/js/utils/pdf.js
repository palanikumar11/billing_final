/* =========================================================================
   pdf.js — minimal, dependency-free PDF writer.
   Wraps one JPEG per page into a multi-page A4 PDF (each image fills the page,
   so content prints full size, not shrunk). Used by invoice Download/Share.
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const A4 = { w: 595.28, h: 841.89 }; // points

  const ascii = (s) => { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff; return a; };
  function concat(parts) {
    let len = 0; parts.forEach((p) => (len += p.length));
    const out = new Uint8Array(len); let o = 0;
    parts.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
  }

  /**
   * Build a multi-page A4 PDF, one JPEG per page.
   * @param pages [{ bytes: Uint8Array, w, h }]  (baseline DeviceRGB JPEGs)
   */
  function fromJpegs(pages) {
    pages = pages.filter((p) => p && p.bytes && p.bytes.length);
    if (!pages.length) throw new Error("no pages");
    const N = pages.length;
    const parts = []; const offsets = []; let pos = 0;
    const push = (b) => { parts.push(b); pos += b.length; };
    const obj = (n, body) => { offsets[n] = pos; push(ascii(`${n} 0 obj\n`)); push(body); push(ascii("\nendobj\n")); };

    push(ascii("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));
    obj(1, ascii("<< /Type /Catalog /Pages 2 0 R >>"));
    // Pages object (kids filled below)
    const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
    obj(2, ascii(`<< /Type /Pages /Kids [${kids}] /Count ${N} >>`));

    pages.forEach((pg, i) => {
      const pageN = 3 + i * 3, imgN = 4 + i * 3, contN = 5 + i * 3;
      // Fit the image to the full A4 (tiny 6pt margin) preserving aspect ratio.
      const margin = 6;
      const availW = A4.w - margin * 2, availH = A4.h - margin * 2;
      const scale = Math.min(availW / pg.w, availH / pg.h);
      const dw = pg.w * scale, dh = pg.h * scale;
      const tx = (A4.w - dw) / 2, ty = (A4.h - dh) / 2;
      obj(pageN, ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w.toFixed(2)} ${A4.h.toFixed(2)}] /Resources << /XObject << /Im0 ${imgN} 0 R >> >> /Contents ${contN} 0 R >>`));
      // image object (dict + binary stream)
      offsets[imgN] = pos;
      push(ascii(`${imgN} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.bytes.length} >>\nstream\n`));
      push(pg.bytes);
      push(ascii("\nendstream\nendobj\n"));
      const content = `q\n${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)} cm\n/Im0 Do\nQ\n`;
      obj(contN, ascii(`<< /Length ${content.length} >>\nstream\n${content}endstream`));
    });

    const total = 2 + N * 3;
    const xrefPos = pos;
    let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= total; n++) xref += String(offsets[n]).padStart(10, "0") + " 00000 n \n";
    push(ascii(xref));
    push(ascii(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`));

    return new Blob([concat(parts)], { type: "application/pdf" });
  }

  function fromJpeg(bytes, w, h) { return fromJpegs([{ bytes, w, h }]); }

  function dataUrlToBytes(dataUrl) {
    const bin = atob(dataUrl.split(",")[1]);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }

  App.pdf = { fromJpegs, fromJpeg, dataUrlToBytes, A4 };
})();
