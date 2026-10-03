import { useEffect, useState } from 'react';
import { useApp } from '../state.jsx';
import { arrivalContent } from '../lib/compliance.js';
import { fmtDateTime, fmtDate, inr, localISO, nightsBetween, sha256 } from '../lib/format.js';
import { PageHead, SigImage, Pill, Empty } from '../components/ui.jsx';

export function downloadFile(name, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function Register() {
  const { data, property } = useApp();
  const invoiceById = new Map(data.invoices.map(i => [i.id, i]));
  const bookingById = new Map(data.bookings.map(b => [b.id, b]));
  const [changed, setChanged] = useState(new Set());

  // An entry whose fields no longer match what the guest signed is flagged.
  useEffect(() => {
    let live = true;
    (async () => {
      const bad = new Set();
      for (const e of data.register) {
        const sig = data.signatures.get(e.sig_arrival);
        if (sig && (await sha256(arrivalContent(e))) !== sig.content_hash) bad.add(e.id);
      }
      if (live) setChanged(bad);
    })();
    return () => { live = false; };
  }, [data]);

  const stay = e => {
    const dep = e.departed_at ? localISO(e.departed_at) : null;
    return dep ? `${Math.max(1, nightsBetween(localISO(e.arrived_at), dep))} nights` : '';
  };
  const idCell = e => [e.id_type === 'Passport' ? `Passport ${e.id_number}` : `${e.id_type} ${e.id_number}`,
    e.passport_issued ? `issued ${fmtDate(e.passport_issued)}` : '', e.passport_expiry ? `expires ${fmtDate(e.passport_expiry)}` : '', e.visa_no ? `visa ${e.visa_no}` : ''].filter(Boolean);

  function exportCsv() {
    const head = ['Sl. No.', 'Name of guest', 'Full address', 'Passport / ID', 'Guests', 'Rooms', 'Arrival', 'Departure', 'Period of stay', 'Guest signed at arrival', 'Bill no. and date', 'Tax (GST)', 'Staff on duty', 'Encashment certificate', 'Guest signed at departure', 'Remarks'];
    const rows = data.register.map(e => {
      const inv = invoiceById.get(e.invoice_id);
      return [e.serial_no, e.guest_name, e.address, idCell(e).join('; '), e.guests, e.rooms, fmtDateTime(e.arrived_at), fmtDateTime(e.departed_at), stay(e),
        e.sig_arrival ? 'Yes' : 'No', inv ? `${inv.number}, ${fmtDate(inv.issued_on)}` : '', e.tax_amount ?? '', e.staff_name, e.encashment_cert || '', e.sig_departure ? 'Yes' : 'No', e.remarks || ''];
    });
    downloadFile(`register-${property.invoice_prefix}-${localISO(new Date())}.csv`, [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n'));
  }

  return (
    <div className="stack">
      <PageHead title="Tourist register">
        <button className="btn small no-print" onClick={exportCsv}>Export CSV</button>
        <button className="btn small no-print" onClick={() => window.print()}>Print</button>
      </PageHead>
      <p className="hint">Annexure 10, Assam Tourism Accommodation Rules 2026 · {property.name} · registration {property.tourism_reg_no || 'not added'}. Filled from check-in and check-out.</p>
      {data.register.length === 0 ? <Empty>No guests yet. Each check-in adds a line here.</Empty> : (
        <div className="scroll-x">
          <table className="register">
            <thead>
              <tr>
                <th>1. Sl.</th><th>2. Name of guest</th><th>3. Full address</th><th>4. Passport no., issue and expiry (ID for Indian guests)</th>
                <th>5. Guests / rooms</th><th>6. Arrival</th><th>7. Departure</th><th>8. Stay</th><th>9. Guest signature, arrival</th>
                <th>10. Bill no. and date</th><th>11. Tax (GST)</th><th>12. Staff on duty</th><th>13. Encashment certificate</th>
                <th>14. Guest signature, departure</th><th>15. Remarks</th>
              </tr>
            </thead>
            <tbody>
              {data.register.map(e => {
                const inv = invoiceById.get(e.invoice_id);
                const inHouse = !e.departed_at && bookingById.get(e.booking_id)?.status === 'in';
                return (
                  <tr key={e.id}>
                    <td className="num">{e.serial_no}</td>
                    <td>{e.guest_name}{changed.has(e.id) && <div><Pill sev="crit">changed after signing</Pill></div>}</td>
                    <td className="wrap">{e.address}</td>
                    <td className="mono">{idCell(e).map((l, i) => <div key={i}>{l}</div>)}</td>
                    <td className="num">{e.guests} / {e.rooms}</td>
                    <td>{fmtDateTime(e.arrived_at)}</td>
                    <td>{e.departed_at ? fmtDateTime(e.departed_at) : inHouse ? <Pill sev="warn">In house</Pill> : ''}</td>
                    <td>{stay(e)}</td>
                    <td><SigImage sig={data.signatures.get(e.sig_arrival)} alt={`${e.guest_name}, arrival signature`} /></td>
                    <td className="mono">{inv ? <>{inv.number}<br />{fmtDate(inv.issued_on)}</> : ''}</td>
                    <td className="num">{e.tax_amount != null ? inr(e.tax_amount) : ''}</td>
                    <td><SigImage sig={data.signatures.get(e.sig_staff)} alt={`${e.staff_name}, staff signature`} /><div className="hint">{e.staff_name}</div></td>
                    <td className="wrap">{e.encashment_cert || ''}</td>
                    <td>{e.sig_departure ? <SigImage sig={data.signatures.get(e.sig_departure)} alt={`${e.guest_name}, departure signature`} /> : <span className="hint">at check-out</span>}</td>
                    <td className="wrap">{e.remarks || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
