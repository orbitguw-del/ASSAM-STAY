import { useState } from 'react';
import { useApp } from '../state.jsx';
import { Field, ErrorBox } from '../components/ui.jsx';

// Sign-in by a 6-digit code from email. Works the same in the Android app, the website and on a
// second device, where a link would open the browser instead of the app.
export default function Login() {
  const { backend } = useApp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try { await backend.signIn(email.trim()); setSent(true); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function verify(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try { await backend.verifyCode(email.trim(), code.trim()); } catch {
      setError('That code is not right or has expired. Check the latest email, or send a new code.');
    } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <div className="gamosa" aria-hidden="true" />
      <div className="auth-body stack">
        <h1>NE Stays</h1>
        <p className="hint">Bookings, the tourist register, police reports and GST bills for homestays in the Northeast.</p>
        {!sent ? (
          <form className="stack" onSubmit={send}>
            <Field label="Email" id="lg-email"><input id="lg-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></Field>
            <ErrorBox error={error} />
            <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in code'}</button>
          </form>
        ) : (
          <form className="stack" onSubmit={verify}>
            <div className="box ok">We sent a 6-digit code to <b>{email}</b>. It works for 15 minutes.</div>
            <Field label="Sign-in code" id="lg-code">
              <input id="lg-code" className="pin" inputMode="numeric" autoComplete="one-time-code" maxLength={8} autoFocus
                value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <ErrorBox error={error} />
            <button className="btn primary" disabled={busy || code.length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
            <div className="actions">
              <button type="button" className="btn small ghost" onClick={() => send()} disabled={busy}>Send a new code</button>
              <button type="button" className="btn small ghost" onClick={() => { setSent(false); setCode(''); setError(null); }}>Use another email</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
