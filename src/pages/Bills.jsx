import { Link } from 'react-router-dom';
import { useApp } from '../state.jsx';
import { fmtDate, inr } from '../lib/format.js';
import { PageHead, Empty } from '../components/ui.jsx';

export default function Bills() {
  const { data } = useApp();
  const received = data.payments.reduce((s, p) => s + Number(p.amount), 0);
  return (
    <div className="stack">
      <PageHead title="Bills and receipts" />
      <div className="tiles two">
        <div className="tile"><div className="n">{data.invoices.length}</div><div className="l">bills issued</div></div>
        <div className="tile"><div className="n small">{inr(received)}</div><div className="l">received, all receipts</div></div>
      </div>
      <div className="list">
        {data.invoices.length ? data.invoices.map(v => (
          <Link className="item link" key={v.id} to={`/bills/${v.id}`}>
            <div className="main"><div className="t mono">{v.number}</div><div className="d">{v.guest_name} · {fmtDate(v.issued_on)} · {v.kind === 'tax_invoice' ? 'Tax invoice' : 'Bill of supply'}</div></div>
            <div className="strong">{inr(v.total)}</div>
          </Link>
        )) : <Empty>No bills yet. Checking a guest out issues one.</Empty>}
      </div>
      <h3>Receipts</h3>
      <div className="list">
        {data.payments.length ? [...data.payments].sort((a, b) => (a.receipt_no < b.receipt_no ? 1 : -1)).map(p => (
          <div className="item" key={p.id}>
            <div className="main"><div className="t mono">{p.receipt_no}</div><div className="d">{data.bookings.find(b => b.id === p.booking_id)?.guest_name || ''} · {fmtDate(p.received_on)} · {p.method.toUpperCase()}</div></div>
            <div>{inr(p.amount)}</div>
          </div>
        )) : <Empty>No payments yet.</Empty>}
      </div>
      <p className="hint">Numbers run in sequence per financial year and are never reused. Issued bills cannot be edited.</p>
    </div>
  );
}
