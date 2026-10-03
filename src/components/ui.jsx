import { useNavigate } from 'react-router-dom';

export function Field({ label, id, hint, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function PageHead({ title, back, children }) {
  const nav = useNavigate();
  return (
    <div className="pagehead">
      {back && <button className="btn small ghost no-print" onClick={() => nav(-1)} aria-label="Back">←</button>}
      <h2>{title}</h2>
      <div className="spacer" />
      {children}
    </div>
  );
}

export const Pill = ({ sev = 'ok', children }) => <span className={`pill ${sev}`}>{children}</span>;

export const SigImage = ({ sig, alt }) => (sig ? <img className="sig" src={sig.image} alt={alt} /> : <span className="hint">not signed</span>);

export const Empty = ({ children }) => <div className="empty">{children}</div>;

export const ErrorBox = ({ error }) => (error ? <div className="box crit" role="alert">{error}</div> : null);
