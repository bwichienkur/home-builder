import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Copy, KeyRound, Search, Shield } from 'lucide-react';
import type { AdminUserRow, ApiKeyMeta } from '../../lib/platform/authProvider';
import { getAuthProvider } from '../../lib/platform/getAuthProvider';
import { canManageUsers, ROLE_LABELS, USER_ROLES, type UserRole } from '../../lib/platform/roles';
import { useAuthStore } from '../../store/authStore';
import '../docs/apiDocs.css';

export function UsersPage() {
  const sessionUser = useAuthStore((s) => s.user);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKeyMeta[]>([]);
  const [keyLabel, setKeyLabel] = useState('Vendor integration');
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const provider = getAuthProvider();
  const selected = useMemo(() => users.find((u) => u.id === selectedId) ?? null, [users, selectedId]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2800);
  };

  const refreshUsers = useCallback(
    async (q = query) => {
      if (!provider.listUsers) {
        setError('User directory is not available for this auth provider.');
        return;
      }
      setBusy(true);
      setError('');
      try {
        const items = await provider.listUsers(q);
        setUsers(items);
        setSelectedId((prev) => prev ?? items[0]?.id ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load users.');
      } finally {
        setBusy(false);
      }
    },
    [provider, query],
  );

  const refreshKeys = useCallback(
    async (userId: string) => {
      if (!provider.listApiKeys) return;
      try {
        setKeys(await provider.listApiKeys(userId));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load API keys.');
      }
    },
    [provider],
  );

  useEffect(() => {
    void refreshUsers('');
  }, [refreshUsers]);

  useEffect(() => {
    if (selectedId) void refreshKeys(selectedId);
    else setKeys([]);
    setFreshKey(null);
  }, [selectedId, refreshKeys]);

  if (!canManageUsers(sessionUser?.role)) {
    return <Navigate to="/" replace />;
  }

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    void refreshUsers(query);
  };

  const onRoleChange = async (role: UserRole) => {
    if (!selected || !provider.setUserRole) return;
    setBusy(true);
    const result = await provider.setUserRole(selected.id, role);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    flash(`Role updated to ${ROLE_LABELS[role]}`);
    await refreshUsers(query);
  };

  const onCreateKey = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !provider.createApiKey) return;
    setBusy(true);
    const result = await provider.createApiKey(selected.id, keyLabel);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFreshKey(result.key);
    setKeyLabel('Vendor integration');
    flash('API key created — copy it now; it will not be shown again.');
    await refreshKeys(selected.id);
    await refreshUsers(query);
  };

  const onRevoke = async (keyId: string) => {
    if (!selected || !provider.revokeApiKey) return;
    if (!window.confirm('Revoke this API key? Integrations using it will stop working.')) return;
    setBusy(true);
    const result = await provider.revokeApiKey(selected.id, keyId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    flash('API key revoked');
    setFreshKey(null);
    await refreshKeys(selected.id);
    await refreshUsers(query);
  };

  const copyKey = async () => {
    if (!freshKey) return;
    try {
      await navigator.clipboard.writeText(freshKey);
      flash('API key copied');
    } catch {
      setError('Could not copy to clipboard.');
    }
  };

  return (
    <div className="data-page users-page">
      <header className="data-page-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Users</h1>
          <p className="muted">Search accounts, assign roles, and issue API keys for external integrations.</p>
        </div>
      </header>

      {notice && (
        <p className="users-banner is-ok" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="users-banner is-error" role="alert">
          {error}
        </p>
      )}

      <form className="users-search" onSubmit={onSearch}>
        <Search size={16} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, role…"
          aria-label="Search users"
        />
        <button type="submit" className="primary" disabled={busy}>
          Search
        </button>
      </form>

      <div className="users-layout">
        <section className="users-list data-table-wrap" aria-label="User directory">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Keys</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <p className="muted">{busy ? 'Loading…' : 'No users match that search.'}</p>
                  </td>
                </tr>
              )}
              {users.map((user) => (
                <tr
                  key={user.id}
                  className={user.id === selectedId ? 'is-selected' : undefined}
                  onClick={() => setSelectedId(user.id)}
                >
                  <td>
                    <button type="button" className="users-row-btn" onClick={() => setSelectedId(user.id)}>
                      <strong>{user.name}</strong>
                    </button>
                  </td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`users-role-pill role-${user.role}`}>{ROLE_LABELS[user.role]}</span>
                  </td>
                  <td>{user.apiKeyCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="users-detail" aria-label="Selected user">
          {!selected ? (
            <p className="muted">Select a user to manage roles and API keys.</p>
          ) : (
            <>
              <header>
                <Shield size={18} aria-hidden />
                <div>
                  <strong>{selected.name}</strong>
                  <span>{selected.email}</span>
                </div>
              </header>

              <label className="users-field">
                Role
                <select
                  value={selected.role}
                  disabled={busy}
                  onChange={(e) => void onRoleChange(e.target.value as UserRole)}
                >
                  {USER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </label>

              <section className="users-keys">
                <h2>
                  <KeyRound size={16} aria-hidden /> API keys
                </h2>
                <p className="muted">Keys authenticate `POST /api/v1/*` from vendors or external apps.</p>

                {freshKey && (
                  <div className="users-fresh-key">
                    <code>{freshKey}</code>
                    <button type="button" onClick={() => void copyKey()} aria-label="Copy API key">
                      <Copy size={15} /> Copy
                    </button>
                  </div>
                )}

                <form className="users-key-form" onSubmit={(e) => void onCreateKey(e)}>
                  <input
                    type="text"
                    value={keyLabel}
                    onChange={(e) => setKeyLabel(e.target.value)}
                    placeholder="Key label"
                    aria-label="API key label"
                  />
                  <button type="submit" className="primary" disabled={busy}>
                    Generate key
                  </button>
                </form>

                <ul>
                  {keys.length === 0 && <li className="muted">No keys yet.</li>}
                  {keys.map((key) => (
                    <li key={key.id} className={key.revokedAt ? 'is-revoked' : undefined}>
                      <div>
                        <strong>{key.label}</strong>
                        <span>
                          {key.prefix} · {new Date(key.createdAt).toLocaleDateString()}
                          {key.revokedAt ? ' · revoked' : ''}
                        </span>
                      </div>
                      {!key.revokedAt && (
                        <button type="button" onClick={() => void onRevoke(key.id)} disabled={busy}>
                          Revoke
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
