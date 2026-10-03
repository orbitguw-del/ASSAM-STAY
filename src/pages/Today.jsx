import { Link } from 'react-router-dom';
import { useApp } from '../state.jsx';
import { buildAlerts } from '../lib/compliance.js';
import { todayISO, fmtShort, nightsBetween } from '../lib/format.js';
import { Empty, Pill } from '../components/ui.jsx';

export default function Today() {
  const { property, data, staffName } = useApp();
  const today = todayISO();
  const roomName = id => data.rooms.find(r => r.id === id)?.name || '';
  const live = data.bookings.filter(b => b.status !== 'cancelled');
  const inHouse = live.filter(b => b.status === 'in');
  const arrivals = live.filter(b => b.check_in === today);
  const departures = live.filter(b => b.check_out === today && b.status === 'in');
  const alerts = buildAlerts({ today, property, data });
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="stack">
      <h2>{greet}, {staffName.split(' ')[0]}</h2>
      <div className="tiles">
        <div className="tile"><div className="n">{inHouse.reduce((s, b) => s + b.guests, 0)}</div><div className="l">guests in house</div></div>
        <div className="tile"><div className="n">{arrivals.filter(b => b.status === 'confirmed').length}</div><div className="l">arrivals left</div></div>
        <div className="tile"><div className="n">{departures.length}</div><div className="l">departures left</div></div>
      </div>

      <section>
        <h3>Needs attention</h3>
        <div className="list">
          {alerts.length ? alerts.map((a, i) => (
            <div className="item" key={i}>
              <span className={`sev ${a.sev}`} />
              <div className="main"><div className="t">{a.title}</div><div className="d">{a.detail}</div></div>
              <Link className="btn small" to={a.to}>{a.action}</Link>
            </div>
          )) : <Empty>Nothing due. The police report, returns and licences are up to date.</Empty>}
        </div>
      </section>

      <section>
        <h3>Arrivals today</h3>
        <div className="list">
          {arrivals.length ? arrivals.map(b => (
            <div className="item" key={b.id}>
              <div className="main">
                <div className="t">{b.guest_name}</div>
                <div className="d">{b.source} · {roomName(b.room_id)} · {b.guests} guest{b.guests > 1 ? 's' : ''} · {nightsBetween(b.check_in, b.check_out)} nights</div>
              </div>
              {b.status === 'confirmed' ? <Link className="btn small primary" to={`/checkin/${b.id}`}>Check in</Link> : <Pill>Checked in</Pill>}
            </div>
          )) : <Empty>No arrivals today.</Empty>}
        </div>
      </section>

      <section>
        <h3>Departures today</h3>
        <div className="list">
          {departures.length ? departures.map(b => (
            <div className="item" key={b.id}>
              <div className="main"><div className="t">{b.guest_name}</div><div className="d">{roomName(b.room_id)}</div></div>
              <Link className="btn small" to={`/checkout/${b.id}`}>Check out</Link>
            </div>
          )) : <Empty>No departures left today.</Empty>}
        </div>
      </section>

      <section>
        <h3>In house</h3>
        <div className="list">
          {inHouse.length ? inHouse.map(b => (
            <div className="item" key={b.id}>
              <div className="main"><div className="t">{b.guest_name}</div><div className="d">{roomName(b.room_id)} · until {fmtShort(b.check_out)}</div></div>
              <Link className="btn small" to={`/checkout/${b.id}`}>Check out</Link>
            </div>
          )) : <Empty>Nobody in house.</Empty>}
        </div>
      </section>
    </div>
  );
}
