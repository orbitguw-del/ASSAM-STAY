import { useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../state.jsx';
import { fmtDate, inr } from '../lib/format.js';
import { PageHead } from '../components/ui.jsx';

export default function InvoiceView() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data, property } = useApp();
  const v = data.invoices.find(x => x.id === id);
  if (!v) return <div className="stack"><PageHead title="Bill" back /><p>Bill not found.</p></div>;
  const booking = data.bookings.find(b => b.id === v.booking_id);
  const room = booking && data.rooms.find(r => r.id === booking.room_id);
  const paid = data.payments.filter(p => p.booking_id === v.booking_id);
  const taxInvoice = v.kind === 'tax_invoice';

  return (
    <div className="stack">
      <PageHead title={taxInvoice ? 'Tax invoice' : 'Bill of supply'} back>
        <button className="btn small no-print" onClick={() => window.print()}>Print / PDF</button>
      </PageHead>
      {params.get('new') && <div className="box ok no-print">Bill issued. Print it or save it as PDF and send it to the guest on WhatsApp, along with the feedback link.</div>}
      <div className="card invoice">
        <div className="inv-head">
          <div><div className="strong">{property.name}</div><div className="hint">{property.address}</div></div>
          <div className="right hint">
            {property.gstin && <div>GSTIN {property.gstin}</div>}
            {property.tourism_reg_no && <div>Tourism reg. {property.tourism_reg_no}</div>}
          </div>
        </div>
        <div className="kv">
          <div><span>{taxInvoice ? 'Invoice' : 'Bill'} no.</span><span className="mono">{v.number}</span></div>
          <div><span>Date</span><span>{fmtDate(v.issued_on)}</span></div>
          <div><span>Guest</span><span>{v.guest_name}</span></div>
          {v.guest_gstin && <div><span>Guest GSTIN</span><span className="mono">{v.guest_gstin}</span></div>}
          {booking && <div><span>Stay</span><span>{room?.name} · {fmtDate(booking.check_in)} to {fmtDate(booking.check_out)}</span></div>}
          {taxInvoice && <div><span>Place of supply</span><span>Assam (18)</span></div>}
        </div>
        <table className="lines">
          <thead><tr><th>Description</th><th>SAC</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th>{taxInvoice && <th className="num">GST</th>}</tr></thead>
          <tbody>{v.lines.map((l, i) => (
            <tr key={i}><td>{l.description}</td><td className="mono">{l.sac}</td><td className="num">{l.qty}</td><td className="num">{inr(l.unit_price)}</td><td className="num">{inr(l.amount)}</td>{taxInvoice && <td className="num">{l.gst_rate}%</td>}</tr>
          ))}</tbody>
        </table>
        <div className="totals">
          <div className="r"><span>Taxable value</span><span>{inr(v.taxable)}</span></div>
          {taxInvoice && <div className="r"><span>CGST</span><span>{inr(v.cgst)}</span></div>}
          {taxInvoice && <div className="r"><span>SGST</span><span>{inr(v.sgst)}</span></div>}
          <div className="r tot"><span>Total</span><span>{inr(v.total)}</span></div>
          {paid.map(p => <div className="r hint" key={p.id}><span>Received {p.receipt_no} · {p.method.toUpperCase()} · {fmtDate(p.received_on)}</span><span>{inr(p.amount)}</span></div>)}
        </div>
        {v.price_override_reason && <p className="hint">Rate above displayed tariff, reason recorded: {v.price_override_reason}</p>}
        {!taxInvoice && <p className="hint">Supplier not registered under GST; no tax charged.</p>}
      </div>
    </div>
  );
}
