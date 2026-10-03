import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../state.jsx';
import { todayISO, addDays, nightsBetween, weekday, fmtShort, inr } from '../lib/format.js';
import { PageHead } from '../components/ui.jsx';

const DAYS = 14;

export default function CalendarPage() {
  const { data } = useApp();
  const nav = useNavigate();
  const today = todayISO();
  const [start, setStart] = useState(addDays(today, -2));
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  const rooms = data.rooms.filter(r => r.active);

  return (
    <div className="stack">
      <PageHead title="Calendar">
        <button className="btn small" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week">‹</button>
        <button className="btn small" onClick={() => setStart(addDays(today, -2))}>Today</button>
        <button className="btn small" onClick={() => setStart(addDays(start, 7))} aria-label="Next week">›</button>
      </PageHead>
      <div className="scroll-x">
        <div className="cal" style={{ gridTemplateColumns: `6.2rem repeat(${DAYS}, 2.8rem)` }}>
          <div className="hd corner" />
          {days.map(d => (
            <div key={d} className={`hd ${d === today ? 'today' : ''}`}>{weekday(d).slice(0, 2)}<br />{Number(d.slice(8))}</div>
          ))}
          {rooms.map((r, ri) => {
            const row = ri + 2;
            return [
              <div key={r.id} className="rn" style={{ gridRow: row, gridColumn: 1 }}>{r.name}<br /><span className="hint">{inr(r.tariff)}</span></div>,
              ...days.map((d, di) => (
                <button key={r.id + d} className={`cell ${d === today ? 'today' : ''}`} style={{ gridRow: row, gridColumn: di + 2 }}
                  onClick={() => nav(`/bookings/new?room=${r.id}&date=${d}`)} aria-label={`New booking, ${r.name}, ${fmtShort(d)}`} />
              )),
              ...data.bookings.filter(b => b.room_id === r.id && b.status !== 'cancelled').map(b => {
                const s = Math.max(0, nightsBetween(start, b.check_in)), e = Math.min(DAYS, nightsBetween(start, b.check_out));
                if (e <= 0 || s >= DAYS) return null;
                return (
                  <Link key={b.id} to={`/bookings/${b.id}`} className={`bar s-${b.source.replace(/[^a-z]/gi, '').toLowerCase()} st-${b.status}`}
                    style={{ gridRow: row, gridColumn: `${s + 2} / ${e + 2}` }} title={`${b.guest_name} · ${b.source} · ${fmtShort(b.check_in)} to ${fmtShort(b.check_out)}`}>
                    {b.guest_name}
                  </Link>
                );
              }),
            ];
          })}
        </div>
      </div>
      <p className="hint">Tap an empty day to add a booking. The database refuses any booking that overlaps another stay in the same room, from any channel. Faded bars are checked out.</p>
    </div>
  );
}
