// Turns bookings and the register into the legal outputs: the daily police list (Act s.18A),
// the monthly return (Annexure 11) and the list of things that need attention today.
import { localISO, nightsBetween, addDays, addMonths, monthStart, fmtShort, fmtDate, fmtMonth, fmtDateTime } from './format.js';
import { ruleValue, GUEST_CATEGORIES, LEISURE_PURPOSES } from './rules.js';

const departureDate = (entry, bookingsById) =>
  entry.departed_at ? localISO(entry.departed_at) : bookingsById.get(entry.booking_id)?.check_out || null;

// Everyone in the register who slept here on the given night (the night that starts on `night`).
export function stayedOnNight(register, bookings, night) {
  const byId = new Map(bookings.map(b => [b.id, b]));
  return register.filter(e => {
    if (localISO(e.arrived_at) > night) return false;
    const dep = departureDate(e, byId);
    return !dep || dep > night;
  });
}

// Annexure 11: guests checked in during the month and person-nights spent in it.
export function monthlyReturn(register, bookings, month) {
  const start = monthStart(month), end = addMonths(start, 1);
  const byId = new Map(bookings.map(b => [b.id, b]));
  const byCategory = Object.fromEntries(GUEST_CATEGORIES.map(c => [c, { guests: 0, nights: 0 }]));
  const residence = new Map(), purposes = new Map();
  for (const e of register) {
    const arr = localISO(e.arrived_at);
    const dep = departureDate(e, byId) || end;
    // nights inside the month count, wherever the stay began
    const from = arr > start ? arr : start, to = dep < end ? dep : end;
    const n = Math.max(0, nightsBetween(from, to));
    if (byCategory[e.guest_category]) byCategory[e.guest_category].nights += e.guests * n;
    if (arr < start || arr >= end) continue;
    if (byCategory[e.guest_category]) byCategory[e.guest_category].guests += e.guests;
    const rk = e.guest_category + '|' + e.residence;
    residence.set(rk, (residence.get(rk) || 0) + e.guests);
    purposes.set(e.purpose, (purposes.get(e.purpose) || 0) + e.guests);
  }
  const total = GUEST_CATEGORIES.reduce((s, c) => ({ guests: s.guests + byCategory[c].guests, nights: s.nights + byCategory[c].nights }), { guests: 0, nights: 0 });
  return {
    month: start,
    byCategory, total,
    residence: [...residence].map(([k, guests]) => { const [category, place] = k.split('|'); return { category, place, guests }; })
      .sort((a, b) => GUEST_CATEGORIES.indexOf(a.category) - GUEST_CATEGORIES.indexOf(b.category) || a.place.localeCompare(b.place)),
    purposes: [...purposes].map(([purpose, guests]) => ({ group: LEISURE_PURPOSES.includes(purpose) ? 'Leisure' : 'Non-leisure', purpose, guests }))
      .sort((a, b) => a.group.localeCompare(b.group) || b.guests - a.guests),
  };
}

export function monthlyDueDate(month) {
  const day = ruleValue('monthly_return.due_day') || 7;
  return addMonths(monthStart(month), 1).slice(0, 8) + String(day).padStart(2, '0');
}

const daysUntil = (iso, today) => nightsBetween(today, iso);

// Things that need attention, most urgent first. Each points at the screen that fixes it.
export function buildAlerts({ today, now = new Date(), property, data }) {
  const out = [];
  const { register, bookings, policeReports, monthlyReturns, formC, documents } = data;
  const night = addDays(today, -1);

  if (ruleValue('police_report.daily', today)) {
    const guests = stayedOnNight(register, bookings, night);
    const sent = policeReports.find(r => r.report_date === night);
    if (!sent && guests.length) {
      const persons = guests.reduce((s, e) => s + e.guests, 0);
      out.push({ sev: 'crit', title: 'Send the daily police report', detail: `${persons} guest${persons === 1 ? '' : 's'} stayed on the night of ${fmtShort(night)} · Act s.18A`, to: '/police', action: 'Open' });
    }
  }

  for (const f of formC.filter(f => !f.ack_no)) {
    const overdue = new Date(f.due_at) < now;
    out.push({ sev: 'crit', title: `Form C: ${f.guest_name}`, detail: overdue ? `Overdue since ${fmtDateTime(f.due_at)}` : `File on FRRO by ${fmtDateTime(f.due_at)}`, to: '/compliance', action: 'Add ack' });
  }

  const lastMonth = addMonths(today, -1);
  const ret = monthlyReturns.find(r => r.month === lastMonth && r.submitted_at);
  if (!ret) {
    const due = monthlyDueDate(lastMonth);
    const left = daysUntil(due, today);
    out.push({ sev: left < 0 ? 'crit' : 'warn', title: `Monthly return, ${fmtMonth(lastMonth)}`, detail: left < 0 ? `Overdue since ${fmtDate(due)} · Annexure 11` : `Due ${fmtDate(due)} (${left} day${left === 1 ? '' : 's'}) · Annexure 11`, to: '/monthly', action: 'Review' });
  }

  if (!property.tourism_reg_no) {
    out.push({ sev: 'warn', title: 'Add your tourism registration number', detail: 'Needed on bills and the booking page · Act s.3', to: '/settings', action: 'Add' });
  } else if (property.tourism_reg_valid_to) {
    const left = daysUntil(property.tourism_reg_valid_to, today);
    if (left < 0) out.push({ sev: 'crit', title: 'Tourism registration expired', detail: `Expired ${fmtDate(property.tourism_reg_valid_to)}. Renew within ${ruleValue('registration.grace_days')} days or the name can be removed (s.9).`, to: '/settings', action: 'Update' });
    else if (left <= 90) out.push({ sev: 'warn', title: 'Renew tourism registration', detail: `Expires ${fmtDate(property.tourism_reg_valid_to)} (${left} days) · Form 6`, to: '/settings', action: 'Update' });
  }

  for (const d of documents.filter(d => d.expires_on)) {
    const left = daysUntil(d.expires_on, today);
    if (left < 0) out.push({ sev: 'crit', title: `${d.kind} expired`, detail: `Expired ${fmtDate(d.expires_on)}. A lapsed licence can block registration (s.10).`, to: '/compliance', action: 'Update' });
    else if (left <= 30) out.push({ sev: 'warn', title: `${d.kind} expires soon`, detail: `${fmtDate(d.expires_on)} · ${left} day${left === 1 ? '' : 's'} left`, to: '/compliance', action: 'Update' });
  }

  const order = { crit: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.sev] - order[b.sev]);
}

// The register line a guest signs at arrival, as text. Its hash is stored with the signature,
// so any later edit to these fields shows as "changed after signing".
export function arrivalContent(e) {
  return [e.guest_name, e.address, e.id_type, e.id_number, Number(e.guests), Number(e.rooms), new Date(e.arrived_at).toISOString()].join('|');
}
