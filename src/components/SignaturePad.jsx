import { useEffect, useRef } from 'react';

// Finger or mouse signature. Reports a PNG data URL (scaled to 480x160) or null when cleared.
export default function SignaturePad({ label, onChange }) {
  const canvasRef = useRef(null);
  const state = useRef({ drawing: false, last: null, has: false });

  useEffect(() => {
    const c = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = Math.max(1, r.width * ratio);
    c.height = Math.max(1, r.height * ratio);
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1C2A6B';
  }, []);

  const pos = e => { const b = canvasRef.current.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };

  function exportImage() {
    const src = canvasRef.current, out = document.createElement('canvas');
    out.width = 480; out.height = 160;
    out.getContext('2d').drawImage(src, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  const down = e => {
    state.current.drawing = true;
    state.current.last = pos(e);
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  };
  const move = e => {
    const s = state.current;
    if (!s.drawing) return;
    const p = pos(e), ctx = canvasRef.current.getContext('2d');
    ctx.beginPath(); ctx.moveTo(s.last[0], s.last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
    s.last = p; s.has = true;
  };
  const up = () => {
    const s = state.current;
    if (!s.drawing) return;
    s.drawing = false;
    if (s.has) onChange(exportImage());
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    state.current.has = false;
    onChange(null);
  };

  return (
    <div className="sigpad">
      <div className="padbox">
        <canvas ref={canvasRef} aria-label={label} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
        <span className="padlabel">{label}</span>
      </div>
      <div className="row-between">
        <span className="hint">Sign with a finger or the mouse.</span>
        <button type="button" className="btn small" onClick={clear}>Clear</button>
      </div>
    </div>
  );
}
