import { useEffect, useState } from 'react';
import { useApp } from '../state.jsx';
import { getLockSettings, checkPin, removePin, isMarkedLocked, markLocked, touchActivity, lastActivity, getTries, setTries, SIGN_OUT_MINUTES } from '../lib/lock.js';
import { ErrorBox } from './ui.jsx';

const MAX_TRIES = 5;

export default function IdleLock({ children }) {
  const { backend, user, property } = useApp();
  const uid = user.id;
  const [locked, setLocked] = useState(() => {
    const s = getLockSettings(uid);
    return !!s && (isMarkedLocked(uid) || Date.now() - lastActivity() > s.minutes * 60000);
  });

  useEffect(() => {
    let last = 0;
    const onActivity = () => { const now = Date.now(); if (now - last > 5000) { last = now; touchActivity(); } };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));

    const check = () => {
      const s = getLockSettings(uid);
      const idle = Date.now() - lastActivity();
      if (s) {
        if (idle > s.minutes * 60000) { markLocked(uid, true); setLocked(true); }
      } else if (backend.mode === 'supabase' && idle > SIGN_OUT_MINUTES * 60000) {
        backend.signOut();
      }
    };
    check();
    touchActivity();
    const timer = setInterval(check, 15000);
    document.addEventListener('visibilitychange', check);
    return () => {
      events.forEach(e => window.removeEventListener(e, onActivity));
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [backend, uid]);

  if (!locked) return children;
  return <LockScreen uid={uid} backend={backend} property={property} onUnlock={() => { markLocked(uid, false); touchActivity(); setLocked(false); }} />;
}

function LockScreen({ uid, backend, property, onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(() => {
    const left = MAX_TRIES - getTries(uid);
    return left < MAX_TRIES ? `${left} ${left === 1 ? 'try' : 'tries'} left before you are signed out.` : null;
  });

  async function unlock(e) {
    e.preventDefault();
    if (getTries(uid) >= MAX_TRIES) { setError('Too many wrong tries. Use "Forgot PIN" to continue.'); return; }
    if (await checkPin(uid, pin)) { setTries(uid, 0); onUnlock(); return; }
    const n = getTries(uid) + 1;
    setTries(uid, n);
    setPin('');
    if (n >= MAX_TRIES) {
      if (backend.mode === 'supabase') { removePin(uid); await backend.signOut(); return; }
      setError('Too many wrong tries. Use "Forgot PIN" to continue.');
      return;
    }
    setError(`Wrong PIN. ${MAX_TRIES - n} ${MAX_TRIES - n === 1 ? 'try' : 'tries'} left before you are signed out.`);
  }

  async function forgot() {
    removePin(uid);
    if (backend.mode === 'supabase') await backend.signOut();
    else onUnlock();
  }

  return (
    <div className="auth">
      <div className="gamosa" aria-hidden="true" />
      <form className="auth-body stack lock" onSubmit={unlock}>
        <h1>Locked</h1>
        <p className="hint">{property.name}. Enter your PIN to continue.</p>
        <input aria-label="PIN" className="pin" type="password" inputMode="numeric" autoComplete="off" maxLength={6} autoFocus
          value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
        <ErrorBox error={error} />
        <button className="btn primary" disabled={pin.length < 4}>Unlock</button>
        <button type="button" className="btn ghost" onClick={forgot}>Forgot PIN{backend.mode === 'supabase' ? ': sign in again by email' : ''}</button>
      </form>
    </div>
  );
}
