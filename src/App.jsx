import { NavLink, Route, Routes, Link } from 'react-router-dom';
import { useApp } from './state.jsx';
import { buildAlerts } from './lib/compliance.js';
import { todayISO, fmtDate, weekday } from './lib/format.js';
import Today from './pages/Today.jsx';
import CalendarPage from './pages/Calendar.jsx';
import NewBooking from './pages/NewBooking.jsx';
import BookingDetail from './pages/BookingDetail.jsx';
import CheckIn from './pages/CheckIn.jsx';
import CheckOut from './pages/CheckOut.jsx';
import Register from './pages/Register.jsx';
import PoliceReport from './pages/PoliceReport.jsx';
import MonthlyReturn from './pages/MonthlyReturn.jsx';
import Compliance from './pages/Compliance.jsx';
import Bills from './pages/Bills.jsx';
import InvoiceView from './pages/InvoiceView.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import IdleLock from './components/IdleLock.jsx';
import { isPublicDemo } from './lib/backend/index.js';

const ICONS = {
  today: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  register: <><path d="M5 3h11l3 3v15H5z" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
  compliance: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  bills: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
};
const Icon = ({ name }) => <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>;

export default function App() {
  const { status, error, property, data, backend, boot } = useApp();

  if (status === 'loading') return <div className="center hint">Opening your homestay…</div>;
  if (status === 'misconfigured') return (
    <div className="center"><div className="box crit">This app is not connected to its database yet, so it will not store guest details. The owner needs to add the Supabase keys (see README).</div></div>
  );
  if (status === 'error') return (
    <div className="center"><div className="box crit">Could not load: {error}</div><button className="btn" onClick={boot}>Try again</button></div>
  );
  if (status === 'signedOut') return <Login />;
  if (status === 'onboarding') return <Onboarding />;

  const today = todayISO();
  const crit = buildAlerts({ today, property, data }).filter(a => a.sev === 'crit').length;

  return (
    <IdleLock>
    <div className="shell">
      <div className="gamosa" aria-hidden="true" />
      {isPublicDemo(backend) && (
        <div className="demo-banner no-print" role="note">Demo with sample data. Do not enter real guest details: anything typed here stays only in this browser.</div>
      )}
      <header className="top no-print">
        <div className="top-main">
          <div className="name">{property.name}{backend.mode === 'demo' && <span className="demo-pill">DEMO</span>}</div>
          <div className="sub">{[property.district, `${weekday(today)}, ${fmtDate(today)}`].filter(Boolean).join(' · ')}</div>
        </div>
        <Link className="btn small ghost" to="/settings" aria-label="Settings">Settings</Link>
      </header>
      <main className="screen">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/bookings/new" element={<NewBooking />} />
          <Route path="/bookings/:id" element={<BookingDetail />} />
          <Route path="/checkin/:id" element={<CheckIn />} />
          <Route path="/checkout/:id" element={<CheckOut />} />
          <Route path="/register" element={<Register />} />
          <Route path="/police" element={<PoliceReport />} />
          <Route path="/monthly" element={<MonthlyReturn />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/bills/:id" element={<InvoiceView />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Today />} />
        </Routes>
      </main>
      <nav className="nav no-print" aria-label="Sections">
        {[['/', 'today', 'Today'], ['/calendar', 'calendar', 'Calendar'], ['/register', 'register', 'Register'], ['/compliance', 'compliance', 'Compliance'], ['/bills', 'bills', 'Bills']].map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>
            <Icon name={icon} />{label}
            {icon === 'compliance' && crit > 0 && <span className="badge">{crit}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
    </IdleLock>
  );
}
