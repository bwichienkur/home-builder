import { useMemo, useState } from 'react';
import type { CustomFieldDefinition, EntityKind } from '../../lib/crm/types';
import { csvHeaders, downloadCsv, parseCsv, rowsToObjects } from '../../lib/crm/csv';

type Props = {
  entity: EntityKind;
  title: string;
  lede: string;
  fields: CustomFieldDefinition[];
  columns: { key: string; label: string; render: (row: any) => React.ReactNode }[];
  rows: any[];
  onAdd: () => void;
  onEdit: (row: any) => void;
  onArchive: (id: string) => void;
  onImportRows: (objects: { row: number; values: Record<string, string> }[]) => {
    created: number;
    errors: string[];
  };
  templateExample?: string[];
};

export function EntityCrmPage({
  entity,
  title,
  lede,
  fields,
  columns,
  rows,
  onAdd,
  onEdit,
  onArchive,
  onImportRows,
  templateExample,
}: Props) {
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const headers = useMemo(() => csvHeaders(entity, fields), [entity, fields]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [rows, query]);

  const exportTemplate = () => {
    downloadCsv(`${entity}-template.csv`, [headers, templateExample ?? headers.map(() => '')]);
  };

  const exportData = () => {
    const dataRows = rows.map((r) =>
      headers.map((h) => {
        if (h.startsWith('custom.')) return r.customFields?.[h.slice(7)] ?? '';
        return r[h] ?? '';
      }),
    );
    downloadCsv(`${entity}-export.csv`, [headers, ...dataRows]);
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    const table = parseCsv(text);
    if (table.length < 2) {
      setNotice('CSV needs a header row and at least one data row.');
      return;
    }
    const hdr = table[0]!.map((h) => h.trim());
    const objects = rowsToObjects(hdr, table.slice(1));
    const result = onImportRows(objects);
    setNotice(
      result.errors.length
        ? `Imported ${result.created}. ${result.errors.length} row error(s): ${result.errors.slice(0, 3).join(' · ')}`
        : `Imported ${result.created} row(s).`,
    );
  };

  return (
    <div className="data-page">
      <header className="data-page-header">
        <div>
          <p className="eyebrow">{entity}</p>
          <h1>{title}</h1>
          <p className="muted">{lede}</p>
        </div>
        <div className="data-page-actions">
          <button type="button" onClick={exportTemplate}>
            Template CSV
          </button>
          <button type="button" onClick={exportData} disabled={!rows.length}>
            Export CSV
          </button>
          <label className="file-btn">
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = '';
              }}
            />
          </label>
          <button type="button" className="primary" onClick={onAdd}>
            Add {entity}
          </button>
        </div>
      </header>
      <div style={{ marginBottom: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          style={{
            width: 'min(360px, 100%)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: '10px 12px',
          }}
        />
      </div>
      {notice && <p className="muted" style={{ marginBottom: 12 }}>{notice}</p>}
      <div className="data-table-wrap">
        {filtered.length === 0 ? (
          <div className="data-empty">
            No {entity} records yet. Add one manually or import a CSV template.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => (
                    <td key={c.key}>{c.render(row)}</td>
                  ))}
                  <td>
                    <button type="button" className="auth-link" onClick={() => onEdit(row)}>
                      Edit
                    </button>
                    {' · '}
                    <button type="button" className="auth-link" onClick={() => onArchive(row.id)}>
                      Archive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function EntityDrawer({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="data-drawer" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="data-drawer-panel" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function CustomFieldsInputs({
  entity,
  fields,
  values,
  onChange,
}: {
  entity: EntityKind;
  fields: CustomFieldDefinition[];
  values: Record<string, string | number | boolean | null>;
  onChange: (next: Record<string, string | number | boolean | null>) => void;
}) {
  const active = fields.filter((f) => f.entity === entity && !f.archived).sort((a, b) => a.order - b.order);
  if (!active.length) return null;
  return (
    <>
      {active.map((f) => (
        <label key={f.id}>
          {f.label}
          {f.type === 'bool' ? (
            <input
              type="checkbox"
              checked={Boolean(values[f.key])}
              onChange={(e) => onChange({ ...values, [f.key]: e.target.checked })}
            />
          ) : f.type === 'select' ? (
            <select
              value={String(values[f.key] ?? '')}
              onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
            >
              <option value="">—</option>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
              value={values[f.key] == null ? '' : String(values[f.key])}
              onChange={(e) =>
                onChange({
                  ...values,
                  [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value,
                })
              }
              required={f.required}
            />
          )}
        </label>
      ))}
    </>
  );
}
