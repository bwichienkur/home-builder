import { FormEvent, useState } from 'react';
import type { Client } from '../../lib/crm/types';
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
  const clients = useCrmStore((s) => s.clients.filter((c) => !c.archived));
  const fields = useCrmStore((s) => s.customFields);
  const upsert = useCrmStore((s) => s.upsertClient);
  const archive = useCrmStore((s) => s.archiveEntity);
  const [draft, setDraft] = useState<Partial<Client> & { name: string } | null>(null);

  return (
    <>
      <EntityCrmPage
        entity="client"
        title="Clients"
        lede="Manage homeowners and project contacts. Export a template, import CSV, or add manually."
        fields={fields}
        rows={clients}
        templateExample={['Jane Doe', 'jane@example.com', '555-0100', 'Doe Homes', '12 Oak St', 'Lead from showroom']}
        columns={[
          { key: 'name', label: 'Name', render: (r) => r.name },
          { key: 'email', label: 'Email', render: (r) => r.email || '—' },
          { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
          { key: 'company', label: 'Company', render: (r) => r.company || '—' },
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
