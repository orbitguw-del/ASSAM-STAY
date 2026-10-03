import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../state.jsx';
import { cancelBooking } from '../lib/api.js';
import { fmtDate, inr, nightsBetween } from '../lib/format.js';
import { PageHead, Pill, ErrorBox } from '../components/ui.jsx';

const STATUS = { confirmed: ['warn', 'Confirmed'], in: ['ok', 'In house'], out: ['ok', 'Checked out'], cancelled: ['crit', 'Cancelled'] };

export default function BookingDetail() {
  const { id } = useParams();
  const { backend, data, refresh, toast } = useApp();
  const nav = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const b = data.bookings.find(x => x.id === id);
  if (!b) return <div className="stack"><PageHead title="Booking" back /><p>Booking not found.</p></div>;
  const room = data.rooms.find(r => r.id === b.room_id);
  const paid = data.payments.filter(p => p.booking_id === b.id);
  const invoice = data.invoices.find(i => i.booking_id === b.id);
  const [sev, label] = STATUS[b.status];

  async function cancel() {
    try {
      await cancelBooking(backend, b);
      await refresh();
      toast(`Booking for ${b.guest_name} cancelled. The room is free again.`);
      nav('/calendar');
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="stack">
      <PageHead title={b.guest_name} back><Pill sev={sev}>{label}</Pill></PageHead>
      <div className="card kv">
        <div><span>Room</span><span>{room?.name}</span></div>
        <div><span>Dates</span><span>{fmtDate(b.check_in)} to {fmtDate(b.check_out)} · {nightsBetween(b.check_in, b.check_out)} nights</span></div>
        <div><span>Guests</span><span>{b.guests}</span></div>
        <div><span>Channel</span><span>{b.source}</span></div>
        {b.rate && <div><span>Rate</span><span>{inr(b.rate)} a night</span></div>}
        {b.phone && <div><span>Phone</span><span>{b.phone}</span></div>}
        {b.notes && <div><span>Notes</span><span>{b.notes}</span></div>}
        <div><span>Received</span><span>{inr(paid.reduce((s, p) => s + Number(p.amount), 0))}{paid.length ? ` · ${paid.map(p => p.receipt_no).join(', ')}` : ''}</span></div>
      </div>
      <ErrorBox error={error} />
      <div className="actions">
        {b.status === 'confirmed' && <Link className="btn primary" to={`/checkin/${b.id}`}>Check in</Link>}
        {b.status === 'in' && <Link className="btn primary" to={`/checkout/${b.id}`}>Check out</Link>}
        {invoice && <Link className="btn" to={`/bills/${invoice.id}`}>View bill {invoice.number}</Link>}
        {b.status === 'confirmed' && !confirming && <button className="btn" onClick={() => setConfirming(true)}>Cancel booking</button>}
      </div>
      {confirming && (
        <div className="box warn">
          Cancel {b.guest_name}'s booking? The room becomes free for these dates. Any refund is handled separately.
          <div className="actions"><button className="btn danger" onClick={cancel}>Yes, cancel it</button><button className="btn" onClick={() => setConfirming(false)}>Keep it</button></div>
        </div>
      )}
    </div>
  );
}
