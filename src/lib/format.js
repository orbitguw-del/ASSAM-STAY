export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Local calendar date as YYYY-MM-DD (the homestay's day, not UTC's).
export function localISO(date) {
  const d = new Date(date);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export const todayISO = () => localISO(new Date());

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const nightsBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
export const monthStart = iso => iso.slice(0, 8) + '01';
export function addMonths(iso, n) {
  const d = new Date(monthStart(iso) + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export const fmtDate = iso => (iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '');
export const fmtShort = iso => (iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}` : '');
export const fmtMonth = iso => `${MONTHS_LONG[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
export const fmtTime = ts => new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtDateTime = ts => (ts ? `${fmtDate(localISO(ts))}, ${fmtTime(ts)}` : '');
export const weekday = iso => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(iso + 'T00:00:00Z').getUTCDay()];

export const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export function inr(n) {
  const v = Number(n || 0);
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

// Indian financial year label used in invoice numbers, e.g. 1 Oct 2026 -> "26-27".
export function finYear(iso) {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

// The full Aadhaar number is never stored: only "XXXX XXXX 1234".
export function maskAadhaar(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 12 ? 'XXXX XXXX ' + digits.slice(-4) : null;
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
