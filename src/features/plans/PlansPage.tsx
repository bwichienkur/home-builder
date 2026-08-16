import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { HousePlan } from '../../lib/housePlans/buildPlan';
import { importDxfHousePlan, inspectIfc } from '../../lib/housePlans/dxfImport';
import { listBuiltinHousePlans } from '../../lib/housePlans/planRegistry';
import { useCrmStore } from '../../store/crmStore';
import { usePlannerStore } from '../../store/plannerStore';

export function PlansPage() {
  const navigate = useNavigate();
  const applyPlanObject = usePlannerStore((s) => s.applyHousePlanObject);
  const imported = useCrmStore((s) => s.housePlans);
  const upsertPlan = useCrmStore((s) => s.upsertHousePlan);
  const removePlan = useCrmStore((s) => s.removeHousePlan);
  const builtins = useMemo(() => listBuiltinHousePlans(), []);
  const [notice, setNotice] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState('Custom rectangle');
  const [manualW, setManualW] = useState(20);
  const [manualD, setManualD] = useState(16);

  const openInBuild = (plan: HousePlan) => {
    if (!applyPlanObject(plan)) {
      setNotice('Could not open that plan in Build.');
      return;
    }
    navigate('/build');
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 80);
  };

  const persistAndOpen = (plan: HousePlan, meta: { source: string; license: string; format: 'native-json' | 'dxf' | 'ifc' }) => {
    const now = new Date().toISOString();
    upsertPlan({
      id: plan.id,
      name: plan.name,
      source: meta.source,
      license: meta.license,
      format: meta.format,
      beds: plan.beds,
      baths: plan.baths,
      stories: plan.stories,
      livingSqFt: plan.livingSqFt,
      notes: plan.note,
      createdAt: now,
      updatedAt: now,
      planJson: plan,
    });
    openInBuild(plan);
  };

  const onImportFile = async (file: File) => {
    const text = await file.text();
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.dxf')) {
      const result = importDxfHousePlan(text, file.name.replace(/\.dxf$/i, ''));
      setNotice(
        `DXF import: ${result.lineCount} segments, ${result.plan.floors[0]?.rooms.length ?? 0} rooms.` +
          (result.warnings.length ? ` Warnings: ${result.warnings.join(' ')}` : ''),
      );
      persistAndOpen(result.plan, {
        source: file.name,
        license: 'User-imported DXF',
        format: 'dxf',
      });
      return;
    }
    if (lower.endsWith('.ifc')) {
      const info = inspectIfc(text);
      setNotice(
        info.ok
          ? `${info.message} Tip: export IFC4 from Build for Mahnikka-native geometry, or import DXF/JSON for editable rooms.`
          : info.message,
      );
      return;
    }
    if (lower.endsWith('.json')) {
      try {
        const json = JSON.parse(text) as HousePlan;
        if (!json?.id || !json?.floors?.length) throw new Error('Missing id/floors');
        setNotice(`Loaded native JSON plan “${json.name}”.`);
        persistAndOpen(json, {
          source: file.name,
          license: json.note || 'User-imported JSON',
          format: 'native-json',
        });
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Invalid plan JSON');
      }
      return;
    }
    setNotice('Supported imports: .dxf (CAD exchange), .json (native), .ifc (detected with guidance).');
  };

  const addManual = () => {
    const plan: HousePlan = {
      id: `manual-${crypto.randomUUID().slice(0, 8)}`,
      name: manualName || 'Custom rectangle',
      stories: 1,
      beds: 0,
      baths: 0,
      livingSqFt: Math.round(manualW * manualD),
      sourceUrl: '',
      note: 'Manually added rectangular plate.',
      floors: [
        {
          id: 'manual-1',
          name: 'First story',
          rooms: [
            {
              id: 'room-1',
              name: 'Room',
              roomType: 'Living room',
              x: 0,
              y: 0,
              w: manualW,
              h: manualD,
              ceilingFt: 9,
            },
          ],
        },
      ],
    };
    persistAndOpen(plan, { source: 'manual', license: 'User-created', format: 'native-json' });
    setManualOpen(false);
  };

  return (
    <div className="data-page">
      <header className="data-page-header">
        <div>
          <p className="eyebrow">House plans</p>
          <h1>Plan library</h1>
          <p className="muted">
            Accurate open samples plus DXF/JSON imports. Proprietary brochure approximations were removed.
          </p>
        </div>
        <div className="data-page-actions">
          <a className="file-btn" href="/samples/sample-rect-house.dxf" download>
            Sample DXF
          </a>
          <button type="button" onClick={() => setManualOpen(true)}>
            Add manually
          </button>
          <label className="file-btn primary">
            Import plan
            <input
              type="file"
              accept=".dxf,.json,.ifc,application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </header>
      {notice && (
        <div className="plan-import-notice" role="status">
          <p>{notice}</p>
        </div>
      )}

      <h2 style={{ fontSize: '1rem', margin: '0 0 10px' }}>Built-in samples</h2>
      <div className="data-table-wrap" style={{ marginBottom: 24 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Stats</th>
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {builtins.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                </td>
                <td>
                  {p.beds} bed · {p.baths} bath · {p.livingSqFt.toLocaleString()} sf · {p.stories} story
                </td>
                <td className="muted">{p.note.slice(0, 80)}…</td>
                <td>
                  <button type="button" className="auth-link" onClick={() => openInBuild(p)}>
                    Open in Build
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: '1rem', margin: '0 0 10px' }}>Imported / saved</h2>
      <div className="data-table-wrap">
        {imported.length === 0 ? (
          <div className="data-empty">No imported plans yet. Import a DXF or native JSON plan.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Format</th>
                <th>License</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {imported.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td>{p.format}</td>
                  <td className="muted">{p.license || p.source}</td>
                  <td>
                    <button
                      type="button"
                      className="auth-link"
                      onClick={() => openInBuild(p.planJson as HousePlan)}
                    >
                      Open in Build
                    </button>
                    {' · '}
                    <button type="button" className="auth-link" onClick={() => removePlan(p.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {manualOpen && (
        <div className="data-drawer" onMouseDown={(e) => e.target === e.currentTarget && setManualOpen(false)}>
          <div className="data-drawer-panel" role="dialog" aria-modal="true">
            <h2>Add rectangular plan</h2>
            <div className="data-form">
              <label>
                Name
                <input value={manualName} onChange={(e) => setManualName(e.target.value)} />
              </label>
              <label>
                Width (ft)
                <input type="number" value={manualW} onChange={(e) => setManualW(Number(e.target.value))} />
              </label>
              <label>
                Depth (ft)
                <input type="number" value={manualD} onChange={(e) => setManualD(Number(e.target.value))} />
              </label>
              <div className="data-form-actions">
                <button type="button" className="primary" onClick={addManual}>
                  Save & open
                </button>
                <button type="button" onClick={() => setManualOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
