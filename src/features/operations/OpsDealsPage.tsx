import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EntityDrawer } from '../crm/EntityCrmPage';
import { newOpsId, type OpsDeal, type OpsDealStage } from '../../lib/operations';
import { OpsDataGrid, OpsRowActions } from './OpsDataGrid';
import { useOpsStore } from './useOpsStore';

const STAGES: OpsDealStage[] = ['lead', 'proposal', 'pre-contract', 'contract', 'closed', 'lost'];

const emptyDeal = (): OpsDeal => ({
  id: newOpsId('deal'),
  title: '',
  stage: 'lead',
  value: 0,
  confidence: 10,
  owner: '',
  expectedCloseDate: '',
  updatedAt: new Date().toISOString(),
});

export function OpsDealsPage() {
  const ops = useOpsStore();
  const [draft, setDraft] = useState<OpsDeal | null>(null);
  const [stageFilter, setStageFilter] = useState('');

  const rows = useMemo(() => {
    if (!stageFilter) return ops.deals;
    return ops.deals.filter((d) => d.stage === stageFilter);
  }, [ops.deals, stageFilter]);

  return (
    <>
      <div className="data-page">
        <header className="data-page-header">
          <div>
            <p className="eyebrow">operations</p>
            <h1>Deals</h1>
            <p className="muted">Sales pipeline opportunities (weighted by confidence on the native dashboard).</p>
          </div>
          <div className="data-page-actions">
            <Link to="/ops" className="ops-btn">
              Hub
            </Link>
            <button type="button" className="ops-btn primary" onClick={() => setDraft(emptyDeal())}>
              Add deal
            </button>
          </div>
        </header>

        <OpsDataGrid
          rows={rows}
          getRowId={(d) => d.id}
          searchPlaceholder="Search deals…"
          empty="No deals match."
          initialSort={{ key: 'value', dir: 'desc' }}
          filters={[
            {
              id: 'stage',
              label: 'Stage',
              value: stageFilter,
              onChange: setStageFilter,
              options: [{ value: '', label: 'All' }, ...STAGES.map((s) => ({ value: s, label: s }))],
            },
          ]}
          columns={[
            { key: 'title', label: 'Title', getValue: (d) => d.title, render: (d) => d.title },
            { key: 'stage', label: 'Stage', getValue: (d) => d.stage, render: (d) => d.stage },
            {
              key: 'value',
              label: 'Value',
              align: 'right',
              getValue: (d) => d.value,
              render: (d) => `$${Math.round(d.value).toLocaleString()}`,
            },
            {
              key: 'confidence',
              label: 'Confidence',
              align: 'right',
              getValue: (d) => d.confidence,
              render: (d) => `${d.confidence}%`,
            },
            { key: 'owner', label: 'Owner', getValue: (d) => d.owner, render: (d) => d.owner || '—' },
            {
              key: 'expectedCloseDate',
              label: 'Expected close',
              getValue: (d) => d.expectedCloseDate || '',
              render: (d) => d.expectedCloseDate || '—',
            },
          ]}
          actions={(deal) => (
            <OpsRowActions onEdit={() => setDraft({ ...deal })} onArchive={() => ops.archiveDeal(deal.id)} />
          )}
        />
      </div>

      <EntityDrawer title="Deal" open={!!draft} onClose={() => setDraft(null)} fullscreen={false}>
        {draft ? (
          <form
            className="data-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!draft.title.trim()) return;
              ops.saveDeal(draft);
              setDraft(null);
            }}
          >
            <label>
              Title
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required />
            </label>
            <label>
              Stage
              <select
                value={draft.stage}
                onChange={(e) => setDraft({ ...draft, stage: e.target.value as OpsDealStage })}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Value (USD)
              <input
                type="number"
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) || 0 })}
              />
            </label>
            <label>
              Confidence %
              <input
                type="number"
                min={0}
                max={100}
                value={draft.confidence}
                onChange={(e) => setDraft({ ...draft, confidence: Number(e.target.value) || 0 })}
              />
            </label>
            <label>
              Owner
              <input value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} />
            </label>
            <label>
              Expected close
              <input
                type="date"
                value={(draft.expectedCloseDate || '').slice(0, 10)}
                onChange={(e) => setDraft({ ...draft, expectedCloseDate: e.target.value })}
              />
            </label>
            <div className="data-form-actions">
              <button type="button" className="ops-btn" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="ops-btn primary">
                Save
              </button>
            </div>
          </form>
        ) : null}
      </EntityDrawer>
    </>
  );
}
