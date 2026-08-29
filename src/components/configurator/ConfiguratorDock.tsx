import { useEffect, useMemo, useState } from 'react';
import { useConfiguratorStore } from '../../store/configuratorStore';
import { ProjectSetupPanel } from './ProjectSetupPanel';
import { PlanVerificationPanel } from './PlanVerificationPanel';
import { ClientSurveyPanel } from './ClientSurveyPanel';
import { SignOffPanel } from './SignOffPanel';
import { PlatinumLookbookPanel } from './PlatinumLookbookPanel';
import { ContractConfigPanel } from './ContractConfigPanel';
import { RoomSelectionNav } from './RoomSelectionNav';

type DockTab = 'setup' | 'contract' | 'verify' | 'survey' | 'lookbook' | 'signoff';

function useIsNarrow(maxWidth = 900) {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${maxWidth}px)`).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [maxWidth]);
  return narrow;
}

export function ConfiguratorDock() {
  const role = useConfiguratorStore((s) => s.role);
  const project = useConfiguratorStore((s) => s.project);
  const shareToken = useConfiguratorStore((s) => s.shareToken);
  const isNarrow = useIsNarrow();
  // Mobile starts collapsed so the plan/canvas stays visible.
  const [open, setOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 900 : true,
  );
  const [tab, setTab] = useState<DockTab>(role === 'client' ? 'survey' : role === 'admin' ? 'setup' : 'verify');

  useEffect(() => {
    if (!isNarrow) setOpen(true);
  }, [isNarrow]);

  const tabs = useMemo(() => {
    const clientLocked = role === 'client' || !!shareToken;
    const list: { id: DockTab; label: string; show: boolean }[] = [
      { id: 'setup', label: 'Admin', show: role === 'admin' && !shareToken },
      { id: 'contract', label: 'COF', show: (role === 'admin' || role === 'designer') && !shareToken },
      { id: 'verify', label: 'Plan', show: (role === 'designer' || role === 'admin') && !shareToken },
      { id: 'survey', label: 'Survey', show: clientLocked || !!project?.survey },
      {
        id: 'lookbook',
        label: 'Platinum',
        show: clientLocked || !!project?.survey || !!project?.curatedOptions?.length,
      },
      { id: 'signoff', label: 'Sign-off', show: true },
    ];
    return list.filter((t) => t.show);
  }, [role, project?.survey, project?.curatedOptions?.length, shareToken]);

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
            {open ? 'Hide workflow' : 'Workflow'}
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
              {active === 'contract' && <ContractConfigPanel />}
              {active === 'verify' && <PlanVerificationPanel />}
              {active === 'survey' && <ClientSurveyPanel forceShow />}
              {active === 'lookbook' && <PlatinumLookbookPanel />}
              {active === 'signoff' && <SignOffPanel />}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
