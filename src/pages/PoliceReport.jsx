import { useState } from 'react';
import { useApp } from '../state.jsx';
import { markPoliceReportSent } from '../lib/api.js';
import { stayedOnNight } from '../lib/compliance.js';
import { addDays, todayISO, fmtDate, fmtDateTime } from '../lib/format.js';
import { Field, PageHead, Empty, ErrorBox } from '../components/ui.jsx';

export default function PoliceReport() {
  const { backend, ctx, data, property, refresh, toast } = useApp();
  const [night, setNight] = useState(addDays(todayISO(), -1));
  const [channel, setChannel] = useState('WhatsApp');
  const [error, setError] = useState(null);
  const entries = stayedOnNight(data.register, data.bookings, night);
  const persons = entries.reduce((s, e) => s + e.guests, 0);
  const sent = data.policeReports.find(r => r.report_date === night);
  const roomOf = e => data.rooms.find(r => r.id === data.bookings.find(b => b.id === e.booking_id)?.room_id)?.name || '';

  const text = [
    `${property.name}${property.tourism_reg_no ? ` (Tourism reg. ${property.tourism_reg_no})` : ''}`,
    property.address || '',
    `Guests who stayed on the night of ${fmtDate(night)}: ${persons} persons in ${entries.length} rooms.`,
    'Reported under the Assam Tourism (Development & Registration) Act, 2024, s.18A.',
    '',
    ...entries.map((e, i) => `${i + 1}. ${e.guest_name}, ${e.guests} person(s), ${e.address}. ${e.id_type} ${e.id_number}. Room ${roomOf(e)}. Arrived ${fmtDateTime(e.arrived_at)}.`),
  ].join('\n');

  async function share() {
    try {
      if (navigator.share) { await navigator.share({ title: `Guest report ${fmtDate(night)}`, text }); return; }
      await navigator.clipboard.writeText(text);
      toast('Report copied. Paste it into WhatsApp or an email to the police station.');
    } catch { /* the person closed the share sheet */ }
  }

  async function markSent() {
    setError(null);
    try {
      await markPoliceReportSent(backend, ctx, { night, entries, channel });
      await refresh();
      toast(`Police report for ${fmtDate(night)} marked as sent.`);
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="stack">
      <PageHead title="Daily police report" back>
        <button className="btn small no-print" onClick={() => window.print()}>Print</button>
      </PageHead>
      <p className="hint">Act s.18A (in force 7 Sep 2026): report every person who stayed the previous day or night to {property.police_station || 'the jurisdictional police station'}{property.police_contact ? ` (${property.police_contact})` : ''}. The prescribed format is not yet notified; this uses the register layout.</p>
      <Field label="Night of" id="pr-night"><input id="pr-night" type="date" value={night} max={todayISO()} onChange={e => setNight(e.target.value)} /></Field>
      <div className={`box ${sent ? 'ok' : entries.length ? 'warn' : 'ok'}`}>
        {sent ? `Sent by ${sent.channel} on ${fmtDateTime(sent.sent_at)} (${sent.guest_count} persons).`
          : entries.length ? `${persons} persons in ${entries.length} rooms stayed on the night of ${fmtDate(night)}. Everyone is listed, not only new arrivals.` : 'Nobody stayed that night. Nothing to report.'}
      </div>
      {entries.length > 0 ? (
        <div className="scroll-x">
          <table className="register">
            <thead><tr><th>Sl.</th><th>Guest</th><th>Address</th><th>ID</th><th>Persons</th><th>Room</th><th>Arrived</th></tr></thead>
            <tbody>{entries.map(e => (
              <tr key={e.id}><td className="num">{e.serial_no}</td><td>{e.guest_name}</td><td className="wrap">{e.address}</td><td className="mono">{e.id_type} {e.id_number}</td><td className="num">{e.guests}</td><td>{roomOf(e)}</td><td>{fmtDateTime(e.arrived_at)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No guests on this night.</Empty>}
      <ErrorBox error={error} />
      {entries.length > 0 && !sent && (
        <div className="stack no-print">
          <button className="btn" onClick={share}>Share report text</button>
          <div className="grid2">
            <Field label="Sent by" id="pr-channel">
              <select id="pr-channel" value={channel} onChange={e => setChannel(e.target.value)}>{['WhatsApp', 'Email', 'By hand', 'Police portal'].map(c => <option key={c}>{c}</option>)}</select>
            </Field>
            <div className="field end"><button className="btn primary" onClick={markSent}>Mark as sent</button></div>
          </div>
          <p className="hint">The app does not send anything by itself. Share or print the report, send it, then mark it sent so there is a record.</p>
        </div>
      )}
    </div>
  );
}
