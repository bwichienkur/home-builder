import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  REQUIRED_BT_COOKIE_NAMES,
  buildCookieHeader,
  type RequiredBtCookieName,
} from '../../lib/buildertrend/cookieSession';
import './dashboard.css';

const COOKIE_HINTS: Record<RequiredBtCookieName, string> = {
  '.AspNet.Auth0': 'Login session token',
  'ASP.NET_SessionId': 'ASP.NET session id',
  GAESA: 'Buildertrend session token',
};

type Values = Record<RequiredBtCookieName, string>;

function emptyValues(): Values {
  return {
    '.AspNet.Auth0': '',
    'ASP.NET_SessionId': '',
    GAESA: '',
  };
}

export function BtCookieDialog({
  reason,
  error,
  busy,
  onSubmit,
  onCancel,
}: {
  reason?: string;
  error?: string;
  busy?: boolean;
  onSubmit: (cookieHeader: string) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<Values>(emptyValues);
  const [missing, setMissing] = useState<Partial<Record<RequiredBtCookieName, boolean>>>({});

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  const setValue = (name: RequiredBtCookieName, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (value.trim()) setMissing((prev) => ({ ...prev, [name]: false }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const nextMissing: Partial<Record<RequiredBtCookieName, boolean>> = {};
    let ok = true;
    for (const name of REQUIRED_BT_COOKIE_NAMES) {
      if (!values[name].trim()) {
        nextMissing[name] = true;
        ok = false;
      }
    }
    setMissing(nextMissing);
    if (!ok) return;
    const header = buildCookieHeader(values);
    if (!header) return;
    onSubmit(header);
  };

  return (
    <div
      className="dash-cookie-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <section
        className="dash-cookie-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dash-cookie-head">
          <div>
            <p className="eyebrow">Buildertrend refresh</p>
            <h2 id={titleId}>Paste cookie values</h2>
          </div>
          <button
            type="button"
            className="dash-cookie-close"
            onClick={onCancel}
            aria-label="Cancel"
            disabled={busy}
          >
            ×
          </button>
        </header>

        <p className="dash-cookie-lede">
          {reason?.trim() ||
            'Enter these once. They are saved in this browser and reused until Buildertrend rejects them.'}
        </p>

        {error ? (
          <p className="dash-cookie-error" role="alert">
            {error}
          </p>
        ) : null}

        <ol className="dash-cookie-steps">
          <li>Open your logged-in Buildertrend tab</li>
          <li>
            Press <kbd>F12</kbd> → <strong>Application</strong> → <strong>Cookies</strong> →{' '}
            <code>https://buildertrend.net</code>
          </li>
          <li>
            Click each cookie name below and copy only the <strong>Value</strong> column (not the name)
          </li>
        </ol>

        <form className="dash-cookie-form" onSubmit={handleSubmit}>
          {REQUIRED_BT_COOKIE_NAMES.map((name, index) => {
            const fieldId = `bt-cookie-${index}`;
            return (
              <label key={name} className="dash-cookie-field" htmlFor={fieldId}>
                <span className="dash-cookie-field-label">
                  <code>{name}</code>
                  <em>{COOKIE_HINTS[name]}</em>
                </span>
                <input
                  ref={index === 0 ? firstFieldRef : undefined}
                  id={fieldId}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste value only"
                  value={values[name]}
                  disabled={busy}
                  aria-invalid={missing[name] ? true : undefined}
                  onChange={(event) => setValue(name, event.target.value)}
                />
                {missing[name] ? <span className="dash-cookie-field-error">Required</span> : null}
              </label>
            );
          })}

          <footer className="dash-cookie-actions">
            <button type="button" className="dash-cookie-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="dash-cookie-primary" disabled={busy} aria-busy={busy}>
              {busy ? 'Pulling…' : 'Save & refresh'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
