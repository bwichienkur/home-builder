import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EntityDrawer } from '../crm/EntityCrmPage';
import { newOpsId, type OpsDeal, type OpsDealStage } from '../../lib/operations';
import { useOpsStore } from './useOpsStore';

const STAGES: OpsDealStage[] = ['lead', 'proposal', 'pre-contract', 'contract', 'closed', 'lost'];

const emptyDeal = (): OpsDeal => ({
  id: newOpsId('deal'),
  title: '',
  stage: 'lead',
  value: 0,
  confidence: 10,
  owner: '',
  updatedAt: new Date().toISOString(),
});

export function OpsDealsPage() {
  const ops = useOpsStore();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<OpsDeal | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ops.deals;
    return ops.deals.filter((d) => JSON.stringify(d).toLowerCase().includes(q));
  }, [ops.deals, query]);

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
            <Link to="/ops" className="auth-link">
              Hub
            </Link>
            <button type="button" className="primary" onClick={() => setDraft(emptyDeal())}>
              Add deal
            </button>
          </div>
        </header>
        <div style={{ marginBottom: 12 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search deals…"
            style={{
              width: 'min(360px, 100%)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: '10px 12px',
            }}
          />
        </div>
        <div className="data-table-wrap">
          {rows.length === 0 ? (
            <div className="data-empty">No deals yet.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Stage</th>
                  <th>Value</th>
                  <th>Confidence</th>
                  <th>Owner</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((deal) => (
                  <tr key={deal.id}>
                    <td>{deal.title}</td>
                    <td>{deal.stage}</td>
                    <td>${Math.round(deal.value).toLocaleString()}</td>
                    <td>{deal.confidence}%</td>
                    <td>{deal.owner || '—'}</td>
                    <td>
                      <button type="button" className="auth-link" onClick={() => setDraft({ ...deal })}>
                        Edit
                      </button>
                      {' · '}
                      <button type="button" className="auth-link" onClick={() => ops.archiveDeal(deal.id)}>
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
            <div className="data-form-actions">
              <button type="button" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Save
              </button>
            </div>
          </form>
        ) : null}
      </EntityDrawer>
    </>
  );
}
