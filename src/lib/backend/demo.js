// Demo backend: keeps data in this browser's localStorage and copies the database's protections
// (no double booking, room limit, register serials, masked Aadhaar, signed departure,
// immutable invoices and signatures) so the demo behaves like the real thing.
import { uid, finYear, todayISO } from '../format.js';
import { ruleValue } from '../rules.js';
import { buildSeed } from './seed.js';

const KEY = 'homestay-demo-v1';
const IMMUTABLE = new Set(['signatures', 'invoices', 'payments']);

export class DbError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

const clone = v => JSON.parse(JSON.stringify(v));
const matches = (row, match) => Object.entries(match).every(([k, v]) => row[k] === v);

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

export function createDemoBackend() {
  let db = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or blocked: keep in memory */ } };

  const checks = {
    rooms(row) {
      if (!row.active) return;
      const prop = db.properties.find(p => p.id === row.property_id);
      const max = ruleValue(prop.category + '.max_rooms');
      const others = db.rooms.filter(r => r.property_id === row.property_id && r.active && r.id !== row.id).length;
      if (max && others + 1 > max) throw new DbError(`A ${prop.category} can have at most ${max} lettable rooms under the Assam Tourism Accommodation Rules 2026. Change the property category first (Form 7).`, 'P0001');
    },
    bookings(row) {
      if (!(row.check_out > row.check_in)) throw new DbError('Check-out must be after check-in.', '23514');
      if (row.status === 'cancelled') return;
      const clash = db.bookings.find(b => b.id !== row.id && b.room_id === row.room_id && b.status !== 'cancelled'
        && row.check_in < b.check_out && row.check_out > b.check_in);
      if (clash) throw new DbError('no_double_booking', '23P01');
    },
    register_entries(row) {
      if (row.id_type === 'Aadhaar' && !/^XXXX XXXX \d{4}$/.test(row.id_number)) throw new DbError('Only the masked Aadhaar number can be stored.', '23514');
      if (!row.sig_arrival || !row.sig_staff) throw new DbError('The guest and staff must sign at arrival (Annexure 10, columns 9 and 12).', '23502');
      if (row.departed_at && !row.sig_departure) throw new DbError('The guest must sign at departure (Annexure 10, column 14).', '23514');
    },
  };

  function nextNumber(propertyId, series, on) {
    const fy = finYear(on);
    let c = db.counters.find(x => x.property_id === propertyId && x.series === series && x.fin_year === fy);
    if (!c) { c = { property_id: propertyId, series, fin_year: fy, last_no: 0 }; db.counters.push(c); }
    c.last_no += 1;
    return { fy, no: c.last_no };
  }

  function audit(table, action, oldRow, newRow) {
    if (!['rooms', 'bookings', 'register_entries', 'invoices', 'payments'].includes(table)) return;
    db.audit_log.push({ id: db.audit_log.length + 1, table_name: table, row_id: (newRow || oldRow).id, action, old_row: oldRow, new_row: newRow, at: new Date().toISOString() });
  }

  function insertRow(table, row) {
    const r = { id: uid(), created_at: new Date().toISOString(), ...row };
    checks[table]?.(r);
    if (table === 'register_entries') {
      r.serial_no = 1 + Math.max(0, ...db.register_entries.filter(e => e.property_id === r.property_id).map(e => e.serial_no));
    }
    db[table].push(r);
    audit(table, 'INSERT', null, r);
    return r;
  }

  return {
    mode: 'demo',
    async init() {
      if (!db) { db = await buildSeed(); save(); }
      return { user: { id: 'demo-user', email: 'demo@homestay.local' }, staffName: 'Manju Hazarika' };
    },
    async listProperties() { return clone(db.properties); },
    async getRules() { return []; },
    async select(table, match = {}) { return clone(db[table].filter(r => matches(r, match))); },
    async insert(table, row) { const r = insertRow(table, row); save(); return clone(r); },
    async update(table, id, patch) {
      if (IMMUTABLE.has(table)) throw new DbError('This record cannot be changed once written.', '42501');
      const i = db[table].findIndex(r => r.id === id);
      if (i < 0) throw new DbError('Record not found.', 'PGRST116');
      const next = { ...db[table][i], ...patch };
      checks[table]?.(next);
      audit(table, 'UPDATE', db[table][i], next);
      db[table][i] = next;
      save();
      return clone(next);
    },
    async rpc(name, args) {
      if (name === 'issue_invoice') {
        const p = args.p_invoice, prop = db.properties.find(x => x.id === p.property_id);
        const on = p.issued_on || todayISO();
        const { fy, no } = nextNumber(prop.id, 'invoice', on);
        const registered = !!prop.gstin;
        if (Math.abs(p.total - (p.taxable + (p.cgst || 0) + (p.sgst || 0))) > 0.001) throw new DbError('Invoice totals do not add up.', '23514');
        if (!registered && (p.cgst || p.sgst)) throw new DbError('A bill of supply cannot carry GST.', '23514');
        const r = insertRow('invoices', { ...p, tenant_id: prop.tenant_id, number: `${prop.invoice_prefix}/${fy}/${String(no).padStart(6, '0')}`, fin_year: fy, kind: registered ? 'tax_invoice' : 'bill_of_supply', issued_on: on });
        save();
        return clone(r);
      }
      if (name === 'record_payment') {
        const p = args.p_payment, prop = db.properties.find(x => x.id === p.property_id);
        const on = p.received_on || todayISO();
        const { fy, no } = nextNumber(prop.id, 'receipt', on);
        const r = insertRow('payments', { ...p, tenant_id: prop.tenant_id, receipt_no: `${prop.invoice_prefix}/R/${fy}/${String(no).padStart(5, '0')}`, received_on: on });
        save();
        return clone(r);
      }
      throw new DbError(`Unknown function ${name}`, '42883');
    },
    async reset() { db = await buildSeed(); save(); },
    async exportAll() { return clone(db); },
  };
}
