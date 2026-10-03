import { useState } from 'react';
import { useApp } from '../state.jsx';
import { submitMonthlyReturn } from '../lib/api.js';
import { monthlyReturn, monthlyDueDate } from '../lib/compliance.js';
import { addMonths, todayISO, fmtMonth, fmtDate, fmtDateTime } from '../lib/format.js';
import { GUEST_CATEGORIES } from '../lib/rules.js';
import { Field, PageHead, ErrorBox, SigImage } from '../components/ui.jsx';
import SignaturePad from '../components/SignaturePad.jsx';

export default function MonthlyReturn() {
  const { backend, ctx, data, property, refresh, toast } = useApp();
  const [month, setMonth] = useState(addMonths(todayISO(), -1));
  const [sig, setSig] = useState(null);
  const [error, setError] = useState(null);
  const m = monthlyReturn(data.register, data.bookings, month);
  const existing = data.monthlyReturns.find(r => r.month === month);
  const due = monthlyDueDate(month);

  async function submit() {
    setError(null);
    if (!sig) { setError('Sign the return before marking it submitted.'); return; }
    try {
      await submitMonthlyReturn(backend, ctx, { month, data: m, ownerSignature: sig, existing });
      await refresh();
      toast(`${fmtMonth(month)} return signed and marked submitted.`);
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="stack">
      <PageHead title="Monthly return" back>
        <button className="btn small no-print" onClick={() => window.print()}>Print</button>
      </PageHead>
      <p className="hint">Annexure 11 · Rule 11 · {property.name} · to the Directorate of Tourism by {fmtDate(due)}. Built from the register; nobody retypes the numbers.</p>
      <Field label="Month" id="mr-month">
        <input id="mr-month" type="month" value={month.slice(0, 7)} max={todayISO().slice(0, 7)} onChange={e => e.target.value && setMonth(e.target.value + '-01')} />
      </Field>

      <h3>A. Visitors data, {fmtMonth(month)}</h3>
      <div className="scroll-x"><table className="register">
        <thead><tr><th>Category</th><th>Guests checked in</th><th>Nights spent</th></tr></thead>
        <tbody>
          {GUEST_CATEGORIES.map(c => <tr key={c}><td>{c}</td><td className="num">{m.byCategory[c].guests}</td><td className="num">{m.byCategory[c].nights}</td></tr>)}
          <tr className="strong"><td>Total</td><td className="num">{m.total.guests}</td><td className="num">{m.total.nights}</td></tr>
        </tbody>
      </table></div>
      <p className="hint">Nights spent = guests × nights inside the month.</p>

      <h3>B. Place of residence</h3>
      <div className="scroll-x"><table className="register">
        <thead><tr><th>Category</th><th>District / state / country</th><th>Guests</th></tr></thead>
        <tbody>{m.residence.length ? m.residence.map((r, i) => <tr key={i}><td>{r.category}</td><td>{r.place}</td><td className="num">{r.guests}</td></tr>) : <tr><td colSpan={3}>No guests checked in this month.</td></tr>}</tbody>
      </table></div>

      <h3>B. Purpose of visit</h3>
      <div className="scroll-x"><table className="register">
        <thead><tr><th>Group</th><th>Purpose</th><th>Guests</th></tr></thead>
        <tbody>{m.purposes.length ? m.purposes.map((p, i) => <tr key={i}><td>{p.group}</td><td>{p.purpose}</td><td className="num">{p.guests}</td></tr>) : <tr><td colSpan={3}>No guests checked in this month.</td></tr>}</tbody>
      </table></div>

      {existing?.submitted_at ? (
        <div className="box ok">
          Signed and marked submitted on {fmtDateTime(existing.submitted_at)}.
          <div><SigImage sig={data.signatures.get(existing.sig_owner)} alt="Owner signature" /></div>
        </div>
      ) : (
        <div className="stack no-print">
          <SignaturePad label="Owner signature" onChange={setSig} />
          <ErrorBox error={error} />
          <button className="btn primary" onClick={submit}>Sign and mark submitted</button>
          <p className="hint">Print or save this page as PDF and send it to the Directorate, then mark it submitted. If the Directorate opens an online form, only this step changes.</p>
        </div>
      )}
    </div>
  );
}
