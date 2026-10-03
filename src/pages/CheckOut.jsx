import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../state.jsx';
import { checkOut } from '../lib/api.js';
import { buildBill } from '../lib/billing.js';
import { EXTRAS, PAYMENT_METHODS } from '../lib/rules.js';
import { inr, nightsBetween, todayISO, fmtShort, round2 } from '../lib/format.js';
import { Field, PageHead, ErrorBox } from '../components/ui.jsx';
import SignaturePad from '../components/SignaturePad.jsx';

export default function CheckOut() {
  const { id } = useParams();
  const { backend, ctx, data, property, refresh, toast } = useApp();
  const nav = useNavigate();
  const b = data.bookings.find(x => x.id === id);
  const room = b && data.rooms.find(r => r.id === b.room_id);
  const entry = b && data.register.find(e => e.booking_id === b.id);
  const today = todayISO();
  // A guest leaving early pays for the nights stayed; one night minimum.
  const nights = b ? Math.max(1, nightsBetween(b.check_in, today < b.check_out ? today : b.check_out)) : 1;
  const [rate, setRate] = useState(b?.rate || room?.tariff || 0);
  const [extras, setExtras] = useState({});
  const [reason, setReason] = useState('');
  const [gstin, setGstin] = useState('');
  const [method, setMethod] = useState('upi');
  const [sig, setSig] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const bill = useMemo(() => buildBill({ registered: !!property.gstin, rate: Number(rate) || 0, nights, extras, on: today }), [property.gstin, rate, nights, extras, today]);
  if (!b) return <div className="stack"><PageHead title="Check out" back /><p>Booking not found.</p></div>;
  if (b.status !== 'in' || !entry) return <div className="stack"><PageHead title="Check out" back /><p>{b.guest_name} is not checked in.</p></div>;

  const paid = round2(data.payments.filter(p => p.booking_id === b.id).reduce((s, p) => s + Number(p.amount), 0));
  const balance = round2(bill.total - paid);
  const tariff = Number(room.tariff);
  const aboveTariff = Number(rate) > tariff;

  async function finish() {
    setError(null);
    if (aboveTariff && !reason.trim()) { setError(`Give the reason for charging above the displayed tariff of ${inr(tariff)}, or lower the rate.`); return; }
    if (!sig) { setError('The guest must sign at departure (Annexure 10, column 14).'); return; }
    setBusy(true);
    try {
      const inv = await checkOut(backend, ctx, { booking: b, entry, bill: { ...bill, guest_gstin: gstin }, paidSoFar: paid, payment: { method }, overrideReason: aboveTariff ? reason.trim() : '', guestSignature: sig });
      await refresh();
      toast(`${inv.number} issued. ${room.name} is free; send the feedback link to ${b.guest_name.split(' ')[0]}.`);
      nav(`/bills/${inv.id}?new=1`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <PageHead title={`Check out · ${b.guest_name}`} back />
      <p className="hint">{room.name} · {fmtShort(b.check_in)} to {fmtShort(today < b.check_out ? today : b.check_out)} · {nights} night{nights > 1 ? 's' : ''}{today < b.check_out ? ' (leaving early)' : ''}</p>

      <div className="grid2">
        <Field label={`Rate per night (tariff ${inr(tariff)})`} id="co-rate"><input id="co-rate" type="number" min="0" step="50" value={rate} onChange={e => setRate(e.target.value)} /></Field>
        <Field label="Guest GSTIN (business guests)" id="co-gstin"><input id="co-gstin" value={gstin} onChange={e => setGstin(e.target.value.toUpperCase())} maxLength={15} /></Field>
      </div>
      {aboveTariff && (
        <>
          <div className="box crit"><b>Above the displayed tariff of {inr(tariff)}.</b> Charging more than the displayed price is a malpractice under the Act, s.2(u), with a fine up to ₹10,000. Record the reason the guest agreed to.</div>
          <Field label="Reason (logged on the bill and in the register)" id="co-reason"><input id="co-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. extra bed agreed at booking" /></Field>
        </>
      )}
      <div className="grid3">
        {EXTRAS.map(x => (
          <Field key={x.code} label={`${x.label} (${inr(x.unitPrice)})`} id={`co-${x.code}`}>
            <input id={`co-${x.code}`} type="number" min="0" max="99" value={extras[x.code] || 0} onChange={e => setExtras(prev => ({ ...prev, [x.code]: Number(e.target.value) || 0 }))} />
          </Field>
        ))}
      </div>

      <div className="card bill">
        {bill.lines.map((l, i) => <div className="r" key={i}><span>{l.description} · {l.qty} × {inr(l.unit_price)} · SAC {l.sac}{bill.kind === 'tax_invoice' ? ` · GST ${l.gst_rate}%` : ''}</span><span>{inr(l.amount)}</span></div>)}
        {bill.kind === 'tax_invoice' ? (
          <>
            <div className="r"><span>CGST</span><span>{inr(bill.cgst)}</span></div>
            <div className="r"><span>SGST (Assam)</span><span>{inr(bill.sgst)}</span></div>
          </>
        ) : <div className="r hint"><span>Bill of supply: no GST (property has no GSTIN)</span><span /></div>}
        <div className="r tot"><span>Total</span><span>{inr(bill.total)}</span></div>
        <div className="r"><span>Already received</span><span>{inr(paid)}</span></div>
        <div className="r strong"><span>{balance >= 0 ? 'Balance to collect' : 'Refund due to guest'}</span><span>{inr(Math.abs(balance))}</span></div>
      </div>
      {balance > 0 && (
        <Field label="Balance paid by" id="co-method">
          <select id="co-method" value={method} onChange={e => setMethod(e.target.value)}>{PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
      )}

      <div className="box ok">Register column 14: <b>signature of the guest during departure</b>.</div>
      <SignaturePad label="Guest signature · departure" onChange={setSig} />
      <ErrorBox error={error} />
      <button className="btn primary" onClick={finish} disabled={busy}>{busy ? 'Saving…' : 'Issue bill and check out'}</button>
    </div>
  );
}
