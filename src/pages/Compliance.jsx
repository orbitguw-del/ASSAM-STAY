import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state.jsx';
import { saveDocument, saveFormCAck } from '../lib/api.js';
import { buildAlerts } from '../lib/compliance.js';
import { todayISO, fmtDate, fmtDateTime, nightsBetween } from '../lib/format.js';
import { DOCUMENT_KINDS, allRules } from '../lib/rules.js';
import { Field, PageHead, Pill, Empty, ErrorBox } from '../components/ui.jsx';

const blankDoc = { kind: DOCUMENT_KINDS[1], number: '', issued_on: '', expires_on: '', notes: '' };

export default function Compliance() {
  const { backend, ctx, data, property, refresh, toast } = useApp();
  const today = todayISO();
  const alerts = buildAlerts({ today, property, data });
  const [acks, setAcks] = useState({});
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);
  const [showRules, setShowRules] = useState(false);

  async function saveAck(f) {
    setError(null);
    if (!acks[f.id]?.trim()) { setError('Paste the acknowledgement number from the FRRO portal.'); return; }
    try { await saveFormCAck(backend, f, acks[f.id]); await refresh(); toast(`Form C for ${f.guest_name} recorded.`); } catch (e) { setError(e.message); }
  }
  async function saveDoc(e) {
    e.preventDefault();
    setError(null);
    try { await saveDocument(backend, ctx, doc); await refresh(); setDoc(null); toast(`${doc.kind} saved.`); } catch (err) { setError(err.message); }
  }
  const docStatus = d => {
    if (!d.expires_on) return <Pill>No expiry</Pill>;
    const left = nightsBetween(today, d.expires_on);
    if (left < 0) return <Pill sev="crit">Expired</Pill>;
    if (left <= 30) return <Pill sev="warn">{left} days left</Pill>;
    return <Pill>Valid</Pill>;
  };

  return (
    <div className="stack">
      <PageHead title="Compliance" />
      <section>
        <h3>Due now</h3>
        <div className="list">
          {alerts.length ? alerts.map((a, i) => (
            <div className="item" key={i}><span className={`sev ${a.sev}`} /><div className="main"><div className="t">{a.title}</div><div className="d">{a.detail}</div></div>{a.to !== '/compliance' && <Link className="btn small" to={a.to}>{a.action}</Link>}</div>
          )) : <Empty>Everything is up to date.</Empty>}
        </div>
      </section>

      <section>
        <h3>Reports</h3>
        <div className="list">
          <div className="item"><div className="main"><div className="t">Daily police report</div><div className="d">Act s.18A · everyone who stayed the previous night</div></div><Link className="btn small" to="/police">Open</Link></div>
          <div className="item"><div className="main"><div className="t">Monthly return</div><div className="d">Annexure 11 · due by the 7th</div></div><Link className="btn small" to="/monthly">Open</Link></div>
          <div className="item"><div className="main"><div className="t">Tourist register</div><div className="d">Annexure 10 · print or export for inspection</div></div><Link className="btn small" to="/register">Open</Link></div>
        </div>
      </section>

      <section>
        <h3>Form C (foreign guests)</h3>
        <div className="list">
          {data.formC.length ? [...data.formC].sort((a, b) => (a.due_at < b.due_at ? 1 : -1)).map(f => (
            <div className="item col" key={f.id}>
              <div className="row-between">
                <div><div className="t">{f.guest_name}</div><div className="d">{f.ack_no ? `Filed ${fmtDateTime(f.filed_at)} · ack ${f.ack_no}` : `Due on indianfrro.gov.in by ${fmtDateTime(f.due_at)}`}</div></div>
                {f.ack_no ? <Pill>Filed</Pill> : <Pill sev="crit">{new Date(f.due_at) < new Date() ? 'Overdue' : 'Due'}</Pill>}
              </div>
              {!f.ack_no && (
                <div className="inline">
                  <input aria-label={`FRRO acknowledgement for ${f.guest_name}`} placeholder="FRRO acknowledgement number" value={acks[f.id] || ''} onChange={e => setAcks({ ...acks, [f.id]: e.target.value })} />
                  <button className="btn small primary" onClick={() => saveAck(f)}>Save</button>
                </div>
              )}
            </div>
          )) : <Empty>No foreign guests yet. Checking one in opens a Form C task here.</Empty>}
        </div>
      </section>

      <section>
        <div className="row-between"><h3>Licences and documents</h3>{!doc && <button className="btn small" onClick={() => setDoc({ ...blankDoc })}>Add</button>}</div>
        {doc && (
          <form className="card stack" onSubmit={saveDoc}>
            <Field label="Document" id="doc-kind"><select id="doc-kind" value={doc.kind} onChange={e => setDoc({ ...doc, kind: e.target.value })}>{DOCUMENT_KINDS.map(k => <option key={k}>{k}</option>)}</select></Field>
            <Field label="Number" id="doc-no"><input id="doc-no" value={doc.number || ''} onChange={e => setDoc({ ...doc, number: e.target.value })} /></Field>
            <div className="grid2">
              <Field label="Issued" id="doc-iss"><input id="doc-iss" type="date" value={doc.issued_on || ''} onChange={e => setDoc({ ...doc, issued_on: e.target.value })} /></Field>
              <Field label="Expires" id="doc-exp"><input id="doc-exp" type="date" value={doc.expires_on || ''} onChange={e => setDoc({ ...doc, expires_on: e.target.value })} /></Field>
            </div>
            <Field label="Notes" id="doc-notes"><input id="doc-notes" value={doc.notes || ''} onChange={e => setDoc({ ...doc, notes: e.target.value })} /></Field>
            <div className="actions"><button className="btn primary">Save</button><button type="button" className="btn" onClick={() => setDoc(null)}>Cancel</button></div>
          </form>
        )}
        <div className="list">
          {data.documents.length ? [...data.documents].sort((a, b) => (a.expires_on || '9999') < (b.expires_on || '9999') ? -1 : 1).map(d => (
            <div className="item" key={d.id}>
              <div className="main"><div className="t">{d.kind}</div><div className="d">{[d.number, d.expires_on ? `expires ${fmtDate(d.expires_on)}` : ''].filter(Boolean).join(' · ')}</div></div>
              {docStatus(d)}
              <button className="btn small" onClick={() => setDoc({ ...d })}>Edit</button>
            </div>
          )) : <Empty>Add your Fire Safety Certificate, trade licence and other papers to get expiry reminders.</Empty>}
        </div>
      </section>
      <ErrorBox error={error} />

      <section>
        <button className="btn small ghost" onClick={() => setShowRules(!showRules)}>{showRules ? 'Hide' : 'Show'} the legal rules this app uses</button>
        {showRules && (
          <div className="scroll-x"><table className="register">
            <thead><tr><th>Rule</th><th>Value</th><th>Source</th><th>From</th></tr></thead>
            <tbody>{[...allRules()].flatMap(([k, list]) => list.map((r, i) => <tr key={k + i}><td className="mono">{k}</td><td className="mono wrap">{JSON.stringify(r.value)}</td><td className="wrap">{r.source}</td><td>{fmtDate(r.effectiveFrom)}</td></tr>))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
