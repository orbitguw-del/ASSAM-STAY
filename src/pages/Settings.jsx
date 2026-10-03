import { useState } from 'react';
import { useApp } from '../state.jsx';
import { updateProperty, saveRoom, saveSignature } from '../lib/api.js';
import { inr, todayISO } from '../lib/format.js';
import { ruleValue } from '../lib/rules.js';
import { Field, PageHead, ErrorBox, SigImage } from '../components/ui.jsx';
import SignaturePad from '../components/SignaturePad.jsx';
import { useStaffSignature } from './CheckIn.jsx';
import { downloadFile } from './Register.jsx';
import { getLockSettings, setPin, removePin, LOCK_MINUTES, SIGN_OUT_MINUTES } from '../lib/lock.js';

function ScreenLock({ uid, live, toast }) {
  const [current, setCurrent] = useState(() => getLockSettings(uid));
  const [pin, setPinValue] = useState('');
  const [again, setAgain] = useState('');
  const [minutes, setMinutes] = useState(current?.minutes || 10);
  const [error, setError] = useState(null);

  async function save(e) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,6}$/.test(pin)) { setError('Use 4 to 6 digits.'); return; }
    if (pin !== again) { setError('The two PINs do not match.'); return; }
    await setPin(uid, pin, Number(minutes));
    setCurrent(getLockSettings(uid));
    setPinValue(''); setAgain('');
    toast(`Screen lock on: locks after ${minutes} minutes without use.`);
  }

  return (
    <div className="card stack">
      <h3>Screen lock (shared phones)</h3>
      {current ? (
        <div className="row-between">
          <span>On. Locks after {current.minutes} minutes without use.</span>
          <button className="btn small" onClick={() => { removePin(uid); setCurrent(null); toast('Screen lock turned off.'); }}>Turn off</button>
        </div>
      ) : (
        <p className="hint">Off. {live ? `Without a PIN you are signed out after ${SIGN_OUT_MINUTES} minutes without use.` : 'Set a PIN so the register cannot be opened by someone else on this phone.'}</p>
      )}
      <form className="stack" onSubmit={save}>
        <div className="grid3">
          <Field label={current ? 'New PIN' : 'PIN'} id="lk-pin"><input id="lk-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={e => setPinValue(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="PIN again" id="lk-again"><input id="lk-again" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={again} onChange={e => setAgain(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Lock after" id="lk-min"><select id="lk-min" value={minutes} onChange={e => setMinutes(e.target.value)}>{LOCK_MINUTES.map(m => <option key={m} value={m}>{m} minutes</option>)}</select></Field>
        </div>
        <ErrorBox error={error} />
        <button className="btn">{current ? 'Change PIN' : 'Turn on screen lock'}</button>
      </form>
      <p className="hint">The PIN stays on this phone. Five wrong tries sign the account out.</p>
    </div>
  );
}

// Changes the Directorate must be told about within 30 days (Act s.7, Rule 5, Form 7).
const FORM7_FIELDS = ['name', 'category', 'address'];

