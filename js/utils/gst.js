/* =========================================================================
   gst.js — GST engine + Indian states.
   Rule (per spec): Home state = Tamil Nadu.
     - Customer in Tamil Nadu  -> CGST + SGST (intra-state), each = rate/2
     - Customer in any other state -> IGST (inter-state) = full rate
   The taxable "rate" per line is the product's GST% (default 18).
   ========================================================================= */
(function () {
  const App = (window.App = window.App || {});
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  // State -> GST state code
  const STATES = [
    ["Jammu and Kashmir","01"],["Himachal Pradesh","02"],["Punjab","03"],["Chandigarh","04"],
    ["Uttarakhand","05"],["Haryana","06"],["Delhi","07"],["Rajasthan","08"],["Uttar Pradesh","09"],
    ["Bihar","10"],["Sikkim","11"],["Arunachal Pradesh","12"],["Nagaland","13"],["Manipur","14"],
    ["Mizoram","15"],["Tripura","16"],["Meghalaya","17"],["Assam","18"],["West Bengal","19"],
    ["Jharkhand","20"],["Odisha","21"],["Chhattisgarh","22"],["Madhya Pradesh","23"],["Gujarat","24"],
    ["Daman and Diu","26"],["Dadra and Nagar Haveli","26"],["Maharashtra","27"],["Karnataka","29"],
    ["Goa","30"],["Lakshadweep","31"],["Kerala","32"],["Tamil Nadu","33"],["Puducherry","34"],
    ["Andaman and Nicobar Islands","35"],["Telangana","36"],["Andhra Pradesh","37"],["Ladakh","38"],
    ["Other Territory","97"],
  ];
  const STATE_CODE = Object.fromEntries(STATES.map(([n, c]) => [n.toLowerCase(), c]));

  const HOME_STATE = "Tamil Nadu";

  function stateCode(name) { return STATE_CODE[(name || "").trim().toLowerCase()] || ""; }
  function isIntraState(customerState, homeState = HOME_STATE) {
    return (customerState || "").trim().toLowerCase() === (homeState || HOME_STATE).trim().toLowerCase();
  }

  /**
   * Compute a full bill.
   * @param items [{ qty, price, discountPct, discountAmt, gstRate, taxInclusive }]
   * @param opts  { customerState, homeState, billDiscountPct, billDiscountAmt, roundOff, gstEnabled }
   * Returns totals + per-item breakdown + HSN/rate-wise tax summary.
   */
  function computeBill(items, opts = {}) {
    const homeState = opts.homeState || HOME_STATE;
    const intra = isIntraState(opts.customerState, homeState);
    const gstEnabled = opts.gstEnabled !== false;

    let subTotal = 0, itemDiscount = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0, qtyTotal = 0;
    const lines = [];
    const rateMap = {}; // key: gstRate -> {taxable, cgst, sgst, igst}
    const hsnMap = {};  // key: hsn|rate -> {taxable, cgst, sgst, igst, qty}

    for (const it of items) {
      const qty = Number(it.qty) || 0;
      const price = Number(it.price) || 0;
      const rate = gstEnabled ? (Number(it.gstRate) || 0) : 0;
      let gross = qty * price;

      // Line discount: percent first, then flat amount
      let disc = 0;
      if (it.discountPct) disc += gross * (Number(it.discountPct) / 100);
      if (it.discountAmt) disc += Number(it.discountAmt);
      disc = Math.min(disc, gross);
      let net = gross - disc;

      // Tax-inclusive: back out the tax from net
      let lineTaxable, lineTax;
      if (it.taxInclusive && rate > 0) {
        lineTaxable = net / (1 + rate / 100);
        lineTax = net - lineTaxable;
      } else {
        lineTaxable = net;
        lineTax = net * (rate / 100);
      }

      const lc = intra ? lineTax / 2 : 0;
      const ls = intra ? lineTax / 2 : 0;
      const li = intra ? 0 : lineTax;

      subTotal += gross;
      itemDiscount += disc;
      taxable += lineTaxable;
      cgst += lc; sgst += ls; igst += li;
      qtyTotal += qty;

      // rate-wise
      const rk = String(rate);
      (rateMap[rk] = rateMap[rk] || { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 });
      rateMap[rk].taxable += lineTaxable; rateMap[rk].cgst += lc; rateMap[rk].sgst += ls; rateMap[rk].igst += li;
      // hsn-wise
      const hk = (it.hsn || "-") + "|" + rate;
      (hsnMap[hk] = hsnMap[hk] || { hsn: it.hsn || "-", rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, qty: 0 });
      hsnMap[hk].taxable += lineTaxable; hsnMap[hk].cgst += lc; hsnMap[hk].sgst += ls; hsnMap[hk].igst += li; hsnMap[hk].qty += qty;

      lines.push({
        ...it, qty, price, gross: round2(gross), discount: round2(disc),
        taxable: round2(lineTaxable), gstRate: rate,
        cgst: round2(lc), sgst: round2(ls), igst: round2(li), tax: round2(lineTax),
        amount: round2(lineTaxable + lineTax),
      });
    }

    // Bill-level discount applied on taxable proportionally? Keep simple: subtract from grand.
    let billDiscount = 0;
    if (opts.billDiscountPct) billDiscount += taxable * (Number(opts.billDiscountPct) / 100);
    if (opts.billDiscountAmt) billDiscount += Number(opts.billDiscountAmt);

    // Packaging charges (percentage) — computed on the gross sub-total
    // (BEFORE any discount). Used on Without-GST bills only.
    let packaging = 0;
    if (opts.packagingPct) packaging = subTotal * (Number(opts.packagingPct) / 100);

    const totalTax = cgst + sgst + igst;
    let grand = taxable - billDiscount + packaging + totalTax;

    // Round off
    let roundOff = 0;
    if (opts.roundOff !== false) {
      const rounded = Math.round(grand);
      roundOff = rounded - grand;
      grand = rounded;
    }

    return {
      intra,
      subTotal: round2(subTotal),
      itemDiscount: round2(itemDiscount),
      billDiscount: round2(billDiscount),
      totalDiscount: round2(itemDiscount + billDiscount),
      taxable: round2(taxable),
      cgst: round2(cgst), sgst: round2(sgst), igst: round2(igst),
      totalTax: round2(totalTax),
      packaging: round2(packaging), packagingPct: Number(opts.packagingPct) || 0,
      roundOff: round2(roundOff),
      grandTotal: round2(grand),
      qtyTotal: round2(qtyTotal),
      lines,
      rateSummary: Object.values(rateMap).map((r) => ({ ...r, taxable: round2(r.taxable), cgst: round2(r.cgst), sgst: round2(r.sgst), igst: round2(r.igst) })),
      hsnSummary: Object.values(hsnMap).map((r) => ({ ...r, taxable: round2(r.taxable), cgst: round2(r.cgst), sgst: round2(r.sgst), igst: round2(r.igst) })),
    };
  }

  App.gst = { STATES, HOME_STATE, stateCode, isIntraState, computeBill, round2 };
})();
