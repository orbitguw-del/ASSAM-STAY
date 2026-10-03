import { describe, it, expect } from 'vitest';
import { buildBill, roomGstRate } from './billing.js';
import { stayedOnNight, monthlyReturn, monthlyDueDate, buildAlerts } from './compliance.js';
import { finYear, maskAadhaar, addMonths } from './format.js';

describe('billing', () => {
  it('uses the GST slab for the room tariff', () => {
    expect(roomGstRate(1000)).toBe(0);
    expect(roomGstRate(2800)).toBe(5);
    expect(roomGstRate(7500)).toBe(5);
    expect(roomGstRate(7501)).toBe(18);
  });

  it('splits GST into CGST and SGST and adds up', () => {
    const b = buildBill({ registered: true, rate: 3200, nights: 3, extras: { dinner: 2 } });
    expect(b.kind).toBe('tax_invoice');
    expect(b.taxable).toBe(10300);
    expect(b.cgst + b.sgst).toBe(515);
    expect(b.total).toBe(10815);
  });

  it('charges no GST on a bill of supply', () => {
    const b = buildBill({ registered: false, rate: 3200, nights: 2 });
    expect(b.kind).toBe('bill_of_supply');
    expect(b.cgst + b.sgst).toBe(0);
    expect(b.total).toBe(6400);
  });
});

describe('format', () => {
  it('labels the financial year', () => {
    expect(finYear('2026-10-01')).toBe('26-27');
    expect(finYear('2027-03-31')).toBe('26-27');
    expect(finYear('2027-04-01')).toBe('27-28');
  });
  it('keeps only the last four Aadhaar digits', () => {
    expect(maskAadhaar('4821 7730 5196')).toBe('XXXX XXXX 5196');
    expect(maskAadhaar('12345')).toBeNull();
  });
  it('moves by months', () => {
    expect(addMonths('2026-10-03', -1)).toBe('2026-09-01');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
  });
});

const entry = (o) => ({ guests: 1, rooms: 1, guest_category: 'Domestic', residence: 'Delhi', purpose: 'Sightseeing', departed_at: null, ...o });

describe('police list (Act s.18A)', () => {
  const bookings = [
    { id: 'a', check_out: '2026-10-02' },
    { id: 'b', check_out: '2026-10-01' },
    { id: 'c', check_out: '2026-10-05' },
  ];
  const register = [
    entry({ booking_id: 'a', arrived_at: '2026-09-29T07:00:00Z', guests: 2 }),
    entry({ booking_id: 'b', arrived_at: '2026-09-30T07:00:00Z', departed_at: '2026-10-01T05:00:00Z' }),
    entry({ booking_id: 'c', arrived_at: '2026-10-01T07:00:00Z' }),
  ];
  it('lists everyone who slept here that night, not only arrivals', () => {
    const list = stayedOnNight(register, bookings, '2026-09-30');
    expect(list.map(e => e.booking_id)).toEqual(['a', 'b']);
  });
});

describe('monthly return (Annexure 11)', () => {
  const bookings = [{ id: 'x', check_out: '2026-10-02' }];
  const register = [
    entry({ booking_id: 'p', arrived_at: '2026-09-05T08:00:00Z', departed_at: '2026-09-07T05:00:00Z', guests: 2, guest_category: 'Local', residence: 'Jorhat', purpose: 'Holidaying' }),
    entry({ booking_id: 'q', arrived_at: '2026-09-12T08:00:00Z', departed_at: '2026-09-15T05:00:00Z', guest_category: 'Foreign', residence: 'France' }),
    entry({ booking_id: 'x', arrived_at: '2026-09-29T08:00:00Z', guests: 2 }),
    entry({ booking_id: 'r', arrived_at: '2026-08-30T08:00:00Z', departed_at: '2026-09-02T05:00:00Z', guests: 1 }),
  ];
  const m = monthlyReturn(register, bookings, '2026-09-01');
  it('counts guests who checked in during the month', () => {
    expect(m.byCategory.Local.guests).toBe(2);
    expect(m.byCategory.Foreign.guests).toBe(1);
    expect(m.byCategory.Domestic.guests).toBe(2); // x only; r arrived in August
    expect(m.total.guests).toBe(5);
  });
  it('counts person-nights inside the month only', () => {
    expect(m.byCategory.Local.nights).toBe(4);
    expect(m.byCategory.Foreign.nights).toBe(3);
    // x: 29 and 30 Sep = 2 nights x 2 guests; r: 1 Sep = 1 night
    expect(m.byCategory.Domestic.nights).toBe(5);
  });
  it('splits purposes into leisure and non-leisure', () => {
    expect(m.purposes.find(p => p.purpose === 'Holidaying').group).toBe('Leisure');
  });
  it('is due on the 7th of the next month', () => {
    expect(monthlyDueDate('2026-09-01')).toBe('2026-10-07');
  });
});

describe('alerts', () => {
  const base = { register: [], bookings: [], policeReports: [], monthlyReturns: [], formC: [], documents: [] };
  it('flags a missing police report when guests stayed last night', () => {
    const data = { ...base, bookings: [{ id: 'a', check_out: '2026-10-05' }], register: [entry({ booking_id: 'a', arrived_at: '2026-10-01T08:00:00Z' })] };
    const alerts = buildAlerts({ today: '2026-10-03', property: { tourism_reg_no: 'X' }, data });
    expect(alerts[0].title).toMatch(/police report/);
  });
  it('flags an overdue monthly return after the 7th', () => {
    const alerts = buildAlerts({ today: '2026-10-09', property: { tourism_reg_no: 'X' }, data: base });
    expect(alerts.find(a => a.title.startsWith('Monthly return')).sev).toBe('crit');
  });
  it('flags a document expiring within 30 days', () => {
    const data = { ...base, documents: [{ kind: 'Fire Safety Certificate', expires_on: '2026-10-20' }] };
    const alerts = buildAlerts({ today: '2026-10-03', property: { tourism_reg_no: 'X' }, data });
    expect(alerts.some(a => a.title.startsWith('Fire Safety Certificate'))).toBe(true);
  });
});
