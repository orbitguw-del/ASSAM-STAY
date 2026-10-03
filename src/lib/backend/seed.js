// Fictional sample data for demo mode, placed around today's date.
import { todayISO, addDays, addMonths, finYear, uid, sha256, nightsBetween } from '../format.js';
import { buildBill } from '../billing.js';
import { arrivalContent } from '../compliance.js';

// A squiggle that looks like a signature, the same every time for the same name.
export function fakeSignature(name) {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 160;
  const x = c.getContext('2d');
  let seed = 7;
  for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  x.strokeStyle = '#1C2A6B'; x.lineWidth = 4; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath();
  let px = 30, py = 92;
  x.moveTo(px, py);
  const strokes = 5 + (name.length % 5);
  for (let i = 0; i < strokes; i++) {
    const nx = px + 34 + rnd() * 22, ny = 50 + rnd() * 70;
    x.bezierCurveTo(px + 12, py - 60 * rnd(), nx - 16, ny + 50 * rnd(), nx, ny);
    px = nx; py = ny;
  }
  x.moveTo(30, 126);
  x.quadraticCurveTo(220, 140 + rnd() * 10, px + 20, 118);
  x.stroke();
  return c.toDataURL('image/png');
}

const at = (date, time) => new Date(`${date}T${time}:00`).toISOString();

