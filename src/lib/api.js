// What the screens do, written once for both backends. The database enforces the rules
// (double booking, room limit, signatures, masked Aadhaar); this layer turns its errors
// into plain words.
import { todayISO, sha256 } from './format.js';
import { ruleValue } from './rules.js';
import { arrivalContent } from './compliance.js';

const scope = ctx => ({ tenant_id: ctx.property.tenant_id, property_id: ctx.property.id });

export function friendlyError(e) {
  if (e?.code === '23P01' || /no_double_booking/.test(e?.message || '')) {
    return new Error('Double booking blocked: that room already has a stay on those dates. Pick another room or other dates.');
  }
  if (/aadhaar_masked/.test(e?.message || '')) return new Error('Only the masked Aadhaar number can be stored.');
  if (/row-level security/.test(e?.message || '')) return new Error('You do not have access to this homestay.');
  return e instanceof Error ? e : new Error(String(e));
}

const run = async fn => { try { return await fn(); } catch (e) { throw friendlyError(e); } };

export async function loadAll(be, property) {
  const m = { property_id: property.id };
  const [rooms, bookings, register, invoices, payments, formC, policeReports, monthlyReturns, documents, signatures] = await Promise.all(
    ['rooms', 'bookings', 'register_entries', 'invoices', 'payments', 'form_c', 'police_reports', 'monthly_returns', 'documents', 'signatures']
      .map(t => be.select(t, m)));
  return {
    rooms: rooms.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
    bookings: bookings.sort((a, b) => a.check_in.localeCompare(b.check_in)),
    register: register.sort((a, b) => a.serial_no - b.serial_no),
    invoices: invoices.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    payments, formC, policeReports, monthlyReturns, documents,
    signatures: new Map(signatures.map(s => [s.id, s])),
  };
}

export async function saveSignature(be, ctx, { kind, signerName, image, content }) {
  return run(async () => be.insert('signatures', {
    ...scope(ctx), kind, signer_name: signerName, image,
    content_hash: await sha256(content), device: navigator.userAgent.slice(0, 120),
  }));
}

export async function createBooking(be, ctx, b) {
  return run(async () => {
    const booking = await be.insert('bookings', {
      ...scope(ctx), room_id: b.room_id, guest_name: b.guest_name.trim(), phone: b.phone || null, guests: Number(b.guests) || 1,
      check_in: b.check_in, check_out: b.check_out, source: b.source, status: 'confirmed', rate: Number(b.rate) || null,
      advance: Number(b.advance) || 0, notes: b.notes || null,
    });
    if (Number(b.advance) > 0) {
      await be.rpc('record_payment', { p_payment: { property_id: ctx.property.id, booking_id: booking.id, amount: Number(b.advance), method: b.advance_method || 'upi', received_on: todayISO() } });
    }
    return booking;
  });
}

export const cancelBooking = (be, booking) => run(() => be.update('bookings', booking.id, { status: 'cancelled' }));

export async function checkIn(be, ctx, { booking, form, guestSignature, staffSignatureId }) {
  return run(async () => {
    const entry = {
      ...scope(ctx), booking_id: booking.id, guest_name: form.guest_name.trim(), address: form.address.trim(),
      guest_category: form.guest_category, residence: form.residence.trim(), purpose: form.purpose,
      id_type: form.id_type, id_number: form.id_number, nationality: form.guest_category === 'Foreign' ? form.residence.trim() : 'Indian',
      passport_issued: form.passport_issued || null, passport_expiry: form.passport_expiry || null, visa_no: form.visa_no || null,
      guests: Number(form.guests), rooms: 1, arrived_at: new Date().toISOString(), staff_name: ctx.staffName,
      encashment_cert: form.encashment_cert || null, remarks: form.remarks || null, sig_staff: staffSignatureId,
    };
    const sig = await saveSignature(be, ctx, { kind: 'arrival', signerName: entry.guest_name, image: guestSignature, content: arrivalContent(entry) });
    const saved = await be.insert('register_entries', { ...entry, sig_arrival: sig.id });
    await be.update('bookings', booking.id, {
      status: 'in', guest_name: entry.guest_name, guests: entry.guests, guest_category: entry.guest_category,
      residence: entry.residence, address: entry.address, purpose: entry.purpose,
    });
    if (entry.guest_category === 'Foreign') {
      const hours = ruleValue('form_c.hours') || 24;
      await be.insert('form_c', { ...scope(ctx), booking_id: booking.id, register_entry_id: saved.id, guest_name: entry.guest_name, due_at: new Date(Date.now() + hours * 3600e3).toISOString() });
    }
    return saved;
  });
}

