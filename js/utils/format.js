/* =========================================================================
   format.js — currency, dates, number-to-words (Indian numbering).
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});

  const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

  function money(n) {
    n = Number(n) || 0;
    return "₹" + inr.format(n);
  }
  function moneyPlain(n) { return inr.format(Number(n) || 0); }
  function num(n, dp = 2) {
    n = Number(n) || 0;
    return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function compact(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 1e7) return "₹" + (n / 1e7).toFixed(2) + " Cr";
    if (Math.abs(n) >= 1e5) return "₹" + (n / 1e5).toFixed(2) + " L";
    if (Math.abs(n) >= 1e3) return "₹" + inr0.format(n);
    return "₹" + inr.format(n);
  }
  function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

  // ---- Dates ----
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function nowTS() { return Date.now(); }
  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return String(d.getDate()).padStart(2, "0") + " " +
      ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()] + " " + d.getFullYear();
  }
  function fmtDateTime(ts) {
    const d = new Date(ts);
    if (isNaN(d)) return "";
    let h = d.getHours(), ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return fmtDate(d.toISOString()) + ", " + h + ":" + String(d.getMinutes()).padStart(2, "0") + " " + ap;
  }
  function monthKey(iso) { return (iso || todayISO()).slice(0, 7); }   // YYYY-MM
  function yearKey(iso) { return (iso || todayISO()).slice(0, 4); }    // YYYY

  // Financial year label (Apr–Mar) from an ISO date
  function financialYear(iso) {
    const d = new Date(iso || todayISO());
    const y = d.getFullYear();
    const start = d.getMonth() >= 3 ? y : y - 1;
    return start + "-" + String(start + 1).slice(-2);
  }

  // ---- Number to words (Indian system) ----
  const ONES = ["", "One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten",
    "Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const TENS = ["", "", "Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];

  function twoDigits(n) {
    if (n < 20) return ONES[n];
    return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  }
  function threeDigits(n) {
    const h = Math.floor(n / 100), r = n % 100;
    let s = "";
    if (h) s += ONES[h] + " Hundred" + (r ? " " : "");
    if (r) s += twoDigits(r);
    return s;
  }
  function inWords(amount) {
    amount = App.format.round2(amount);
    const rupees = Math.floor(amount);
    const paise = Math.round((amount - rupees) * 100);
    if (rupees === 0 && paise === 0) return "Zero Rupees Only";
    let words = "";
    let n = rupees;
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    const hundred = n;
    if (crore) words += threeDigits(crore) + " Crore ";
    if (lakh) words += twoDigits(lakh) + " Lakh ";
    if (thousand) words += twoDigits(thousand) + " Thousand ";
    if (hundred) words += threeDigits(hundred) + " ";
    words = words.trim() + " Rupees";
    if (paise) words += " and " + twoDigits(paise) + " Paise";
    return words + " Only";
  }

  App.format = { money, moneyPlain, num, compact, round2, todayISO, nowTS, fmtDate, fmtDateTime, monthKey, yearKey, financialYear, inWords };
})();