export default function Settings() {
  const { backend, ctx, data, property, refresh, toast, staffName, user } = useApp();
  const staffSig = useStaffSignature();
  const [p, setP] = useState({ ...property });
  const [rooms, setRooms] = useState(data.rooms.map(r => ({ ...r })));
  const [newRoom, setNewRoom] = useState({ name: '', tariff: '' });
  const [resign, setResign] = useState(false);
  const [sig, setSig] = useState(null);
  const [error, setError] = useState(null);
  const [resetting, setResetting] = useState(false);
  const set = (k, v) => setP(prev => ({ ...prev, [k]: v }));

  async function saveProperty(e) {
    e.preventDefault();
    setError(null);
    const patch = {
      name: p.name.trim(), category: p.category, address: p.address || null, district: p.district || null,
      police_station: p.police_station || null, police_contact: p.police_contact || null, gstin: (p.gstin || '').trim().toUpperCase() || null,
      tourism_reg_no: p.tourism_reg_no || null, tourism_reg_valid_to: p.tourism_reg_valid_to || null, atdc_member: !!p.atdc_member,
    };
    try {
      const saved = await updateProperty(backend, property, patch);
      await refresh(saved);
      const form7 = FORM7_FIELDS.some(k => (property[k] || '') !== (patch[k] || ''));
      toast(form7 ? 'Saved. Tell the Directorate of Tourism about this change within 30 days (Form 7).' : 'Property details saved.');
    } catch (err) { setError(err.message); }
  }

  async function saveRoomRow(r) {
    setError(null);
    try {
      await saveRoom(backend, ctx, r);
      await refresh();
      toast(`${r.name} saved.`);
    } catch (err) { setError(err.message); }
  }

  async function addRoom(e) {
    e.preventDefault();
    setError(null);
    if (!newRoom.name.trim() || !(Number(newRoom.tariff) >= 0)) { setError('Enter the room name and tariff.'); return; }
    try {
      await saveRoom(backend, ctx, { name: newRoom.name.trim(), tariff: Number(newRoom.tariff), sort: data.rooms.length });
      await refresh();
      setRooms((await backend.select('rooms', { property_id: property.id })).sort((a, b) => a.sort - b.sort));
      setNewRoom({ name: '', tariff: '' });
      toast('Room added. Report the change in room count to the Directorate within 30 days (Form 7).');
    } catch (err) { setError(err.message); }
  }

  async function saveStaffSig() {
    if (!sig) { setError('Sign first.'); return; }
    try {
      await saveSignature(backend, ctx, { kind: 'staff', signerName: staffName, image: sig, content: `staff|${staffName}` });
      await refresh();
      setResign(false);
      toast('Your signature is saved for the register.');
    } catch (err) { setError(err.message); }
  }

  async function exportData() {
    const dump = backend.exportAll ? await backend.exportAll() : Object.fromEntries(await Promise.all(
      ['properties', 'rooms', 'bookings', 'register_entries', 'invoices', 'payments', 'form_c', 'police_reports', 'monthly_returns', 'documents']
        .map(async t => [t, await backend.select(t, t === 'properties' ? { id: property.id } : { property_id: property.id })])));
    downloadFile(`homestay-backup-${property.invoice_prefix}-${todayISO()}.json`, JSON.stringify(dump, null, 2), 'application/json');
  }

  const max = ruleValue(p.category + '.max_rooms');

  return (
    <div className="stack">
      <PageHead title="Settings" back />
      <form className="card stack" onSubmit={saveProperty}>
        <h3>Property</h3>
        <Field label="Name" id="st-name"><input id="st-name" value={p.name} onChange={e => set('name', e.target.value)} /></Field>
        <div className="grid2">
          <Field label="Category" id="st-cat" hint={max ? `Up to ${max} rooms` : 'At least 2 rooms; breakfast in every rate'}>
            <select id="st-cat" value={p.category} onChange={e => set('category', e.target.value)}><option value="homestay">Homestay</option><option value="bnb">Bed and breakfast</option></select>
          </Field>
          <Field label="District" id="st-dist"><input id="st-dist" value={p.district || ''} onChange={e => set('district', e.target.value)} /></Field>
        </div>
        <Field label="Address" id="st-addr"><input id="st-addr" value={p.address || ''} onChange={e => set('address', e.target.value)} /></Field>
        <div className="grid2">
          <Field label="Police station (for the daily report)" id="st-ps"><input id="st-ps" value={p.police_station || ''} onChange={e => set('police_station', e.target.value)} /></Field>
          <Field label="Police station WhatsApp or email" id="st-pc"><input id="st-pc" value={p.police_contact || ''} onChange={e => set('police_contact', e.target.value)} /></Field>
        </div>
        <div className="grid2">
          <Field label="Tourism registration no. (Form 3)" id="st-reg"><input id="st-reg" value={p.tourism_reg_no || ''} onChange={e => set('tourism_reg_no', e.target.value)} /></Field>
          <Field label="Valid until" id="st-regto"><input id="st-regto" type="date" value={p.tourism_reg_valid_to || ''} onChange={e => set('tourism_reg_valid_to', e.target.value)} /></Field>
        </div>
        <Field label="GSTIN" id="st-gst" hint="Leave empty if not registered for GST: the app then issues bills of supply with no GST."><input id="st-gst" value={p.gstin || ''} maxLength={15} onChange={e => set('gstin', e.target.value)} /></Field>
        <label className="check"><input type="checkbox" checked={!!p.atdc_member} onChange={e => set('atdc_member', e.target.checked)} /> Aamaar Aalohi member (ATDC)</label>
        <p className="hint">Invoice prefix: <span className="mono">{property.invoice_prefix}</span> (fixed, so numbers stay in one series).</p>
        <button className="btn primary">Save property</button>
      </form>

      <div className="card stack">
        <h3>Rooms and tariffs</h3>
        {rooms.map((r, i) => (
          <div className="inline" key={r.id}>
            <input aria-label="Room name" value={r.name} onChange={e => setRooms(rooms.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input aria-label="Tariff" type="number" min="0" step="50" className="narrow" value={r.tariff} onChange={e => setRooms(rooms.map((x, j) => (j === i ? { ...x, tariff: e.target.value } : x)))} />
            <label className="check"><input type="checkbox" checked={r.active} onChange={e => setRooms(rooms.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} /> Let</label>
            <button className="btn small" onClick={() => saveRoomRow(r)}>Save</button>
          </div>
        ))}
        <form className="inline" onSubmit={addRoom}>
          <input aria-label="New room name" placeholder="New room" value={newRoom.name} onChange={e => setNewRoom({ ...newRoom, name: e.target.value })} />
          <input aria-label="New room tariff" type="number" min="0" step="50" className="narrow" placeholder="Tariff" value={newRoom.tariff} onChange={e => setNewRoom({ ...newRoom, tariff: e.target.value })} />
          <button className="btn small">Add room</button>
        </form>
        <p className="hint">Tariffs are the displayed prices. Charging more needs a recorded reason at check-out. {data.rooms.filter(r => r.active).length} rooms let{max ? ` of ${max} allowed` : ''}; the {max}-room limit is enforced by the database. Current tariffs: {data.rooms.map(r => `${r.name} ${inr(r.tariff)}`).join(', ')}.</p>
      </div>

      <div className="card stack">
        <h3>Your signature (register column 12)</h3>
        <p className="hint">Signed in as {staffName}{backend.mode === 'supabase' ? ` (${user.email})` : ''}.</p>
        {staffSig && !resign ? (
          <div className="inline"><SigImage sig={staffSig} alt="Your saved signature" /><button className="btn small" onClick={() => setResign(true)}>Sign again</button></div>
        ) : (
          <>
            <SignaturePad label={`Staff signature · ${staffName}`} onChange={setSig} />
            <button className="btn" onClick={saveStaffSig}>Save signature</button>
          </>
        )}
      </div>

      <ErrorBox error={error} />

      <ScreenLock uid={user.id} live={backend.mode === 'supabase'} toast={toast} />

      <div className="card stack">
        <h3>Data</h3>
        <button className="btn" onClick={exportData}>Download a backup (JSON)</button>
        {backend.mode === 'demo' ? (
          resetting ? (
            <div className="box warn">Reset the demo? Your changes in this browser are replaced with fresh sample data.
              <div className="actions"><button className="btn danger" onClick={async () => { await backend.reset(); window.location.hash = '#/'; window.location.reload(); }}>Reset demo</button><button className="btn" onClick={() => setResetting(false)}>Keep my changes</button></div>
            </div>
          ) : <button className="btn" onClick={() => setResetting(true)}>Reset demo data</button>
        ) : <button className="btn" onClick={() => backend.signOut()}>Sign out</button>}
        {backend.mode === 'demo' && <p className="hint">Demo mode: data lives only in this browser. Connect Supabase (see README) to use it for real.</p>}
      </div>
    </div>
  );
}