export async function buildSeed() {
  const T = todayISO();
  const tenantId = uid(), propId = uid();
  const db = {
    tenants: [{ id: tenantId, name: 'Bamboo Grove Homestay', plan: 'demo' }],
    properties: [{
      id: propId, tenant_id: tenantId, name: 'Bamboo Grove Homestay', category: 'homestay',
      address: 'Kohora, Kaziranga, Golaghat, Assam', district: 'Golaghat',
      police_station: 'Kaziranga Police Station', police_contact: '',
      gstin: '18AAAAA0000A1Z5', tourism_reg_no: 'ATR/HS/2026/0142', tourism_reg_valid_to: '2029-07-14',
      atdc_member: false, invoice_prefix: 'BGH', created_at: new Date().toISOString(),
    }],
    rooms: [], bookings: [], signatures: [], register_entries: [], invoices: [], payments: [],
    counters: [], form_c: [], police_reports: [], monthly_returns: [], documents: [], audit_log: [],
  };
  const base = { tenant_id: tenantId, property_id: propId };

  const rooms = [['Bamboo 1', 2200], ['Bamboo 2', 2200], ['Tea Garden', 2800], ['River View', 3200], ['Family Cottage', 4500]]
    .map(([name, tariff], i) => ({ id: uid(), ...base, name, tariff, active: true, sort: i }));
  db.rooms = rooms;
  const R = n => rooms[n - 1];

  const staffSig = { id: uid(), ...base, kind: 'staff', signer_name: 'Manju Hazarika', image: fakeSignature('Manju Hazarika'), content_hash: await sha256('staff|Manju Hazarika'), signed_by: 'demo-user', signed_at: at(addDays(T, -60), '09:00') };
  db.signatures.push(staffSig);

  const counters = {};
  const next = (series, on) => {
    const fy = finYear(on), k = series + fy;
    counters[k] = (counters[k] || 0) + 1;
    return { fy, no: counters[k] };
  };

  async function addStay(s) {
    const booking = {
      id: uid(), ...base, room_id: R(s.room).id, guest_name: s.name, guests: s.guests, check_in: s.from, check_out: s.to,
      source: s.source, status: s.status, guest_category: s.cat, residence: s.residence, address: s.address,
      purpose: s.purpose, rate: R(s.room).tariff, advance: s.advance || 0, phone: '', created_at: at(addDays(s.from, -10), '10:00'),
    };
    db.bookings.push(booking);
    if (s.advance) {
      const { fy, no } = next('receipt', booking.created_at.slice(0, 10));
      db.payments.push({ id: uid(), ...base, booking_id: booking.id, receipt_no: `BGH/R/${fy}/${String(no).padStart(5, '0')}`, amount: s.advance, method: 'upi', received_on: booking.created_at.slice(0, 10) });
    }
    if (s.status !== 'in' && s.status !== 'out') return booking;

    const entry = {
      id: uid(), ...base, booking_id: booking.id, guest_name: s.name, address: s.address, guest_category: s.cat,
      residence: s.residence, purpose: s.purpose, id_type: s.idType, id_number: s.idNo, nationality: s.cat === 'Foreign' ? s.residence : 'Indian',
      passport_issued: s.passIssued || null, passport_expiry: s.passExpiry || null, visa_no: s.visa || null,
      guests: s.guests, rooms: 1, arrived_at: at(s.from, s.arrTime || '13:15'), departed_at: null, invoice_id: null,
      tax_amount: null, encashment_cert: null, remarks: s.remarks || null, staff_name: 'Manju Hazarika', sig_staff: staffSig.id,
    };
    const arr = { id: uid(), ...base, kind: 'arrival', signer_name: s.name, image: fakeSignature(s.name), content_hash: await sha256(arrivalContent(entry)), signed_by: 'demo-user', signed_at: entry.arrived_at };
    db.signatures.push(arr);
    entry.sig_arrival = arr.id;

    if (s.status === 'out') {
      const n = nightsBetween(s.from, s.to);
      const bill = buildBill({ registered: true, rate: R(s.room).tariff, nights: n, extras: s.extras || {}, on: s.to });
      const { fy, no } = next('invoice', s.to);
      const inv = { id: uid(), ...base, booking_id: booking.id, number: `BGH/${fy}/${String(no).padStart(6, '0')}`, fin_year: fy, kind: bill.kind, issued_on: s.to, guest_name: s.name, lines: bill.lines, taxable: bill.taxable, cgst: bill.cgst, sgst: bill.sgst, total: bill.total, created_at: at(s.to, '10:20') };
      db.invoices.push(inv);
      const due = bill.total - (s.advance || 0);
      if (due > 0) {
        const r = next('receipt', s.to);
        db.payments.push({ id: uid(), ...base, booking_id: booking.id, invoice_id: inv.id, receipt_no: `BGH/R/${r.fy}/${String(r.no).padStart(5, '0')}`, amount: due, method: 'upi', received_on: s.to });
      }
      const dep = { id: uid(), ...base, kind: 'departure', signer_name: s.name, image: fakeSignature(s.name + ' out'), content_hash: await sha256(inv.number), signed_by: 'demo-user', signed_at: at(s.to, '10:25') };
      db.signatures.push(dep);
      Object.assign(entry, { departed_at: dep.signed_at, sig_departure: dep.id, invoice_id: inv.id, tax_amount: bill.cgst + bill.sgst });
    }
    db.register_entries.push(entry);
    return booking;
  }

  // Last month: guests who have come and gone
  const pm = addMonths(T, -1), d = n => addDays(pm, n);
  const past = [
    { name: 'Ananya Das', address: 'Zoo Road, Guwahati, Assam', cat: 'Local', residence: 'Kamrup Metro', guests: 2, room: 3, from: d(4), to: d(6), purpose: 'Holidaying', idType: 'Aadhaar', idNo: 'XXXX XXXX 7714', source: 'Direct', extras: { dinner: 2 } },
    { name: 'Vikram Singh', address: 'C-Scheme, Jaipur, Rajasthan', cat: 'Domestic', residence: 'Rajasthan', guests: 2, room: 4, from: d(7), to: d(10), purpose: 'Sightseeing', idType: 'Aadhaar', idNo: 'XXXX XXXX 2209', source: 'MakeMyTrip', advance: 3000 },
    { name: 'Sophie Martin', address: 'Lyon, France', cat: 'Foreign', residence: 'France', guests: 1, room: 1, from: d(11), to: d(14), purpose: 'Sightseeing', idType: 'Passport', idNo: '19FR55021', passIssued: '2021-05-02', passExpiry: '2031-05-01', visa: 'eTV 4417 0912', source: 'Airbnb', remarks: 'Form C filed' },
    { name: 'Rohit and Kavya Menon', address: 'Panampilly Nagar, Kochi, Kerala', cat: 'Domestic', residence: 'Kerala', guests: 2, room: 2, from: d(13), to: d(15), purpose: 'Recreation', idType: 'Aadhaar', idNo: 'XXXX XXXX 6650', source: 'Booking.com' },
    { name: 'Bhaskar Gogoi', address: 'Chowkidinghee, Dibrugarh, Assam', cat: 'Local', residence: 'Dibrugarh', guests: 3, room: 5, from: d(17), to: d(18), purpose: 'Social', idType: 'Voter ID', idNo: 'XXXX 3381', source: 'Walk-in' },
    { name: 'Arjun Patel', address: 'Harrow, London, UK', cat: 'NRI', residence: 'United Kingdom', guests: 1, room: 4, from: d(19), to: d(22), purpose: 'Holidaying', idType: 'Passport', idNo: 'Z8812044', source: 'Booking.com' },
    { name: 'Neha Kapoor', address: 'Salt Lake, Kolkata, West Bengal', cat: 'Domestic', residence: 'West Bengal', guests: 2, room: 3, from: d(23), to: d(26), purpose: 'Business', idType: 'Aadhaar', idNo: 'XXXX XXXX 9038', source: 'Direct', extras: { breakfast: 6 } },
  ];
  for (const s of past) {
    if (s.to >= T) continue; // keep the sample in the past even early in a month
    await addStay({ ...s, status: 'out' });
  }

  // Now: two guests in house, two arriving today, more to come
  await addStay({ name: 'Rahul Sharma', address: 'Lajpat Nagar, New Delhi', cat: 'Domestic', residence: 'Delhi', guests: 2, room: 1, from: addDays(T, -2), to: addDays(T, 1), purpose: 'Sightseeing', idType: 'Aadhaar', idNo: 'XXXX XXXX 0847', source: 'Booking.com', status: 'in', advance: 3000, arrTime: '12:55' });
  await addStay({ name: 'Priyanka Bora', address: 'Na-Ali, Jorhat, Assam', cat: 'Local', residence: 'Jorhat', guests: 1, room: 3, from: addDays(T, -1), to: T, purpose: 'Social', idType: 'Aadhaar', idNo: 'XXXX XXXX 5521', source: 'Direct', status: 'in', advance: 1000, arrTime: '15:40' });
  await addStay({ name: 'Lena Hoffmann', address: 'Leipzig, Germany', cat: 'Foreign', residence: 'Germany', guests: 1, room: 4, from: T, to: addDays(T, 3), purpose: 'Sightseeing', source: 'Airbnb', status: 'confirmed', advance: 0 });
  await addStay({ name: 'Ankit and Meera Jain', address: 'Andheri West, Mumbai, Maharashtra', cat: 'Domestic', residence: 'Maharashtra', guests: 2, room: 2, from: T, to: addDays(T, 2), purpose: 'Holidaying', source: 'MakeMyTrip', status: 'confirmed', advance: 2000 });
  await addStay({ name: 'Dev family', address: 'Indiranagar, Bengaluru, Karnataka', cat: 'Domestic', residence: 'Karnataka', guests: 4, room: 5, from: addDays(T, 2), to: addDays(T, 5), purpose: 'Holidaying', source: 'Direct', status: 'confirmed', advance: 5000 });
  await addStay({ name: 'Siddharth Rao', address: 'Dubai, UAE', cat: 'NRI', residence: 'United Arab Emirates', guests: 1, room: 1, from: addDays(T, 3), to: addDays(T, 6), purpose: 'Social', source: 'Booking.com', status: 'confirmed' });
  await addStay({ name: 'Tanmoy Saikia', address: 'Beltola, Guwahati, Assam', cat: 'Local', residence: 'Kamrup Metro', guests: 2, room: 3, from: addDays(T, 4), to: addDays(T, 6), purpose: 'Recreation', source: 'Walk-in', status: 'confirmed' });

  // Serial numbers in arrival order, as a paper register would have them
  db.register_entries.sort((a, b) => a.arrived_at.localeCompare(b.arrived_at)).forEach((e, i) => { e.serial_no = i + 1; });

  db.counters = Object.entries(counters).map(([k, last_no]) => ({ property_id: propId, series: k.startsWith('invoice') ? 'invoice' : 'receipt', fin_year: k.replace(/^(invoice|receipt)/, ''), last_no }));

  // Police report sent for the night before last, so yesterday's is the one still due
  db.police_reports.push({ id: uid(), ...base, report_date: addDays(T, -2), guest_count: 2, channel: 'WhatsApp', snapshot: [], sent_at: at(addDays(T, -1), '08:05') });

  db.documents = [
    ['Tourism registration certificate (Form 3)', 'ATR/HS/2026/0142', '2026-07-15', '2029-07-14'],
    ['Fire Safety Certificate', 'FSC/GLT/2023/0391', '2023-10-21', addDays(T, 17)],
    ['FSSAI registration', '20326000000000', '2023-04-01', '2028-03-31'],
    ['Trade licence', 'KZP/TL/2026/112', '2026-04-01', '2027-03-31'],
  ].map(([kind, number, issued_on, expires_on]) => ({ id: uid(), ...base, kind, number, issued_on, expires_on, notes: 'Sample record' }));

  return db;
}
