import { useMemo, useState } from 'react';
import { useConfiguratorStore } from '../../store/configuratorStore';
import { ProjectSetupPanel } from './ProjectSetupPanel';
import { PlanVerificationPanel } from './PlanVerificationPanel';
import { ClientSurveyPanel } from './ClientSurveyPanel';
import { SignOffPanel } from './SignOffPanel';
import { RoomSelectionNav } from './RoomSelectionNav';

type DockTab = 'setup' | 'verify' | 'survey' | 'signoff';

export function ConfiguratorDock() {
  const role = useConfiguratorStore((s) => s.role);
  const project = useConfiguratorStore((s) => s.project);
  const shareToken = useConfiguratorStore((s) => s.shareToken);
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<DockTab>(role === 'client' ? 'survey' : role === 'admin' ? 'setup' : 'verify');

  const tabs = useMemo(() => {
    const clientLocked = role === 'client' || !!shareToken;
    const list: { id: DockTab; label: string; show: boolean }[] = [
      { id: 'setup', label: 'Admin', show: role === 'admin' && !shareToken },
      { id: 'verify', label: 'Plan', show: (role === 'designer' || role === 'admin') && !shareToken },
      { id: 'survey', label: 'Survey', show: clientLocked || !!project?.survey },
      { id: 'signoff', label: 'Sign-off', show: true },
    ];
    return list.filter((t) => t.show);
  }, [role, project?.survey, shareToken]);

  if (!project) return null;

  const active = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id;

  return (
    <>
      <div className="configurator-room-rail">
        <RoomSelectionNav />
      </div>

      <aside className={`configurator-dock ${open ? 'is-open' : 'is-collapsed'}`} aria-label="Configurator workflow">
        <div className="configurator-dock-chrome">
          <button type="button" className="configurator-dock-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Hide workflow' : 'Show workflow'}
          </button>
          {open && (
            <div className="configurator-dock-tabs" role="tablist" aria-label="Workflow sections">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active === t.id}
                  className={active === t.id ? 'active' : ''}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {open && (
          <>
            <div className="configurator-dock-rooms">
              <RoomSelectionNav />
            </div>
            <div className="configurator-dock-body" role="tabpanel">
              {active === 'setup' && <ProjectSetupPanel />}
              {active === 'verify' && <PlanVerificationPanel />}
              {active === 'survey' && <ClientSurveyPanel forceShow />}
              {active === 'signoff' && <SignOffPanel />}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