export async function checkOut(be, ctx, { booking, entry, bill, paidSoFar, payment, overrideReason, guestSignature }) {
  return run(async () => {
    const invoice = await be.rpc('issue_invoice', { p_invoice: {
      property_id: ctx.property.id, booking_id: booking.id, guest_name: booking.guest_name, guest_gstin: bill.guest_gstin || '',
      lines: bill.lines, taxable: bill.taxable, cgst: bill.cgst, sgst: bill.sgst, total: bill.total,
      issued_on: todayISO(), price_override_reason: overrideReason || '',
    } });
    const balance = Math.round((bill.total - paidSoFar) * 100) / 100;
    if (balance > 0 && payment.method) {
      await be.rpc('record_payment', { p_payment: { property_id: ctx.property.id, booking_id: booking.id, invoice_id: invoice.id, amount: balance, method: payment.method, received_on: todayISO() } });
    }
    const sig = await saveSignature(be, ctx, { kind: 'departure', signerName: booking.guest_name, image: guestSignature, content: `${invoice.number}|${invoice.total}|${entry.id}` });
    const remarks = [entry.remarks, overrideReason ? `Rate above tariff: ${overrideReason}` : ''].filter(Boolean).join('; ') || null;
    await be.update('register_entries', entry.id, {
      departed_at: new Date().toISOString(), sig_departure: sig.id, invoice_id: invoice.id,
      tax_amount: Math.round((bill.cgst + bill.sgst) * 100) / 100, remarks,
    });
    await be.update('bookings', booking.id, { status: 'out' });
    return invoice;
  });
}

export const recordPayment = (be, ctx, p) => run(() => be.rpc('record_payment', { p_payment: { property_id: ctx.property.id, received_on: todayISO(), ...p } }));

export const markPoliceReportSent = (be, ctx, { night, entries, channel }) => run(() => be.insert('police_reports', {
  ...scope(ctx), report_date: night, guest_count: entries.reduce((s, e) => s + e.guests, 0), channel,
  snapshot: entries.map(e => ({ serial_no: e.serial_no, guest_name: e.guest_name, address: e.address, id_type: e.id_type, id_number: e.id_number, guests: e.guests, arrived_at: e.arrived_at })),
  sent_at: new Date().toISOString(),
}));

export async function submitMonthlyReturn(be, ctx, { month, data, ownerSignature, existing }) {
  return run(async () => {
    const sig = await saveSignature(be, ctx, { kind: 'owner_return', signerName: ctx.staffName, image: ownerSignature, content: JSON.stringify(data) });
    const row = { data, sig_owner: sig.id, submitted_at: new Date().toISOString() };
    return existing ? be.update('monthly_returns', existing.id, row) : be.insert('monthly_returns', { ...scope(ctx), month, ...row });
  });
}

export const saveFormCAck = (be, f, ack) => run(() => be.update('form_c', f.id, { ack_no: ack.trim(), filed_at: new Date().toISOString() }));

export const saveDocument = (be, ctx, doc) => run(() => (doc.id
  ? be.update('documents', doc.id, { kind: doc.kind, number: doc.number, issued_on: doc.issued_on || null, expires_on: doc.expires_on || null, notes: doc.notes || null })
  : be.insert('documents', { ...scope(ctx), kind: doc.kind, number: doc.number, issued_on: doc.issued_on || null, expires_on: doc.expires_on || null, notes: doc.notes || null })));

export const updateProperty = (be, property, patch) => run(() => be.update('properties', property.id, patch));
export const saveRoom = (be, ctx, room) => run(() => (room.id
  ? be.update('rooms', room.id, { name: room.name, tariff: Number(room.tariff), active: room.active })
  : be.insert('rooms', { ...scope(ctx), name: room.name, tariff: Number(room.tariff), active: true, sort: room.sort || 0 })));

export const setupProperty = (be, p) => run(() => be.rpc('setup_property', { p }));
