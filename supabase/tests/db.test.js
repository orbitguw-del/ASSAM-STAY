// Runs the real migration in an in-memory Postgres (PGlite) with a stub of Supabase's auth schema,
// then checks the protections the law and the product depend on.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const DIR = new URL('../migrations/', import.meta.url);
const MIGRATIONS = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort().map(f => readFileSync(new URL(f, DIR), 'utf8'));
const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_B = '00000000-0000-0000-0000-00000000000b';
const USER_C = '00000000-0000-0000-0000-00000000000c';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

let db;

// Run SQL as a signed-in user, the way PostgREST does on Supabase.
async function as(user, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role;');
  }
}

async function setupProperty(user, name, prefix, rooms = 3, invite = 'PILOT-TEST') {
  const p = { name, category: 'homestay', invoice_prefix: prefix, gstin: '18AAAAA0000A1Z5', invite_code: invite,
    rooms: Array.from({ length: rooms }, (_, i) => ({ name: `Room ${i + 1}`, tariff: 2200 })) };
  const [{ id }] = await as(user, 'select public.setup_property($1::jsonb) as id', [JSON.stringify(p)]);
  const [prop] = await as(user, 'select * from public.properties where id = $1', [id]);
  const roomRows = await as(user, 'select * from public.rooms where property_id = $1 order by sort', [id]);
  return { prop, rooms: roomRows };
}

async function booking(user, prop, room, checkIn, checkOut, extra = {}) {
  const [b] = await as(user,
    `insert into public.bookings (tenant_id, property_id, room_id, guest_name, check_in, check_out, status)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [prop.tenant_id, prop.id, room.id, extra.name || 'Guest', checkIn, checkOut, extra.status || 'confirmed']);
  return b;
}

async function signature(user, prop, kind) {
  const [s] = await as(user,
    `insert into public.signatures (tenant_id, property_id, kind, signer_name, image, content_hash)
     values ($1, $2, $3, 'Signer', $4, 'hash') returning *`, [prop.tenant_id, prop.id, kind, PNG]);
  return s;
}

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${USER_A}'), ('${USER_B}'), ('${USER_C}');
  `);
  for (const sql of MIGRATIONS) await db.exec(sql);
  await db.exec(`insert into public.invite_codes (code, max_uses) values ('PILOT-TEST', 10), ('ONE-USE-1', 1), ('OLD-CODE-1', 5);
                 update public.invite_codes set expires_on = '2020-01-01' where code = 'OLD-CODE-1';`);
}, 60000);

