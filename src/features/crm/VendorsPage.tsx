import { FormEvent, useMemo, useState } from 'react';
import type { Vendor } from '../../lib/crm/types';
import { useCrmStore } from '../../store/crmStore';
import { CustomFieldsInputs, EntityCrmPage, EntityDrawer } from './EntityCrmPage';

const empty = (): Partial<Vendor> & { name: string } => ({
  name: '',
  email: '',
  phone: '',
  website: '',
  contactName: '',
  notes: '',
  customFields: {},
});

export function VendorsPage() {
  const allVendors = useCrmStore((s) => s.vendors);
  const vendors = useMemo(() => (allVendors ?? []).filter((v) => !v.archived), [allVendors]);
  const fields = useCrmStore((s) => s.customFields);
  const upsert = useCrmStore((s) => s.upsertVendor);
  const archive = useCrmStore((s) => s.archiveEntity);
  const [draft, setDraft] = useState<Partial<Vendor> & { name: string } | null>(null);

  return (
    <>
      <EntityCrmPage
        entity="vendor"
        title="Vendors"
        lede="Supplier contacts and trade partners. CSV template, import, and manual entry."
        fields={fields}
        rows={vendors}
        templateExample={['Acme Fixtures', 'sales@acme.test', '555-0200', 'https://acme.test', 'Sam Lee', 'Preferred lighting']}
        columns={[
          { key: 'name', label: 'Name', render: (r) => r.name },
          { key: 'contactName', label: 'Contact', render: (r) => r.contactName || '—' },
          { key: 'email', label: 'Email', render: (r) => r.email || '—' },
          { key: 'website', label: 'Website', render: (r) => r.website || '—' },
        ]}
        onAdd={() => setDraft(empty())}
        onEdit={(row) => setDraft({ ...row })}
        onArchive={(id) => archive('vendor', id)}
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
              website: values.website ?? '',
              contactName: values.contactName ?? '',
              notes: values.notes ?? '',
              customFields,
            });
            created++;
          }
          return { created, errors };
        }}
      />
      <EntityDrawer title={draft?.id ? 'Edit vendor' : 'Add vendor'} open={!!draft} onClose={() => setDraft(null)}>
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
              Contact name
              <input
                value={draft.contactName ?? ''}
                onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
              />
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
              Website
              <input value={draft.website ?? ''} onChange={(e) => setDraft({ ...draft, website: e.target.value })} />
            </label>
            <label>
              Notes
              <textarea value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </label>
            <CustomFieldsInputs
              entity="vendor"
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
