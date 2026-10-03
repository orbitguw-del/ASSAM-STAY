// Every legal value the app relies on, with the notification it comes from.
// These are the defaults; on Supabase the public.rules table can override them, so a new
// notification is a new row with a later effectiveFrom, not a code change.
import { todayISO } from './format.js';

export const DEFAULT_RULES = [
  { key: 'homestay.min_rooms', value: 2, source: 'Assam Tourism Accommodation Rules 2026, Rule 2(i), 16(1)', effectiveFrom: '2026-07-09' },
  { key: 'homestay.max_rooms', value: 8, source: 'Assam Tourism Accommodation Rules 2026, Rule 2(i), 16(1)', effectiveFrom: '2026-07-09' },
  { key: 'bnb.min_rooms', value: 2, source: 'Assam Tourism Accommodation Rules 2026, Rule 17', effectiveFrom: '2026-07-09' },
  { key: 'registration.validity_years', value: 3, source: 'Assam Tourism Act 2024, s.5; Rules 2026, Rule 4', effectiveFrom: '2024-03-14' },
  { key: 'registration.grace_days', value: 30, source: 'Assam Tourism Act 2024, s.9(1)(vi)', effectiveFrom: '2024-03-14' },
  { key: 'notice.reply_days', value: 15, source: 'Rules 2026, Rule 6', effectiveFrom: '2026-07-09' },
  { key: 'monthly_return.due_day', value: 7, source: 'Rules 2026, Rule 11 and Annexure 11', effectiveFrom: '2026-07-09' },
  { key: 'form_c.hours', value: 24, source: 'FRRO, registration of foreigners', effectiveFrom: '2026-01-01' },
  { key: 'police_report.daily', value: true, source: 'Assam Tourism Act 2024, s.18A (Assam Act XXI of 2026)', effectiveFrom: '2026-09-07' },
  { key: 'police_report.format', value: 'register-layout', source: 'Not yet prescribed under s.18A; register layout used until notified', effectiveFrom: '2026-09-07' },
  { key: 'gst.room_slabs', value: [{ upto: 1000, rate: 0 }, { upto: 7500, rate: 5 }, { upto: null, rate: 18 }], source: 'GST on accommodation from 22 Sep 2025; to be confirmed by a CA', effectiveFrom: '2025-09-22' },
  { key: 'gst.sac_room', value: '996311', source: 'SAC for room accommodation', effectiveFrom: '2017-07-01' },
  { key: 'retention.register_years', value: 8, source: 'Assumption: GST record period, until the Directorate states one', effectiveFrom: '2026-07-09' },
];

// Extras a homestay sells most often. GST treatment to be confirmed by a CA.
export const EXTRAS = [
  { code: 'breakfast', label: 'Breakfast', unitPrice: 200, gstRate: 5, sac: '996331' },
  { code: 'dinner', label: 'Dinner', unitPrice: 350, gstRate: 5, sac: '996331' },
  { code: 'extra_bed', label: 'Extra bed (per night)', unitPrice: 500, gstRate: null, sac: '996311' },
];

let overrides = [];
export function setRuleOverrides(rows) {
  overrides = (rows || []).map(r => ({ key: r.key, value: r.value, source: r.source, effectiveFrom: r.effective_from }));
}

export function allRules() {
  const byKey = new Map();
  for (const r of [...DEFAULT_RULES, ...overrides]) {
    const list = byKey.get(r.key) || [];
    list.push(r);
    byKey.set(r.key, list);
  }
  return byKey;
}

export function ruleEntry(key, on = todayISO()) {
  const list = (allRules().get(key) || []).filter(r => r.effectiveFrom <= on);
  list.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return list[0] || null;
}

export function ruleValue(key, on) {
  const r = ruleEntry(key, on);
  return r ? r.value : undefined;
}

export const GUEST_CATEGORIES = ['Local', 'Domestic', 'NRI', 'Foreign'];
export const LEISURE_PURPOSES = ['Holidaying', 'Sightseeing', 'Recreation', 'Other leisure'];
export const OTHER_PURPOSES = ['Business', 'Social', 'Religious', 'Education', 'Sports', 'Health and medical', 'Shopping', 'Other'];
export const PURPOSES = [...LEISURE_PURPOSES, ...OTHER_PURPOSES];
export const ID_TYPES = ['Aadhaar', 'Passport', 'Voter ID', 'Driving licence'];
export const SOURCES = ['Direct', 'Walk-in', 'Airbnb', 'Booking.com', 'MakeMyTrip', 'Agoda', 'ATDC', 'Travel agent'];
export const PAYMENT_METHODS = [['upi', 'UPI'], ['cash', 'Cash'], ['card', 'Card'], ['bank', 'Bank transfer'], ['ota', 'Paid to OTA']];
export const DOCUMENT_KINDS = [
  'Tourism registration certificate (Form 3)', 'Fire Safety Certificate', 'Trade licence', 'FSSAI registration',
  'Panchayat / municipal NOC', 'Pollution Control Board consent', 'Police clearance', 'Lease / rent agreement',
  'ATDC registration (Aamaar Aalohi)', 'Other',
];