describe('database protections', () => {
  let A, B;
  beforeAll(async () => {
    A = await setupProperty(USER_A, 'Bamboo Grove', 'BGH');
    B = await setupProperty(USER_B, 'River Bend', 'RBH');
  });

  it('refuses a second booking that overlaps the same room', async () => {
    await booking(USER_A, A.prop, A.rooms[0], '2026-10-01', '2026-10-04');
    await expect(booking(USER_A, A.prop, A.rooms[0], '2026-10-03', '2026-10-05'))
      .rejects.toMatchObject({ code: '23P01' });
  });

  it('allows back-to-back stays and a booking over a cancelled one', async () => {
    await booking(USER_A, A.prop, A.rooms[0], '2026-10-04', '2026-10-06');
    await booking(USER_A, A.prop, A.rooms[1], '2026-10-10', '2026-10-12', { status: 'cancelled' });
    await booking(USER_A, A.prop, A.rooms[1], '2026-10-10', '2026-10-12');
  });

  it('keeps one homestay from seeing another', async () => {
    const seen = await as(USER_B, 'select * from public.bookings');
    expect(seen.every(r => r.tenant_id === B.prop.tenant_id)).toBe(true);
    const props = await as(USER_B, 'select * from public.properties');
    expect(props.map(p => p.name)).toEqual(['River Bend']);
  });

  it('refuses writing into another homestay', async () => {
    await expect(booking(USER_B, A.prop, A.rooms[2], '2026-11-01', '2026-11-02'))
      .rejects.toThrow(/row-level security/);
  });

  it('refuses a booking that points at another homestay\'s room', async () => {
    await expect(booking(USER_B, B.prop, A.rooms[2], '2026-11-01', '2026-11-02'))
      .rejects.toThrow();
  });

  it('blocks a 9th room for a homestay', async () => {
    for (let i = 4; i <= 8; i++) {
      await as(USER_A, 'insert into public.rooms (tenant_id, property_id, name, tariff) values ($1, $2, $3, 2000)',
        [A.prop.tenant_id, A.prop.id, `Extra ${i}`]);
    }
    await expect(as(USER_A, 'insert into public.rooms (tenant_id, property_id, name, tariff) values ($1, $2, $3, 2000)',
      [A.prop.tenant_id, A.prop.id, 'Ninth'])).rejects.toThrow(/at most 8/);
  });

  it('needs at least 2 rooms at setup', async () => {
    await expect(setupProperty(USER_C, 'Tiny', 'TNY', 1)).rejects.toThrow(/at least 2 rooms/);
  });

  describe('pilot sign-up control', () => {
    it('refuses setup without a valid invite code', async () => {
      await expect(setupProperty(USER_C, 'Nope', 'NOP', 3, 'MADE-UP-9')).rejects.toThrow(/invite code is not valid/);
      await expect(setupProperty(USER_C, 'Nope', 'NOP', 3, 'OLD-CODE-1')).rejects.toThrow(/invite code is not valid/);
    });

    it('lets each code be used only as often as allowed, and one homestay per account', async () => {
      await setupProperty(USER_C, 'Hill View', 'HVH', 2, 'one-use-1');
      await expect(setupProperty(USER_C, 'Second', 'SEC', 2)).rejects.toThrow(/already has a homestay/);
      const [{ used }] = (await db.query(`select used from public.invite_codes where code = 'ONE-USE-1'`)).rows;
      expect(used).toBe(1);
    });

    it('keeps invite codes unreadable through the API', async () => {
      await expect(as(USER_A, 'select * from public.invite_codes')).rejects.toThrow(/permission denied/);
    });
  });

  it('numbers invoices in sequence per financial year, at most 16 characters', async () => {
    const inv = { property_id: A.prop.id, guest_name: 'Guest', lines: [], taxable: 2200, cgst: 55, sgst: 55, total: 2310, issued_on: '2026-10-01' };
    const [a] = await as(USER_A, 'select * from public.issue_invoice($1::jsonb)', [JSON.stringify(inv)]);
    const [b] = await as(USER_A, 'select * from public.issue_invoice($1::jsonb)', [JSON.stringify(inv)]);
    const [c] = await as(USER_A, 'select * from public.issue_invoice($1::jsonb)', [JSON.stringify({ ...inv, issued_on: '2027-04-02' })]);
    expect([a.number, b.number, c.number]).toEqual(['BGH/26-27/000001', 'BGH/26-27/000002', 'BGH/27-28/000001']);
    expect(a.kind).toBe('tax_invoice');
  });

  it('refuses invoice totals that do not add up', async () => {
    const bad = { property_id: A.prop.id, guest_name: 'Guest', lines: [], taxable: 2200, cgst: 55, sgst: 55, total: 9999 };
    await expect(as(USER_A, 'select * from public.issue_invoice($1::jsonb)', [JSON.stringify(bad)])).rejects.toThrow(/totals_add_up/);
  });

  it('does not let anyone edit an issued invoice', async () => {
    await as(USER_A, `update public.invoices set total = 1 where property_id = $1`, [A.prop.id]);
    const rows = await as(USER_A, 'select total from public.invoices where property_id = $1', [A.prop.id]);
    expect(rows.every(r => Number(r.total) !== 1)).toBe(true);
  });

  it('numbers receipts', async () => {
    const [p] = await as(USER_A, 'select * from public.record_payment($1::jsonb)',
      [JSON.stringify({ property_id: A.prop.id, amount: 1000, method: 'upi', received_on: '2026-10-01' })]);
    expect(p.receipt_no).toBe('BGH/R/26-27/00001');
  });

  describe('tourist register', () => {
    let b, arrival, staff;
    beforeAll(async () => {
      b = await booking(USER_A, A.prop, A.rooms[2], '2026-10-01', '2026-10-03', { name: 'Lena' });
      arrival = await signature(USER_A, A.prop, 'arrival');
      staff = await signature(USER_A, A.prop, 'staff');
    });
    const entry = (overrides = {}) => [
      `insert into public.register_entries (tenant_id, property_id, booking_id, guest_name, address, guest_category,
         residence, purpose, id_type, id_number, guests, staff_name, sig_arrival, sig_staff)
       values ($1, $2, $3, 'Lena', 'Leipzig', 'Foreign', 'Germany', 'Sightseeing', $4, $5, 1, 'Manju', $6, $7) returning *`,
      [A.prop.tenant_id, A.prop.id, overrides.booking || b.id, overrides.idType || 'Passport', overrides.idNo || 'C4X91K27', arrival.id, staff.id]];

    it('refuses a full Aadhaar number', async () => {
      await expect(as(USER_A, ...entry({ idType: 'Aadhaar', idNo: '1234 5678 9012' }))).rejects.toThrow(/aadhaar_masked/);
    });

    it('gives each entry the next serial number', async () => {
      const [e] = await as(USER_A, ...entry());
      expect(e.serial_no).toBe(1);
    });

    it('refuses a departure without the guest\'s departure signature', async () => {
      await expect(as(USER_A, `update public.register_entries set departed_at = now() where booking_id = $1`, [b.id]))
        .rejects.toThrow(/departure_signed/);
      const dep = await signature(USER_A, A.prop, 'departure');
      await as(USER_A, `update public.register_entries set departed_at = now(), sig_departure = $2 where booking_id = $1`, [b.id, dep.id]);
    });

    it('keeps signatures unchangeable', async () => {
      await as(USER_A, `update public.signatures set signer_name = 'Someone else' where id = $1`, [arrival.id]);
      const [s] = await as(USER_A, 'select signer_name from public.signatures where id = $1', [arrival.id]);
      expect(s.signer_name).toBe('Signer');
    });
  });

  it('writes an audit trail', async () => {
    const rows = await as(USER_A, `select distinct table_name from public.audit_log order by 1`);
    expect(rows.map(r => r.table_name)).toEqual(expect.arrayContaining(['bookings', 'invoices', 'register_entries', 'rooms']));
  });

  it('reads legal values from the rules table', async () => {
    const [r] = await as(USER_A, `select public.rule_value('homestay.max_rooms') as v`);
    expect(r.v).toBe(8);
  });
});
