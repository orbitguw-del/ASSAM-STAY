import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../state.jsx';
import { checkIn, saveSignature } from '../lib/api.js';
import { maskAadhaar, fmtShort } from '../lib/format.js';
import { GUEST_CATEGORIES, PURPOSES, ID_TYPES, ruleValue } from '../lib/rules.js';
import { Field, PageHead, ErrorBox } from '../components/ui.jsx';
import SignaturePad from '../components/SignaturePad.jsx';

export function useStaffSignature() {
  const { data, user } = useApp();
  return [...data.signatures.values()].filter(s => s.kind === 'staff' && s.signed_by === user.id)
    .sort((a, b) => (a.signed_at < b.signed_at ? 1 : -1))[0] || null;
}

export default function CheckIn() {
  const { id } = useParams();
  const { backend, ctx, data, refresh, toast, staffName } = useApp();
  const nav = useNavigate();
  const b = data.bookings.find(x => x.id === id);
  const staffSig = useStaffSignature();
  const [step, setStep] = useState(1);
  const [f, setF] = useState(() => ({
    guest_name: b?.guest_name || '', address: b?.address || '', guest_category: b?.guest_category || 'Domestic',
    residence: b?.residence || '', purpose: b?.purpose || 'Holidaying', guests: b?.guests || 1,
    id_type: b?.guest_category === 'Foreign' ? 'Passport' : 'Aadhaar', id_raw: '', passport_issued: '', passport_expiry: '', visa_no: '', encashment_cert: '', remarks: '',
  }));
  const [guestSig, setGuestSig] = useState(null);
  const [newStaffSig, setNewStaffSig] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  if (!b) return <div className="stack"><PageHead title="Check in" back /><p>Booking not found.</p></div>;
  if (b.status !== 'confirmed') return <div className="stack"><PageHead title="Check in" back /><p>{b.guest_name} is already checked in.</p></div>;
  const room = data.rooms.find(r => r.id === b.room_id);
  const foreign = f.guest_category === 'Foreign';
  const idNumber = f.id_type === 'Aadhaar' ? maskAadhaar(f.id_raw) : f.id_raw.trim();

  function next(e) {
    e.preventDefault();
    setError(null);
    const missing = [['guest_name', 'guest name'], ['address', 'full address'], ['residence', foreign ? 'country' : 'district or state']].filter(([k]) => !String(f[k]).trim());
    if (missing.length) { setError(`Enter the ${missing.map(m => m[1]).join(', ')}. The register needs them (Annexure 10).`); return; }
    if (!f.id_raw.trim()) { setError('Enter the ID number. Every guest is registered with ID proof (Rule 12, Annexure 4).'); return; }
    if (f.id_type === 'Aadhaar' && !idNumber) { setError('An Aadhaar number has 12 digits. Only the last 4 are stored.'); return; }
    if (foreign && (f.id_type !== 'Passport' || !f.passport_issued || !f.passport_expiry || !f.visa_no.trim())) {
      setError('For a foreign national, record the passport with its issue and expiry dates and the visa number (Annexure 10, column 4, and Form C).'); return;
    }
    setStep(2);
  }

  async function complete() {
    setError(null);
    if (!guestSig) { setError('The guest must sign before check-in can finish (Annexure 10, column 9).'); return; }
    if (!staffSig && !newStaffSig) { setError('Add your own signature as the staff member on duty (Annexure 10, column 12).'); return; }
    setBusy(true);
    try {
      let staffSigId = staffSig?.id;
      if (!staffSigId) staffSigId = (await saveSignature(backend, ctx, { kind: 'staff', signerName: staffName, image: newStaffSig, content: `staff|${staffName}` })).id;
      await checkIn(backend, ctx, { booking: b, form: { ...f, id_number: idNumber }, guestSignature: guestSig, staffSignatureId: staffSigId });
      await refresh();
      toast(foreign ? `${f.guest_name} checked in. Form C is due on the FRRO portal within ${ruleValue('form_c.hours')} hours.` : `${f.guest_name} checked in and added to the register.`);
      nav('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <PageHead title={`Check in · ${b.guest_name}`} back />
      <div className="stepper"><i className="on" /><i className={step === 2 ? 'on' : ''} /></div>
      <p className="hint">{room?.name} · {fmtShort(b.check_in)} to {fmtShort(b.check_out)} · {b.source}</p>

      {step === 1 && (
        <form className="stack" onSubmit={next}>
          <Field label="Guest name (register col 2)" id="ci-name"><input id="ci-name" value={f.guest_name} onChange={e => set('guest_name', e.target.value)} /></Field>
          <Field label="Full address in India or abroad (col 3)" id="ci-addr"><input id="ci-addr" value={f.address} onChange={e => set('address', e.target.value)} /></Field>
          <div className="grid2">
            <Field label="Guest type (Annexure 11)" id="ci-cat" hint="Local = lives in Assam">
              <select id="ci-cat" value={f.guest_category} onChange={e => { set('guest_category', e.target.value); if (e.target.value === 'Foreign') set('id_type', 'Passport'); }}>
                {GUEST_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={f.guest_category === 'Local' ? 'District' : f.guest_category === 'Domestic' ? 'State' : 'Country'} id="ci-res">
              <input id="ci-res" value={f.residence} onChange={e => set('residence', e.target.value)} />
            </Field>
          </div>
          <div className="grid2">
            <Field label="Purpose of visit" id="ci-purpose">
              <select id="ci-purpose" value={f.purpose} onChange={e => set('purpose', e.target.value)}>{PURPOSES.map(p => <option key={p}>{p}</option>)}</select>
            </Field>
            <Field label="Guests (col 5)" id="ci-guests"><input id="ci-guests" type="number" min="1" max="20" value={f.guests} onChange={e => set('guests', e.target.value)} /></Field>
          </div>
          <div className="grid2">
            <Field label="ID type" id="ci-idtype">
              <select id="ci-idtype" value={f.id_type} onChange={e => set('id_type', e.target.value)}>{ID_TYPES.map(t => <option key={t}>{t}</option>)}</select>
            </Field>
            <Field label={f.id_type === 'Passport' ? 'Passport number' : 'ID number'} id="ci-idno">
              <input id="ci-idno" value={f.id_raw} onChange={e => set('id_raw', e.target.value)} autoComplete="off" inputMode={f.id_type === 'Aadhaar' ? 'numeric' : 'text'} />
            </Field>
          </div>
          {f.id_type === 'Aadhaar' && f.id_raw && <p className="hint">{idNumber ? `Stored as ${idNumber}. The full Aadhaar number is never saved.` : 'Enter all 12 digits.'}</p>}
          {foreign && (
            <>
              <div className="box warn">Foreign national: passport issue and expiry go into register column 4, and a Form C task opens with a {ruleValue('form_c.hours')}-hour deadline.</div>
              <div className="grid2">
                <Field label="Passport issued" id="ci-pi"><input id="ci-pi" type="date" value={f.passport_issued} onChange={e => set('passport_issued', e.target.value)} /></Field>
                <Field label="Passport expires" id="ci-pe"><input id="ci-pe" type="date" value={f.passport_expiry} onChange={e => set('passport_expiry', e.target.value)} /></Field>
              </div>
              <div className="grid2">
                <Field label="Visa number" id="ci-visa"><input id="ci-visa" value={f.visa_no} onChange={e => set('visa_no', e.target.value)} /></Field>
                <Field label="Encashment certificate (col 13)" id="ci-enc"><input id="ci-enc" value={f.encashment_cert} onChange={e => set('encashment_cert', e.target.value)} placeholder="If paying in foreign currency" /></Field>
              </div>
            </>
          )}
          <ErrorBox error={error} />
          <button className="btn primary">Next: signatures</button>
        </form>
      )}

      {step === 2 && (
        <div className="stack">
          <div className="box ok">Register column 9: <b>signature of the guest during arrival</b>. Hand the phone to {f.guest_name.split(' ')[0]}.</div>
          <SignaturePad label="Guest signature · arrival" onChange={setGuestSig} />
          {staffSig ? (
            <p className="hint">Column 12, staff on duty: your saved signature ({staffSig.signer_name}) is added automatically.</p>
          ) : (
            <>
              <div className="box ok">Column 12: <b>your signature as the staff member on duty</b>. It is saved and reused for later check-ins.</div>
              <SignaturePad label={`Staff signature · ${staffName}`} onChange={setNewStaffSig} />
            </>
          )}
          <ErrorBox error={error} />
          <div className="actions">
            <button className="btn" onClick={() => setStep(1)}>Back</button>
            <button className="btn primary" onClick={complete} disabled={busy}>{busy ? 'Saving…' : 'Complete check-in'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
