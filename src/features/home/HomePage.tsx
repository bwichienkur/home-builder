import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cloud, FolderOpen, Plus } from 'lucide-react';
import { fetchCloudProjects } from '../../lib/cloudProjects';
import { hydrateDesignsFromRemote, listSharedDesigns } from '../../lib/designShare';
import { platformConfig } from '../../lib/platform/config';
import { listHomeProjects, type HomeProject } from './homeProjects';
import { OwnerDashboard } from './OwnerDashboard';

function formatUpdated(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function ProjectRow({ project }: { project: HomeProject }) {
  return (
    <li>
      <Link className="home-project" to={project.href}>
        <span className="home-project-icon" aria-hidden>
          {project.origin === 'cloud' ? <Cloud size={18} strokeWidth={1.75} /> : <FolderOpen size={18} strokeWidth={1.75} />}
        </span>
        <span className="home-project-copy">
          <strong>{project.name}</strong>
          <span>
            {project.detail}
            {project.updatedAt ? ` · ${formatUpdated(project.updatedAt)}` : ''}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function HomePage() {
  const [localDesigns, setLocalDesigns] = useState(() => listSharedDesigns());
  const [cloudProjects, setCloudProjects] = useState<Awaited<ReturnType<typeof fetchCloudProjects>>>([]);
  const [cloudLoading, setCloudLoading] = useState(platformConfig.cloudConfigured());

  useEffect(() => {
    let cancelled = false;
    void hydrateDesignsFromRemote().then((items) => {
      if (!cancelled) setLocalDesigns(items);
    });
    if (!platformConfig.cloudConfigured()) {
      setCloudLoading(false);
      return () => {
        cancelled = true;
      };
    }
    void fetchCloudProjects().then((items) => {
      if (cancelled) return;
      setCloudProjects(items);
      setCloudLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const projects = useMemo(
    () => listHomeProjects(localDesigns, cloudProjects),
    [localDesigns, cloudProjects],
  );

  return (
    <div className="data-page home-page">
      <OwnerDashboard />

      <section className="home-build-files" aria-label="Build files">
        <header className="data-page-header">
          <div>
            <p className="eyebrow">Studio</p>
            <h2>Build files</h2>
            <p className="muted">Open a 3D plan on this device or in the cloud.</p>
          </div>
          <div className="data-page-actions">
            <Link className="home-new-project" to="/build?new=1">
              <Plus size={16} strokeWidth={2.2} />
              New project
            </Link>
          </div>
        </header>

        {projects.length === 0 && !cloudLoading ? (
          <div className="home-empty">
            <p>No Build files yet.</p>
            <Link to="/build?new=1">Start a new project</Link>
          </div>
        ) : (
          <ul className="home-project-list">
            {cloudLoading && (
              <li className="home-project-status">Loading cloud projects…</li>
            )}
            {projects.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
