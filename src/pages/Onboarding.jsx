import { useState } from 'react';
import { useApp } from '../state.jsx';
import { setupProperty } from '../lib/api.js';
import { ruleValue } from '../lib/rules.js';
import { Field, ErrorBox } from '../components/ui.jsx';

export default function Onboarding() {
  const { backend, boot } = useApp();
  const [p, setP] = useState({
    name: '', category: 'homestay', district: '', address: '', police_station: '', police_contact: '',
    gstin: '', tourism_reg_no: '', tourism_reg_valid_to: '', invoice_prefix: '', invite_code: '',
  });
  const [rooms, setRooms] = useState([{ name: 'Room 1', tariff: 2000 }, { name: 'Room 2', tariff: 2000 }]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setP(prev => ({ ...prev, [k]: v }));
  const max = ruleValue(p.category + '.max_rooms');
  const min = ruleValue(p.category + '.min_rooms') || 2;

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!p.invite_code.trim()) { setError('Enter your pilot invite code. Ask Storey Labs if you do not have one.'); return; }
    if (!p.name.trim()) { setError('Enter the homestay name.'); return; }
    if (!/^[A-Z0-9]{2,3}$/.test(p.invoice_prefix)) { setError('The bill prefix is 2 or 3 capital letters or digits, e.g. BGH. Bill numbers then fit the 16-character GST limit.'); return; }
    if (rooms.length < min) { setError(`Add at least ${min} rooms.`); return; }
    setBusy(true);
    try {
      await setupProperty(backend, { ...p, rooms: rooms.map(r => ({ name: r.name.trim(), tariff: Number(r.tariff) })) });
      await boot();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <div className="gamosa" aria-hidden="true" />
      <form className="auth-body stack" onSubmit={submit}>
        <h1>Set up your homestay</h1>
        <p className="hint">Takes about five minutes. You can change everything later except the bill prefix.</p>
        <Field label="Pilot invite code" id="ob-invite" hint="From Storey Labs, e.g. KAZIRANGA-01">
          <input id="ob-invite" value={p.invite_code} autoComplete="off" onChange={e => set('invite_code', e.target.value.toUpperCase())} />
        </Field>
        <Field label="Homestay name" id="ob-name"><input id="ob-name" value={p.name} onChange={e => set('name', e.target.value)} /></Field>
        <div className="grid2">
          <Field label="Category" id="ob-cat"><select id="ob-cat" value={p.category} onChange={e => set('category', e.target.value)}><option value="homestay">Homestay (2 to 8 rooms)</option><option value="bnb">Bed and breakfast</option></select></Field>
          <Field label="District" id="ob-dist"><input id="ob-dist" value={p.district} onChange={e => set('district', e.target.value)} /></Field>
        </div>
        <Field label="Address" id="ob-addr"><input id="ob-addr" value={p.address} onChange={e => set('address', e.target.value)} /></Field>
        <div className="grid2">
          <Field label="Police station" id="ob-ps"><input id="ob-ps" value={p.police_station} onChange={e => set('police_station', e.target.value)} /></Field>
          <Field label="Police station WhatsApp or email" id="ob-pc"><input id="ob-pc" value={p.police_contact} onChange={e => set('police_contact', e.target.value)} /></Field>
        </div>
        <div className="grid2">
          <Field label="Tourism registration no." id="ob-reg" hint="Leave empty if you have applied but not received it"><input id="ob-reg" value={p.tourism_reg_no} onChange={e => set('tourism_reg_no', e.target.value)} /></Field>
          <Field label="Valid until" id="ob-regto"><input id="ob-regto" type="date" value={p.tourism_reg_valid_to} onChange={e => set('tourism_reg_valid_to', e.target.value)} /></Field>
        </div>
        <div className="grid2">
          <Field label="GSTIN" id="ob-gst" hint="Empty = bills of supply, no GST"><input id="ob-gst" value={p.gstin} maxLength={15} onChange={e => set('gstin', e.target.value.toUpperCase())} /></Field>
          <Field label="Bill prefix" id="ob-prefix" hint="2 or 3 letters, e.g. BGH"><input id="ob-prefix" value={p.invoice_prefix} maxLength={3} onChange={e => set('invoice_prefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></Field>
        </div>
        <h3>Rooms and tariffs</h3>
        {rooms.map((r, i) => (
          <div className="inline" key={i}>
            <input aria-label={`Room ${i + 1} name`} value={r.name} onChange={e => setRooms(rooms.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input aria-label={`Room ${i + 1} tariff`} className="narrow" type="number" min="0" step="50" value={r.tariff} onChange={e => setRooms(rooms.map((x, j) => (j === i ? { ...x, tariff: e.target.value } : x)))} />
            {rooms.length > 1 && <button type="button" className="btn small" onClick={() => setRooms(rooms.filter((_, j) => j !== i))} aria-label={`Remove room ${i + 1}`}>×</button>}
          </div>
        ))}
        <button type="button" className="btn small" disabled={max && rooms.length >= max} onClick={() => setRooms([...rooms, { name: `Room ${rooms.length + 1}`, tariff: 2000 }])}>Add room</button>
        {max && <p className="hint">A homestay can have {min} to {max} lettable rooms (Rules 2026, Rule 2(i)).</p>}
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy}>{busy ? 'Setting up…' : 'Create my homestay'}</button>
      </form>
    </div>
  );
}
