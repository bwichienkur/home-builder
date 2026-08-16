import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Client } from '../../lib/crm/types';
import { listSharedDesigns, type SharedDesign } from '../../lib/designShare';
import { useCrmStore } from '../../store/crmStore';
import { CustomFieldsInputs, EntityCrmPage, EntityDrawer } from './EntityCrmPage';

const empty = (): Partial<Client> & { name: string } => ({
  name: '',
  email: '',
  phone: '',
  company: '',
  address: '',
  notes: '',
  customFields: {},
});

export function ClientsPage() {
  const allClients = useCrmStore((s) => s.clients);
  const clients = useMemo(() => (allClients ?? []).filter((c) => !c.archived), [allClients]);
  const fields = useCrmStore((s) => s.customFields);
  const upsert = useCrmStore((s) => s.upsertClient);
  const archive = useCrmStore((s) => s.archiveEntity);
  const [draft, setDraft] = useState<Partial<Client> & { name: string } | null>(null);
  const [designs, setDesigns] = useState<SharedDesign[]>(() => listSharedDesigns());

  useEffect(() => {
    const refresh = () => setDesigns(listSharedDesigns());
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [draft, clients]);

  const buildsFor = (clientId: string) =>
    designs.filter((d) => (d.payload as { clientId?: string | null }).clientId === clientId);

  return (
    <>
      <EntityCrmPage
        entity="client"
        title="Clients"
        lede="Homeowners and job contacts. Link a build from the studio project menu, then open it here."
        fields={fields}
        rows={clients}
        templateExample={['Jane Doe', 'jane@example.com', '555-0100', 'Doe Homes', '12 Oak St', 'Lead from showroom']}
        columns={[
          { key: 'name', label: 'Name', render: (r) => r.name },
          { key: 'email', label: 'Email', render: (r) => r.email || '—' },
          { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
          { key: 'company', label: 'Company', render: (r) => r.company || '—' },
          {
            key: 'builds',
            label: 'Builds',
            render: (r) => {
              const linked = buildsFor(r.id);
              if (!linked.length) return '—';
              return (
                <span className="client-builds">
                  {linked.slice(0, 3).map((d) => (
                    <a key={d.code} href={`/build?design=${d.code}`} className="client-build-link">
                      {d.name || d.code}
                      {d.payload.estimateSnapshot
                        ? ` · est v${d.payload.estimateSnapshot.version} ($${Math.round(
                            d.payload.estimateSnapshot.totals.grandTotal,
                          ).toLocaleString()})`
                        : ''}
                      {(d.payload.changeOrders?.length ?? 0) > 0
                        ? ` · ${d.payload.changeOrders!.length} CO`
                        : ''}
                    </a>
                  ))}
                  {linked.length > 3 ? ` +${linked.length - 3}` : ''}
                </span>
              );
            },
          },
        ]}
        onAdd={() => setDraft(empty())}
        onEdit={(row) => setDraft({ ...row })}
        onArchive={(id) => archive('client', id)}
        onImportRows={(objects) => {
          const errors: string[] = [];
          let created = 0;
          for (const { row, values } of objects) {
            if (!values.name) {
              errors.push(`Row ${row}: name required`);
              continue;
            }
            const customFields: Record<string, string> = {};
            for (const [k, v] of Object.entries(values)) {
              if (k.startsWith('custom.')) customFields[k.slice(7)] = v;
            }
            upsert({
              name: values.name,
              email: values.email ?? '',
              phone: values.phone ?? '',
              company: values.company ?? '',
              address: values.address ?? '',
              notes: values.notes ?? '',
              customFields,
            });
            created++;
          }
          return { created, errors };
        }}
      />
      <EntityDrawer title={draft?.id ? 'Edit client' : 'Add client'} open={!!draft} onClose={() => setDraft(null)}>
        {draft && (
          <form
            className="data-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              upsert(draft);
              setDraft(null);
            }}
          >
            <label>
              Name
              <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label>
              Email
              <input value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </label>
            <label>
              Phone
              <input value={draft.phone ?? ''} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </label>
            <label>
              Company
              <input value={draft.company ?? ''} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
            </label>
            <label>
              Address
              <input value={draft.address ?? ''} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
            </label>
            <label>
              Notes
              <textarea value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </label>
            {draft.id && (
              <div className="client-linked-builds">
                <strong>Linked builds</strong>
                {buildsFor(draft.id).length === 0 ? (
                  <p className="muted">None yet — open Build, then choose this client in the project menu and Save.</p>
                ) : (
                  <ul>
                    {buildsFor(draft.id).map((d) => (
                      <li key={d.code}>
                        <a href={`/build?design=${d.code}`}>{d.name || d.code}</a>
                        {d.payload.estimateSnapshot && (
                          <span className="muted">
                            {' '}
                            · estimate v{d.payload.estimateSnapshot.version} · $
                            {d.payload.estimateSnapshot.totals.grandTotal.toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </span>
                        )}
                        {(d.payload.changeOrders?.length ?? 0) > 0 && (
                          <span className="muted"> · {d.payload.changeOrders!.length} CO</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <CustomFieldsInputs
              entity="client"
              fields={fields}
              values={draft.customFields ?? {}}
              onChange={(customFields) => setDraft({ ...draft, customFields })}
            />
            <div className="data-form-actions">
              <button type="submit" className="primary">
                Save
              </button>
              <button type="button" onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </EntityDrawer>
    </>
  );
}
