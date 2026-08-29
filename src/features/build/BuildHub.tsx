import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cloud, FolderOpen, Plus, ClipboardList } from 'lucide-react';
import { listSelectionProjects, type ApiSelectionProject } from '../../api/client';
import { fetchCloudProjects } from '../../lib/cloudProjects';
import { hydrateDesignsFromRemote, listSharedDesigns } from '../../lib/designShare';
import { platformConfig } from '../../lib/platform/config';
import { WORKFLOW_LABEL } from '../../lib/configurator/projectTypes';
import { listHomeProjects, type HomeProject } from '../home/homeProjects';
import { useConfiguratorStore } from '../../store/configuratorStore';
import { usePlannerStore } from '../../store/plannerStore';
import { ProjectWizard } from './ProjectWizard';

function formatUpdated(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type Props = { onBegan?: () => void };

/**
 * Build landing: existing jobs + create new (wizard). Replaces the old plan gallery.
 */
export function BuildHub({ onBegan }: Props) {
  const project = useConfiguratorStore((s) => s.project);
  const loadProject = useConfiguratorStore((s) => s.loadProject);
  const loadStillwater183 = useConfiguratorStore((s) => s.loadStillwater183);
  const setRole = useConfiguratorStore((s) => s.setRole);
  const enterHouse = usePlannerStore((s) => s.enterHouse);
  const setStudioMode = usePlannerStore((s) => s.setStudioMode);
  const setUnit = usePlannerStore((s) => s.setUnitSystem);

  const [wizardOpen, setWizardOpen] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('new') === '1';
    } catch {
      return false;
    }
  });
  const [localDesigns, setLocalDesigns] = useState(() => listSharedDesigns());
  const [cloudProjects, setCloudProjects] = useState<Awaited<ReturnType<typeof fetchCloudProjects>>>([]);
  const [selectionProjects, setSelectionProjects] = useState<ApiSelectionProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tasks: Promise<void>[] = [
      hydrateDesignsFromRemote().then((items) => {
        if (!cancelled) setLocalDesigns(items);
      }),
    ];
    if (platformConfig.cloudConfigured()) {
      tasks.push(
        fetchCloudProjects().then((items) => {
          if (!cancelled) setCloudProjects(items);
        }),
      );
      tasks.push(
        listSelectionProjects()
          .then((items) => {
            if (!cancelled) setSelectionProjects(items);
          })
          .catch(() => {
            if (!cancelled) setSelectionProjects([]);
          }),
      );
    }
    void Promise.all(tasks).finally(() => {
      if (!cancelled) setLoading(false);
    });
    if (!platformConfig.cloudConfigured()) setLoading(false);
    return () => {
      cancelled = true;
    };
  }, []);

  const homeProjects = useMemo(
    () => listHomeProjects(localDesigns, cloudProjects),
    [localDesigns, cloudProjects],
  );

  const finish = () => {
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 80);
    onBegan?.();
  };

  const openCurrent = () => {
    if (!project) return;
    setStudioMode('furnish');
    setUnit('imperial');
    enterHouse();
    finish();
  };

  const openStillwaterDemo = () => {
    loadStillwater183();
    setRole('admin');
    setStudioMode('furnish');
    setUnit('imperial');
    enterHouse();
    finish();
  };

  const openSelectionProject = (api: ApiSelectionProject) => {
    const extended = (api.extended ?? {}) as Record<string, unknown>;
    loadProject(
      {
        id: api.id,
        name: api.name,
        planRef: api.planRef,
        lotRef: api.lotRef,
        contract: api.contract,
        createdAt: api.createdAt,
        workflowStatus: (extended.workflowStatus as never) ?? 'draft',
        planVerification: (extended.planVerification as never) ?? 'unverified',
        housePlanId: extended.housePlanId as string | undefined,
        importedHousePlan: extended.importedHousePlan as never,
        drawingPackageId: extended.drawingPackageId as string | undefined,
        drawingPackage: extended.drawingPackage as never,
        team: (extended.team as never) ?? [],
        allowances: (extended.allowances as never) ?? [],
        levelOverrides: (extended.levelOverrides as never) ?? [],
        takeoff: extended.takeoff as never,
        selections: extended.selections as never,
        survey: extended.survey as never,
        curatedOptions: extended.curatedOptions as never,
        signOff: (extended.signOff as never) ?? { cof: 'pending', buildertrend: 'pending' },
        sceneProjectId: api.sceneProjectId,
      },
      api.id,
    );
    setStudioMode('furnish');
    setUnit('imperial');
    enterHouse();
    finish();
  };

  if (wizardOpen) {
    return (
      <section className="design-start build-hub" aria-label="New project wizard">
        <div className="design-start-panel build-hub-panel is-wide">
          <ProjectWizard
            onCancel={() => setWizardOpen(false)}
            onComplete={() => {
              setWizardOpen(false);
              finish();
            }}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="design-start build-hub" aria-label="Projects">
      <div className="design-start-panel build-hub-panel is-wide">
        <p className="design-start-eyebrow">Olsen Custom Homes · Project</p>
        <h1>Projects</h1>
        <p className="design-start-lede">
          Open an existing job or start a guided project — drawings, estimator sign-off, designer invite, client
          survey, then Platinum configurator.
        </p>

        <div className="build-hub-actions">
          <button type="button" className="design-start-choice design-start-choice-featured" onClick={() => setWizardOpen(true)}>
            <Plus size={28} strokeWidth={1.6} />
            <div>
              <strong>Create new project</strong>
              <span>Name, team, MODEL.dwg + plan-set PDF, estimator → designer → client</span>
            </div>
          </button>
          {project && (
            <button type="button" className="design-start-choice" onClick={openCurrent}>
              <FolderOpen size={28} strokeWidth={1.6} />
              <div>
                <strong>Continue · {project.name}</strong>
                <span>
                  {WORKFLOW_LABEL[project.workflowStatus]}
                  {project.lotRef ? ` · ${project.lotRef}` : ''}
                </span>
              </div>
            </button>
          )}
          <button type="button" className="design-start-choice" onClick={openStillwaterDemo}>
            <ClipboardList size={28} strokeWidth={1.6} />
            <div>
              <strong>183 Stillwater template</strong>
              <span>Seed floorplan + PDF plan set (for estimator / demo)</span>
            </div>
          </button>
        </div>

        <p className="design-start-eyebrow" style={{ marginTop: 8 }}>
          Existing projects
        </p>

        {loading ? (
          <p className="muted">Loading projects…</p>
        ) : selectionProjects.length === 0 && homeProjects.length === 0 && !project ? (
          <div className="build-hub-empty">
            <p>No projects yet. Create a new project to begin.</p>
          </div>
        ) : (
          <ul className="build-hub-list">
            {selectionProjects.map((sp) => {
              const status = (sp.extended as { workflowStatus?: string } | undefined)?.workflowStatus;
              return (
                <li key={`sel-${sp.id}`}>
                  <button type="button" className="build-hub-row" onClick={() => openSelectionProject(sp)}>
                    <span className="home-project-icon" aria-hidden>
                      <ClipboardList size={18} strokeWidth={1.75} />
                    </span>
                    <span className="home-project-copy">
                      <strong>{sp.name || 'Untitled project'}</strong>
                      <span>
                        Selections
                        {status ? ` · ${status}` : ''}
                        {sp.lotRef ? ` · ${sp.lotRef}` : ''}
                        {sp.updatedAt ? ` · ${formatUpdated(sp.updatedAt)}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {homeProjects.map((hp: HomeProject) => (
              <li key={hp.id}>
                <Link className="build-hub-row" to={hp.href}>
                  <span className="home-project-icon" aria-hidden>
                    {hp.origin === 'cloud' ? (
                      <Cloud size={18} strokeWidth={1.75} />
                    ) : (
                      <FolderOpen size={18} strokeWidth={1.75} />
                    )}
                  </span>
                  <span className="home-project-copy">
                    <strong>{hp.name}</strong>
                    <span>
                      {hp.detail}
                      {hp.updatedAt ? ` · ${formatUpdated(hp.updatedAt)}` : ''}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
