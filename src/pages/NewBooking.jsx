import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../state.jsx';
import { createBooking } from '../lib/api.js';
import { todayISO, addDays, fmtShort, inr } from '../lib/format.js';
import { SOURCES, PAYMENT_METHODS } from '../lib/rules.js';
import { Field, PageHead, ErrorBox } from '../components/ui.jsx';

export default function NewBooking() {
  const { backend, ctx, data, refresh, toast } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const rooms = data.rooms.filter(r => r.active);
  const first = rooms.find(r => r.id === params.get('room')) || rooms[0];
  const [f, setF] = useState({
    guest_name: '', phone: '', guests: 2, room_id: first?.id, check_in: params.get('date') || todayISO(), nights: 1,
    source: 'Direct', rate: first?.tariff || 0, advance: 0, advance_method: 'upi', notes: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const room = data.rooms.find(r => r.id === f.room_id);
  const checkOut = addDays(f.check_in, Math.max(1, Number(f.nights) || 1));

  async function save(e) {
    e.preventDefault();
    setError(null);
    if (!f.guest_name.trim()) { setError('Enter the guest name.'); return; }
    setBusy(true);
    try {
      await createBooking(backend, ctx, { ...f, check_out: checkOut });
      await refresh();
      toast(`Booked ${room.name} for ${f.guest_name.trim()}, ${fmtShort(f.check_in)} to ${fmtShort(checkOut)}.`);
      nav('/calendar');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={save}>
      <PageHead title="New booking" back />
      <Field label="Guest name" id="nb-name"><input id="nb-name" value={f.guest_name} onChange={e => set('guest_name', e.target.value)} placeholder="Full name" autoFocus /></Field>
      <div className="grid2">
        <Field label="Phone" id="nb-phone"><input id="nb-phone" inputMode="tel" value={f.phone} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label="Guests" id="nb-guests"><input id="nb-guests" type="number" min="1" max="20" value={f.guests} onChange={e => set('guests', e.target.value)} /></Field>
      </div>
      <div className="grid2">
        <Field label="Room" id="nb-room">
          <select id="nb-room" value={f.room_id} onChange={e => { const r = data.rooms.find(x => x.id === e.target.value); set('room_id', r.id); set('rate', r.tariff); }}>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({inr(r.tariff)})</option>)}
          </select>
        </Field>
        <Field label="Channel" id="nb-source">
          <select id="nb-source" value={f.source} onChange={e => set('source', e.target.value)}>{SOURCES.map(s => <option key={s}>{s}</option>)}</select>
        </Field>
      </div>
      <div className="grid2">
        <Field label="Check-in" id="nb-in"><input id="nb-in" type="date" value={f.check_in} onChange={e => set('check_in', e.target.value)} /></Field>
        <Field label="Nights" id="nb-nights" hint={`Check-out ${fmtShort(checkOut)}`}><input id="nb-nights" type="number" min="1" max="60" value={f.nights} onChange={e => set('nights', e.target.value)} /></Field>
      </div>
      <div className="grid2">
        <Field label="Rate per night" id="nb-rate" hint={Number(f.rate) > Number(room?.tariff) ? 'Above the displayed tariff' : `Tariff ${inr(room?.tariff)}`}>
          <input id="nb-rate" type="number" min="0" step="50" value={f.rate} onChange={e => set('rate', e.target.value)} />
        </Field>
        <Field label="Advance received" id="nb-adv"><input id="nb-adv" type="number" min="0" step="100" value={f.advance} onChange={e => set('advance', e.target.value)} /></Field>
      </div>
      {Number(f.advance) > 0 && (
        <Field label="Advance paid by" id="nb-method">
          <select id="nb-method" value={f.advance_method} onChange={e => set('advance_method', e.target.value)}>{PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
      )}
      <Field label="Notes" id="nb-notes"><input id="nb-notes" value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
      <ErrorBox error={error} />
      <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save booking'}</button>
      {Number(f.advance) > 0 && <p className="hint">A numbered receipt is issued for the advance.</p>}
    </form>
  );
}
