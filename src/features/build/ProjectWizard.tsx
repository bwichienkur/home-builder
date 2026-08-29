import { useMemo, useRef, useState } from 'react';
import { listFloorplanTemplates } from '../../lib/housePlans/planRegistry';
import type { DrawingImportProgress } from '../../lib/housePlans/importDrawingFile';
import type { TeamMember } from '../../lib/configurator/projectTypes';
import { WORKFLOW_LABEL } from '../../lib/configurator/projectTypes';
import {
  createBlankSelectionProject,
  useConfiguratorStore,
} from '../../store/configuratorStore';
import { usePlannerStore } from '../../store/plannerStore';
import { ContractConfigPanel } from '../../components/configurator/ContractConfigPanel';

const STEPS = [
  { id: 'details', label: 'Project' },
  { id: 'files', label: 'Drawings' },
  { id: 'estimator', label: 'Estimator' },
  { id: 'designer', label: 'Designer' },
  { id: 'ready', label: 'Ready' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

type Props = {
  onComplete: () => void;
  onCancel: () => void;
};

function progressLabel(p: DrawingImportProgress | null): string {
  if (!p) return '';
  if (p.stage === 'reading') return `Reading ${p.detail ?? 'file'}…`;
  if (p.stage === 'converting') return 'Converting DWG → DXF…';
  if (p.stage === 'parsing') return 'Building rooms + attaching PDF…';
  return 'Done';
}

/**
 * Guided job creation: details → DWG+PDF → estimator sign-off → designer invite.
 */
export function ProjectWizard({ onComplete, onCancel }: Props) {
  const project = useConfiguratorStore((s) => s.project);
  const loadProject = useConfiguratorStore((s) => s.loadProject);
  const setTeam = useConfiguratorStore((s) => s.setTeam);
  const setHousePlanId = useConfiguratorStore((s) => s.setHousePlanId);
  const setPlanVerification = useConfiguratorStore((s) => s.setPlanVerification);
  const setWorkflowStatus = useConfiguratorStore((s) => s.setWorkflowStatus);
  const importProjectDrawing = useConfiguratorStore((s) => s.importProjectDrawing);
  const createClientInvite = useConfiguratorStore((s) => s.createClientInvite);
  const lastInviteUrl = useConfiguratorStore((s) => s.lastInviteUrl);
  const setRole = useConfiguratorStore((s) => s.setRole);
  const enterHouse = usePlannerStore((s) => s.enterHouse);
  const setStudioMode = usePlannerStore((s) => s.setStudioMode);
  const setUnit = usePlannerStore((s) => s.setUnitSystem);

  const [step, setStep] = useState<StepId>('details');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [estimator, setEstimator] = useState('');
  const [designer, setDesigner] = useState('');
  const [pm, setPm] = useState('');
  const [drawingFile, setDrawingFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importProgress, setImportProgress] = useState<DrawingImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientEmail, setClientEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [allowancesConfirmed, setAllowancesConfirmed] = useState(false);
  const drawingRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const templates = useMemo(() => listFloorplanTemplates(), []);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const buildTeam = (): TeamMember[] => {
    const team: TeamMember[] = [];
    if (estimator.trim()) team.push({ role: 'estimator', name: estimator.trim() });
    if (designer.trim()) team.push({ role: 'designer', name: designer.trim() });
    if (pm.trim()) team.push({ role: 'project_manager', name: pm.trim() });
    return team;
  };

  const commitDetails = () => {
    setError(null);
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }
    if (!estimator.trim() || !designer.trim() || !pm.trim()) {
      setError('Assign an estimator, designer, and project manager.');
      return;
    }
    const blank = createBlankSelectionProject(name.trim(), name.trim(), location.trim() || undefined);
    loadProject({
      ...blank,
      lotRef: location.trim() || undefined,
      team: buildTeam(),
      workflowStatus: 'draft',
    });
    setStep('files');
  };

  const runImport = async () => {
    setError(null);
    if (!drawingFile) {
      setError('MODEL.dwg (or .dxf) is required.');
      return;
    }
    if (!pdfFile) {
      setError('Plan-set PDF is required — sheets display from the PDF for readable text and elevations.');
      return;
    }
    setImportBusy(true);
    setImportProgress({ stage: 'reading' });
    try {
      if (!useConfiguratorStore.getState().project) {
        commitDetails();
      }
      await importProjectDrawing(
        { drawing: drawingFile, pdf: pdfFile },
        {
          planName: name.trim() || undefined,
          createIfEmpty: true,
          onProgress: setImportProgress,
        },
      );
      const team = buildTeam();
      if (team.length) setTeam(team);
      if (location.trim()) {
        const p = useConfiguratorStore.getState().project;
        if (p) {
          useConfiguratorStore.getState().loadProject({ ...p, lotRef: location.trim() });
        }
      }
      setStep('estimator');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Drawing import failed');
    } finally {
      setImportBusy(false);
    }
  };

  const estimatorSignOff = () => {
    setError(null);
    if (!allowancesConfirmed) {
      setError('Confirm contract allowances before signing off.');
      return;
    }
    const p = useConfiguratorStore.getState().project;
    if (!p?.drawingPackage?.pdfUrl && !pdfFile) {
      setError('Plan-set PDF must be attached before estimator sign-off.');
      return;
    }
    setPlanVerification('approved_for_selections');
    setWorkflowStatus('ready_for_client_survey');
    setRole('designer');
    setStep('designer');
  };

  const sendInvite = async () => {
    setInviteBusy(true);
    setError(null);
    try {
      await createClientInvite(clientEmail.trim() || undefined);
      setStep('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setInviteBusy(false);
    }
  };

  const openStudio = () => {
    setStudioMode('furnish');
    setUnit('imperial');
    enterHouse();
    window.setTimeout(() => {
      window.dispatchEvent(new Event('roomcraft-fit-plan'));
      window.dispatchEvent(new Event('roomcraft-refocus'));
    }, 80);
    onComplete();
  };

  const assignFiles = (list: FileList | File[]) => {
    const files = [...list];
    const drawing = files.find((f) => /\.(dwg|dxf)$/i.test(f.name)) ?? null;
    const pdf = files.find((f) => /\.pdf$/i.test(f.name)) ?? null;
    if (drawing) setDrawingFile(drawing);
    if (pdf) setPdfFile(pdf);
  };

  return (
    <div className="build-wizard" role="dialog" aria-modal="true" aria-label="New project wizard">
      <header className="build-wizard-header">
        <div>
          <p className="design-start-eyebrow">New project wizard</p>
          <h2>Create a job</h2>
        </div>
        <button type="button" className="configurator-btn" onClick={onCancel}>
          Cancel
        </button>
      </header>

      <ol className="build-wizard-steps" aria-label="Wizard steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className={i === stepIndex ? 'active' : i < stepIndex ? 'done' : ''}>
            <span className="build-wizard-step-num">{i + 1}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      <div className="build-wizard-body">
        {error && <p className="configurator-status-chip is-warn">{error}</p>}

        {step === 'details' && (
          <div className="configurator-field-grid">
            <label className="configurator-field full">
              <span>Project name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 183 Stillwater" autoFocus />
            </label>
            <label className="configurator-field full">
              <span>Location / lot</span>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Address or lot reference" />
            </label>
            <label className="configurator-field">
              <span>Estimator</span>
              <input value={estimator} onChange={(e) => setEstimator(e.target.value)} placeholder="Name" />
            </label>
            <label className="configurator-field">
              <span>Designer</span>
              <input value={designer} onChange={(e) => setDesigner(e.target.value)} placeholder="Name" />
            </label>
            <label className="configurator-field">
              <span>Project manager</span>
              <input value={pm} onChange={(e) => setPm(e.target.value)} placeholder="Name" />
            </label>
          </div>
        )}

        {step === 'files' && (
          <div className="configurator-field-grid">
            <p className="muted full">
              Both files are required. The DWG builds the room model; the PDF plan set is what clients and staff read
              (readable elevations, notes, and truss sheets).
            </p>
            <div className="configurator-field drawing-drop-field full">
              <span>MODEL.dwg / DXF</span>
              <div
                className="drawing-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.length) assignFiles(e.dataTransfer.files);
                }}
                onClick={() => drawingRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') drawingRef.current?.click();
                }}
              >
                <strong>{drawingFile ? drawingFile.name : 'Drop MODEL.dwg here'}</strong>
                <span className="muted">Required · builds configurable rooms</span>
                <input
                  ref={drawingRef}
                  type="file"
                  accept=".dwg,.dxf,application/acad,image/vnd.dwg"
                  hidden
                  onChange={(e) => {
                    if (e.target.files?.length) assignFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
            <div className="configurator-field drawing-drop-field full">
              <span>Plan-set PDF</span>
              <div
                className="drawing-dropzone"
                onClick={() => pdfRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') pdfRef.current?.click();
                }}
              >
                <strong>{pdfFile ? pdfFile.name : 'Drop floor / elev / electrical PDF here'}</strong>
                <span className="muted">Required · fullscreen sheet reference</span>
                <input
                  ref={pdfRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setPdfFile(file);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
            {importBusy && <p className="muted">{progressLabel(importProgress)}</p>}
          </div>
        )}

        {step === 'estimator' && (
          <div className="configurator-field-grid">
            <p className="muted full">
              Select the floorplan template, configure COF included tiers and allowances, then sign off for the designer.
            </p>
            <label className="configurator-field full">
              <span>Floorplan template</span>
              <select
                value={project?.housePlanId ?? 'stillwater-183'}
                onChange={(e) => setHousePlanId(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                <option value="custom">Custom / imported DWG</option>
              </select>
              <small className="muted">More templates will be uploaded later.</small>
            </label>
            <div className="configurator-section full">
              {project ? (
                <ContractConfigPanel embedded />
              ) : (
                <p className="muted">Import drawings first so a contract exists to edit.</p>
              )}
              <label className="configurator-check">
                <input
                  type="checkbox"
                  checked={allowancesConfirmed}
                  onChange={(e) => setAllowancesConfirmed(e.target.checked)}
                />
                <span>I verified COF tiers and allowances are correctly assigned for this contract.</span>
              </label>
            </div>
          </div>
        )}

        {step === 'designer' && (
          <div className="configurator-field-grid">
            <p className="muted full">
              Review the project, then invite the client to their portal for the design survey. After the survey they
              unlock the Platinum configurator (no pricing, no structural edits).
            </p>
            <div className="configurator-kpi-row full">
              <div className="configurator-kpi">
                <span className="configurator-eyebrow">Project</span>
                <strong>{project?.name ?? '—'}</strong>
              </div>
              <div className="configurator-kpi">
                <span className="configurator-eyebrow">Status</span>
                <strong>{project ? WORKFLOW_LABEL[project.workflowStatus] : '—'}</strong>
              </div>
              <div className="configurator-kpi">
                <span className="configurator-eyebrow">Sheets</span>
                <strong>{project?.drawingPackage?.sheets.length ?? 0}</strong>
              </div>
            </div>
            <label className="configurator-field full">
              <span>Client email (optional)</span>
              <input
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="client@example.com"
              />
            </label>
            {lastInviteUrl && (
              <p className="configurator-invite-link full">
                Invite link: <a href={lastInviteUrl}>{lastInviteUrl}</a>
              </p>
            )}
          </div>
        )}

        {step === 'ready' && (
          <div className="build-wizard-ready">
            <p>
              Project is ready for the client survey and Platinum configurator. Clients can save progress, finish
              selections, then schedule in-person design meetings. Staff can export finishes to Excel / BT CSV from
              Sign-off.
            </p>
            {lastInviteUrl && (
              <p className="configurator-invite-link">
                Client portal: <a href={lastInviteUrl}>{lastInviteUrl}</a>
              </p>
            )}
          </div>
        )}
      </div>

      <footer className="build-wizard-footer">
        {step === 'details' && (
          <button type="button" className="configurator-btn primary" onClick={commitDetails}>
            Continue to drawings
          </button>
        )}
        {step === 'files' && (
          <>
            <button type="button" className="configurator-btn" onClick={() => setStep('details')}>
              Back
            </button>
            <button
              type="button"
              className="configurator-btn primary"
              disabled={importBusy || !drawingFile || !pdfFile}
              onClick={() => void runImport()}
            >
              {importBusy ? progressLabel(importProgress) || 'Importing…' : 'Import & continue'}
            </button>
          </>
        )}
        {step === 'estimator' && (
          <>
            <button type="button" className="configurator-btn" onClick={() => setStep('files')}>
              Back
            </button>
            <button type="button" className="configurator-btn primary" onClick={estimatorSignOff}>
              Estimator sign-off → designer
            </button>
          </>
        )}
        {step === 'designer' && (
          <>
            <button type="button" className="configurator-btn" onClick={() => setStep('estimator')}>
              Back
            </button>
            <button
              type="button"
              className="configurator-btn"
              onClick={() => {
                setStep('ready');
              }}
            >
              Skip invite
            </button>
            <button
              type="button"
              className="configurator-btn primary"
              disabled={inviteBusy}
              onClick={() => void sendInvite()}
            >
              {inviteBusy ? 'Creating invite…' : 'Send client invite'}
            </button>
          </>
        )}
        {step === 'ready' && (
          <button type="button" className="configurator-btn primary" onClick={openStudio}>
            Open configurator
          </button>
        )}
      </footer>
    </div>
  );
}
