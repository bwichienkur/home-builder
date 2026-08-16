import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  CORE_CSV,
  CUSTOM_FIELD_TYPE_OPTIONS,
  builtinFieldType,
  coreFieldLabel,
  customFieldTypeLabel,
  isPicklistType,
  type CustomFieldDefinition,
  type CustomFieldType,
  type EntityKind,
} from '../../lib/crm/types';
import { platformConfig } from '../../lib/platform/config';
import { useCrmStore } from '../../store/crmStore';

const OBJECTS: { id: EntityKind; label: string }[] = [
  { id: 'client', label: 'Clients' },
  { id: 'vendor', label: 'Vendors' },
  { id: 'inventory', label: 'Inventory' },
];

type FieldRow = {
  id: string;
  label: string;
  key: string;
  type: CustomFieldType;
  source: 'builtin' | 'custom';
  required: boolean;
  custom?: CustomFieldDefinition;
};

function ObjectTypeahead({
  value,
  onChange,
}: {
  value: EntityKind | null;
  onChange: (next: EntityKind | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = OBJECTS.find((o) => o.id === value) ?? null;

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return OBJECTS;
    return OBJECTS.filter((o) => o.label.toLowerCase().includes(q) || o.id.includes(q));
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="settings-typeahead" ref={rootRef}>
      <label className="settings-filter-label" htmlFor="settings-object-search">
        Object
      </label>
      <div className="settings-typeahead-control">
        <input
          id="settings-object-search"
          role="combobox"
          aria-expanded={open}
          aria-controls="settings-object-listbox"
          aria-autocomplete="list"
          placeholder="Search clients, vendors, inventory…"
          value={open || !selected ? query : selected.label}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (selected) onChange(null);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
        />
        {selected && (
          <button
            type="button"
            className="settings-typeahead-clear"
            aria-label="Clear object selection"
            onClick={() => {
              onChange(null);
              setQuery('');
              setOpen(false);
            }}
          >
            Clear
          </button>
        )}
      </div>
      {open && (
        <ul id="settings-object-listbox" role="listbox" className="settings-typeahead-menu">
          {options.length === 0 ? (
            <li className="settings-typeahead-empty">No matching objects</li>
          ) : (
            options.map((o) => (
              <li key={o.id} role="option" aria-selected={value === o.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.id);
                    setQuery('');
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export function SettingsPage() {
  const fields = useCrmStore((s) => s.customFields);
  const upsert = useCrmStore((s) => s.upsertCustomField);
  const archive = useCrmStore((s) => s.archiveCustomField);
  const [object, setObject] = useState<EntityKind | null>('client');
  const [fieldQuery, setFieldQuery] = useState('');
  const [draft, setDraft] = useState<CustomFieldDefinition | null>(null);
  const [error, setError] = useState('');

  const activeMeta = object ? OBJECTS.find((o) => o.id === object)! : null;

  const rows = useMemo(() => {
    if (!object) return [] as FieldRow[];
    const builtin: FieldRow[] = CORE_CSV[object].map((key) => ({
      id: `builtin-${key}`,
      label: coreFieldLabel(key),
      key,
      type: builtinFieldType(key),
      source: 'builtin',
      required: key === 'name' || key === 'sku' || key === 'category',
    }));
    const custom: FieldRow[] = fields
      .filter((f) => f.entity === object && !f.archived)
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
      .map((f) => ({
        id: f.id,
        label: f.label,
        key: f.key,
        type: f.type === 'select' ? 'picklist' : f.type,
        source: 'custom',
        required: f.required,
        custom: f,
      }));
    return [...builtin, ...custom];
  }, [fields, object]);

  const filteredRows = useMemo(() => {
    const q = fieldQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.key.toLowerCase().includes(q) ||
        customFieldTypeLabel(r.type).toLowerCase().includes(q),
    );
  }, [rows, fieldQuery]);

  const customCount = useMemo(
    () => (object ? fields.filter((f) => f.entity === object && !f.archived).length : 0),
    [fields, object],
  );

  const startNew = () => {
    if (!object) return;
    setError('');
    setDraft({
      id: crypto.randomUUID(),
      entity: object,
      key: '',
      label: '',
      type: 'text',
      required: false,
      options: [],
      order: customCount,
      archived: false,
    });
  };

  const saveDraft = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!/^[a-z][a-z0-9_]*$/.test(draft.key)) {
      setError('Key must start with a letter and use only lowercase letters, numbers, and underscores.');
      return;
    }
    if (CORE_CSV[draft.entity].includes(draft.key)) {
      setError(`“${draft.key}” is already a built-in ${draft.entity} field.`);
      return;
    }
    const clash = fields.some(
      (f) =>
        !f.archived &&
        f.entity === draft.entity &&
        f.key === draft.key &&
        f.id !== draft.id,
    );
    if (clash) {
      setError(`A ${draft.entity} field already uses the key “${draft.key}”.`);
      return;
    }
    const type = draft.type === 'select' ? 'picklist' : draft.type;
    upsert({ ...draft, type, entity: draft.entity });
    setObject(draft.entity);
    setDraft(null);
    setError('');
  };

  const draftMeta = OBJECTS.find((o) => o.id === (draft?.entity ?? object ?? 'client'))!;

  return (
    <div className="data-page">
      <header className="data-page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Fields</h1>
          <p className="muted">
            Choose an object to list its built-in and custom fields. Custom fields stay scoped to that object.
          </p>
          <p className="muted" style={{ marginTop: 8 }}>
            Platform: <strong>{platformConfig.label()}</strong>
          </p>
        </div>
        <div className="data-page-actions">
          <button type="button" className="primary" onClick={startNew} disabled={!object}>
            Add custom field
          </button>
        </div>
      </header>

      <div className="settings-filters">
        <ObjectTypeahead
          value={object}
          onChange={(next) => {
            setObject(next);
            setFieldQuery('');
            setDraft(null);
            setError('');
          }}
        />
        <div className="settings-field-search">
          <label className="settings-filter-label" htmlFor="settings-field-query">
            Search fields
          </label>
          <div className="settings-typeahead-control">
            <input
              id="settings-field-query"
              placeholder={object ? `Search ${activeMeta?.label.toLowerCase()} field names…` : 'Select an object first'}
              value={fieldQuery}
              disabled={!object}
              onChange={(e) => setFieldQuery(e.target.value)}
            />
            {fieldQuery && (
              <button
                type="button"
                className="settings-typeahead-clear"
                aria-label="Clear field search"
                onClick={() => setFieldQuery('')}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {!object ? (
        <div className="data-empty">Select Clients, Vendors, or Inventory to view fields.</div>
      ) : (
        <section className="settings-field-block">
          <div className="settings-field-block-head">
            <h2 className="settings-section-title">{activeMeta?.label} fields</h2>
            <span className="muted">
              {filteredRows.length} shown · {rows.length} total
            </span>
          </div>
          <div className="data-table-wrap">
            {filteredRows.length === 0 ? (
              <div className="data-empty">No fields match “{fieldQuery}”.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Key</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th>Required</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.label}</td>
                      <td>
                        <code>{r.key}</code>
                      </td>
                      <td>{customFieldTypeLabel(r.type)}</td>
                      <td>{r.source === 'builtin' ? 'Built-in' : 'Custom'}</td>
                      <td>{r.required ? 'Yes' : 'No'}</td>
                      <td>
                        {r.source === 'custom' && r.custom ? (
                          <>
                            <button
                              type="button"
                              className="auth-link"
                              onClick={() => {
                                setError('');
                                setDraft({
                                  ...r.custom!,
                                  type: r.custom!.type === 'select' ? 'picklist' : r.custom!.type,
                                });
                              }}
                            >
                              Edit
                            </button>
                            {' · '}
                            <button type="button" className="auth-link" onClick={() => archive(r.custom!.id)}>
                              Archive
                            </button>
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {draft && (
        <div
          className="data-drawer data-drawer-fullscreen"
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && setDraft(null)}
        >
          <div className="data-drawer-panel data-drawer-panel-full" role="dialog" aria-modal="true">
            <div className="data-drawer-header">
              <h2>
                {fields.some((f) => f.id === draft.id) ? 'Edit' : 'Add'}{' '}
                {draftMeta.label.toLowerCase().replace(/s$/, '')} custom field
              </h2>
              <button type="button" className="data-drawer-close" onClick={() => setDraft(null)}>
                Close
              </button>
            </div>
            <div className="data-drawer-body">
              <form className="data-form" onSubmit={saveDraft}>
                <p className="muted" style={{ margin: 0 }}>
                  Applies only to <strong>{draftMeta.label}</strong> — not other objects.
                </p>
                <label>
                  Object
                  <select
                    value={draft.entity}
                    onChange={(e) => setDraft({ ...draft, entity: e.target.value as EntityKind })}
                    disabled={fields.some((f) => f.id === draft.id)}
                  >
                    {OBJECTS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Label
                  <input
                    required
                    value={draft.label}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  />
                </label>
                <label>
                  Key
                  <input
                    required
                    pattern="^[a-z][a-z0-9_]*$"
                    value={draft.key}
                    onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                    placeholder="lead_source"
                  />
                </label>
                <label>
                  Type
                  <select
                    value={draft.type === 'select' ? 'picklist' : draft.type}
                    onChange={(e) => setDraft({ ...draft, type: e.target.value as CustomFieldType })}
                  >
                    {CUSTOM_FIELD_TYPE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                {isPicklistType(draft.type) && (
                  <label>
                    Picklist options (comma-separated)
                    <input
                      value={draft.options.join(', ')}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          options: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </label>
                )}
                <label className="data-form-check">
                  <input
                    type="checkbox"
                    checked={draft.required}
                    onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
                  />
                  Required
                </label>
                {error && <p className="auth-error">{error}</p>}
                <div className="data-form-actions">
                  <button type="submit" className="primary">
                    Save
                  </button>
                  <button type="button" onClick={() => setDraft(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
