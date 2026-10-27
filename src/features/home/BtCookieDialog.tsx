import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  BT_COOKIE_FIELD_NAMES,
  OPTIONAL_BT_COOKIE_NAMES,
  REQUIRED_BT_COOKIE_NAMES,
  buildCookieHeader,
  type BtCookieFieldName,
} from '../../lib/buildertrend/cookieSession';
import './dashboard.css';

const COOKIE_HINTS: Record<BtCookieFieldName, string> = {
  '.AspNetCore.Auth0Cookie': 'Auth0 login cookie (required)',
  'ASP.NET_SessionId': 'ASP.NET session id (required)',
  GAESA: 'Buildertrend session token (required)',
  '.AspNetCore.Auth0CookieC1': 'Auth0 chunk 1 (paste if listed)',
  '.AspNetCore.Auth0CookieC2': 'Auth0 chunk 2 (paste if listed)',
};

const OPTIONAL = new Set<string>(OPTIONAL_BT_COOKIE_NAMES);

type Values = Record<BtCookieFieldName, string>;

function emptyValues(): Values {
  return {
    '.AspNetCore.Auth0Cookie': '',
    'ASP.NET_SessionId': '',
    GAESA: '',
    '.AspNetCore.Auth0CookieC1': '',
    '.AspNetCore.Auth0CookieC2': '',
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
  const [missing, setMissing] = useState<Partial<Record<BtCookieFieldName, boolean>>>({});

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

  const setValue = (name: BtCookieFieldName, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (value.trim()) setMissing((prev) => ({ ...prev, [name]: false }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const nextMissing: Partial<Record<BtCookieFieldName, boolean>> = {};
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
            Copy only the <strong>Value</strong> column for each name below. Buildertrend replaced{' '}
            <code>.AspNet.Auth0</code> with <code>.AspNetCore.Auth0Cookie</code> (plus C1/C2 chunks when
            present).
          </li>
        </ol>

        <form className="dash-cookie-form" onSubmit={handleSubmit}>
          {BT_COOKIE_FIELD_NAMES.map((name, index) => {
            const fieldId = `bt-cookie-${index}`;
            const optional = OPTIONAL.has(name);
            return (
              <label key={name} className="dash-cookie-field" htmlFor={fieldId}>
                <span className="dash-cookie-field-label">
                  <code>{name}</code>
                  <em>
                    {COOKIE_HINTS[name]}
                    {optional ? ' · optional' : ''}
                  </em>
                </span>
                <input
                  ref={index === 0 ? firstFieldRef : undefined}
                  id={fieldId}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={optional ? 'Paste if this cookie exists' : 'Paste value only'}
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
