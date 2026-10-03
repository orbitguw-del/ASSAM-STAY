import { useState } from 'react';
import { useApp } from '../state.jsx';
import { Field, ErrorBox } from '../components/ui.jsx';

export default function Login() {
  const { backend } = useApp();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try { await backend.signIn(email.trim()); setSent(true); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <div className="gamosa" aria-hidden="true" />
      <div className="auth-body stack">
        <h1>Homestay Desk</h1>
        <p className="hint">Bookings, the tourist register, police reports and GST bills for Assam homestays.</p>
        {sent ? (
          <div className="box ok">We sent a sign-in link to <b>{email}</b>. Open it on this device to continue.</div>
        ) : (
          <form className="stack" onSubmit={submit}>
            <Field label="Email" id="lg-email"><input id="lg-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></Field>
            <ErrorBox error={error} />
            <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
