import { useRef, useState } from 'react';
import { useConfiguratorStore, createBlankSelectionProject } from '../../store/configuratorStore';
import { WORKFLOW_LABEL } from '../../store/configuratorStore';
import type { ProjectWorkflowStatus, TeamMember, TeamRole } from '../../lib/configurator/projectTypes';
import type { DrawingImportProgress } from '../../lib/housePlans/importDrawingFile';
import { formatInviteEmail, loadOrgConfig } from '../../lib/configurator/orgConfig';

const TEAM_ROLES: TeamRole[] = ['estimator', 'designer', 'project_manager', 'client'];

function progressLabel(p: DrawingImportProgress | null): string {
  if (!p) return '';
  if (p.stage === 'reading') return `Reading ${p.detail ?? 'file'}…`;
  if (p.stage === 'converting') return 'Converting DWG → DXF…';
  if (p.stage === 'parsing') return 'Building rooms + sheet previews…';
  return 'Done';
}

export function ProjectSetupPanel() {
  const project = useConfiguratorStore((s) => s.project);
  const role = useConfiguratorStore((s) => s.role);
  const loadProject = useConfiguratorStore((s) => s.loadProject);
  const setTeam = useConfiguratorStore((s) => s.setTeam);
  const setWorkflowStatus = useConfiguratorStore((s) => s.setWorkflowStatus);
  const importContractPricingFile = useConfiguratorStore((s) => s.importContractPricingFile);
  const importProjectDrawing = useConfiguratorStore((s) => s.importProjectDrawing);
  const createClientInvite = useConfiguratorStore((s) => s.createClientInvite);
  const lastInviteUrl = useConfiguratorStore((s) => s.lastInviteUrl);

  const [projectName, setProjectName] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<TeamRole>('designer');
  const [clientEmail, setClientEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [drawingFile, setDrawingFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importProgress, setImportProgress] = useState<DrawingImportProgress | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const drawingInputRef = useRef<HTMLInputElement>(null);

  if (role !== 'admin') return null;

  const addTeamMember = () => {
    if (!memberName.trim()) return;
    const next: TeamMember[] = [
      ...(project?.team ?? []),
      { role: memberRole, name: memberName.trim(), email: memberEmail.trim() || undefined },
    ];
    setTeam(next);
    setMemberName('');
    setMemberEmail('');
  };

  const assignDrawingFiles = (list: FileList | File[]) => {
    const files = [...list];
    const drawing = files.find((f) => /\.(dwg|dxf)$/i.test(f.name)) ?? null;
    const pdf = files.find((f) => /\.pdf$/i.test(f.name)) ?? null;
    if (drawing) setDrawingFile(drawing);
    if (pdf) setPdfFile(pdf);
  };

  const runImport = async (createIfEmpty: boolean) => {
    if (!drawingFile) {
      setImportError('Choose a .dwg or .dxf file first.');
      return;
    }
    if (!pdfFile) {
      setImportError('Plan-set PDF is required for readable sheet reference.');
      return;
    }
    setImportError(null);
    setImportBusy(true);
    setImportProgress({ stage: 'reading' });
    try {
      await importProjectDrawing(
        { drawing: drawingFile, pdf: pdfFile },
        {
          planName: projectName.trim() || undefined,
          createIfEmpty,
          onProgress: setImportProgress,
        },
      );
      setProjectName('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Drawing import failed');
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <section className="configurator-panel project-setup-panel" aria-label="Project setup">
      <header className="configurator-panel-header">
        <div>
          <p className="configurator-eyebrow">Admin</p>
          <strong>Project setup</strong>
        </div>
      </header>

      <div className="configurator-field-grid">
        <label className="configurator-field">
          <span>New project name</span>
          <div className="configurator-inline-row">
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. 48 Hammock Beach Cir"
            />
            <button
              type="button"
              className="configurator-btn primary"
              onClick={() => {
                if (!projectName.trim()) return;
                loadProject(createBlankSelectionProject(projectName.trim()));
                setProjectName('');
              }}
            >
              Create
            </button>
          </div>
        </label>

        <div className="configurator-field drawing-drop-field">
          <span>CAD drawing (DWG / DXF)</span>
          <div
            className={`drawing-dropzone ${dragOver ? 'is-dragover' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) assignDrawingFiles(e.dataTransfer.files);
            }}
            onClick={() => drawingInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') drawingInputRef.current?.click();
            }}
          >
            <strong>{drawingFile ? drawingFile.name : 'Drop MODEL.dwg here'}</strong>
            <span className="muted">
              Builds a configurable room model. Attach the plan-set PDF for readable sheets (required for client
              reference).
            </span>
            <input
              ref={drawingInputRef}
              type="file"
              accept=".dwg,.dxf,application/acad,image/vnd.dwg"
              hidden
              onChange={(e) => {
                if (e.target.files?.length) assignDrawingFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          <div className="configurator-inline-row drawing-drop-actions">
            <label className="configurator-btn">
              PDF plan set
              <input
                type="file"
                accept=".pdf,application/pdf"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setPdfFile(file);
                  e.target.value = '';
                }}
              />
            </label>
            {pdfFile && <span className="muted">{pdfFile.name}</span>}
            <button
              type="button"
              className="configurator-btn primary"
              disabled={!drawingFile || !pdfFile || importBusy}
              onClick={() => void runImport(!project)}
            >
              {importBusy ? progressLabel(importProgress) || 'Importing…' : project ? 'Import into project' : 'Create from drawing'}
            </button>
          </div>
          {importError && <p className="configurator-status-chip is-warn">{importError}</p>}
          {project?.drawingPackage && (
            <p className="muted">
              Drawing pack · {project.drawingPackage.sheets.length} sheets
              {project.importedHousePlan
                ? ` · ${project.importedHousePlan.floors[0]?.rooms.length ?? 0} rooms detected`
                : ''}
            </p>
          )}
        </div>

        <label className="configurator-field">
          <span>Workflow stage</span>
          <select
            value={project?.workflowStatus ?? 'draft'}
            onChange={(e) => setWorkflowStatus(e.target.value as ProjectWorkflowStatus)}
            disabled={!project}
          >
            {Object.entries(WORKFLOW_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="configurator-field">
          <span>Contract pricing page (bulk import)</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            disabled={!project}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && /\.xls/i.test(file.name)) void importContractPricingFile(file);
              e.target.value = '';
            }}
          />
          <small className="muted">Or edit tiers and allowances on the COF tab.</small>
        </label>
      </div>

      {project && (
        <div className="configurator-section">
          <div className="configurator-section-title">
            <strong>Team</strong>
            {project.levelOverrides.length > 0 && (
              <span className="configurator-status-chip is-info">{project.levelOverrides.length} pricing overrides</span>
            )}
          </div>

          {project.team.length === 0 ? (
            <p className="muted">Assign estimator, designer, PM, and client.</p>
          ) : (
            <ul className="configurator-team-list">
              {project.team.map((m, i) => (
                <li key={`${m.role}-${i}`}>
                  <span className="configurator-status-chip is-neutral">{m.role}</span>
                  <span>
                    {m.name}
                    {m.email ? <small className="muted"> · {m.email}</small> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="configurator-field-grid compact">
            <label className="configurator-field">
              <span>Name</span>
              <input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Full name" />
            </label>
            <label className="configurator-field">
              <span>Role</span>
              <select value={memberRole} onChange={(e) => setMemberRole(e.target.value as TeamRole)}>
                {TEAM_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="configurator-field">
              <span>Email</span>
              <input value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="optional" />
            </label>
            <button type="button" className="configurator-btn" onClick={addTeamMember} disabled={!memberName.trim()}>
              Add teammate
            </button>
          </div>

          <div className="configurator-section">
            <div className="configurator-section-title">
              <strong>Client invite</strong>
            </div>
            <p className="muted">
              {loadOrgConfig().inviteCopy.portalBlurb} Copy the link into email — SMTP is not configured. Edit invite
              wording under <strong>Config → Invite copy</strong>.
            </p>
            <div className="configurator-inline-row">
              <input
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="client@email.com (optional)"
              />
              <button
                type="button"
                className="configurator-btn primary"
                disabled={inviteBusy}
                onClick={() => {
                  setInviteBusy(true);
                  void createClientInvite(clientEmail.trim() || undefined)
                    .then((url) => {
                      const email = formatInviteEmail(loadOrgConfig().inviteCopy, {
                        clientName: clientEmail.trim() || undefined,
                        projectName: project.name,
                        inviteUrl: url,
                      });
                      void navigator.clipboard?.writeText(email);
                    })
                    .finally(() => setInviteBusy(false));
                }}
              >
                {inviteBusy ? 'Creating…' : 'Create invite + copy email'}
              </button>
            </div>
            {lastInviteUrl && (
              <p className="muted">
                Link ready · <a className="configurator-invite-link" href={lastInviteUrl}>{lastInviteUrl}</a>
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
