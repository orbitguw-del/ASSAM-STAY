import { ruleValue, EXTRAS } from './rules.js';
import { round2 } from './format.js';

// GST rate for a room by its tariff per night, from the dated slab rule.
export function roomGstRate(rate, on) {
  const slabs = ruleValue('gst.room_slabs', on) || [];
  for (const s of slabs) if (s.upto == null || rate <= s.upto) return s.rate;
  return 0;
}

// Builds the bill. An unregistered homestay issues a bill of supply with no GST.
export function buildBill({ registered, rate, nights, extras = {}, on }) {
  const roomRate = registered ? roomGstRate(rate, on) : 0;
  const lines = [{
    description: `Room, ${nights} night${nights === 1 ? '' : 's'}`,
    sac: ruleValue('gst.sac_room', on),
    qty: nights, unit_price: rate, amount: round2(rate * nights), gst_rate: roomRate,
  }];
  for (const x of EXTRAS) {
    const qty = Number(extras[x.code] || 0);
    if (qty > 0) {
      const gst = x.gstRate == null ? roomRate : x.gstRate;
      lines.push({ description: x.label, sac: x.sac, qty, unit_price: x.unitPrice, amount: round2(qty * x.unitPrice), gst_rate: registered ? gst : 0 });
    }
  }
  for (const l of lines) l.tax = round2((l.amount * l.gst_rate) / 100);
  const taxable = round2(lines.reduce((s, l) => s + l.amount, 0));
  const tax = round2(lines.reduce((s, l) => s + l.tax, 0));
  const cgst = round2(tax / 2);
  const sgst = round2(tax - cgst);
  return { kind: registered ? 'tax_invoice' : 'bill_of_supply', lines, taxable, cgst, sgst, total: round2(taxable + cgst + sgst) };
}
