import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getBackend } from './lib/backend/index.js';
import { loadAll } from './lib/api.js';
import { setRuleOverrides } from './lib/rules.js';

const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const backend = useMemo(() => getBackend(), []);
  const [status, setStatus] = useState('loading'); // loading | signedOut | onboarding | ready | error
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [staffName, setStaffName] = useState('');
  const [property, setProperty] = useState(null);
  const [data, setData] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const toastTimer = useRef();

  const toast = useCallback(msg => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4500);
  }, []);

  const boot = useCallback(async () => {
    try {
      const s = await backend.init();
      if (!s.user) { setStatus('signedOut'); return; }
      setUser(s.user);
      setStaffName(s.staffName || s.user.email);
      setRuleOverrides(await backend.getRules());
      const props = await backend.listProperties();
      if (!props.length) { setStatus('onboarding'); return; }
      const p = props[0];
      setProperty(p);
      setData(await loadAll(backend, p));
      setStatus('ready');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  }, [backend]);

  useEffect(() => {
    boot();
    return backend.onAuthChange?.(() => boot());
  }, [backend, boot]);

  const refresh = useCallback(async (nextProperty) => {
    const p = nextProperty || property;
    if (nextProperty) setProperty(nextProperty);
    setData(await loadAll(backend, p));
  }, [backend, property]);

  const value = {
    backend, status, error, user, staffName, property, data, refresh, boot, toast,
    ctx: { property, user, staffName },
  };
  return (
    <AppCtx.Provider value={value}>
      {children}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </AppCtx.Provider>
  );
}

export const useApp = () => useContext(AppCtx);
