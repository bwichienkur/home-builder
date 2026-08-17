import type { CloudProjectSummary } from '../../api/client';
import type { SharedDesign } from '../../lib/designShare';

export type HomeProject = {
  id: string;
  name: string;
  href: string;
  updatedAt: string;
  origin: 'cloud' | 'device';
  detail: string;
};

export function listHomeProjects(
  local: SharedDesign[],
  cloud: CloudProjectSummary[] = [],
): HomeProject[] {
  const rows: HomeProject[] = [
    ...cloud.map((project) => ({
      id: `cloud:${project.id}`,
      name: project.name || 'Untitled project',
      href: `/build?cloud=${encodeURIComponent(project.id)}`,
      updatedAt: project.updatedAt,
      origin: 'cloud' as const,
      detail: `Cloud · v${project.version}`,
    })),
    ...local.map((design) => {
      const stamp = design.updatedAt ?? design.createdAt;
      return {
        id: `device:${design.code}`,
        name: design.name || 'Untitled project',
        href: `/build?design=${encodeURIComponent(design.code)}`,
        updatedAt: stamp,
        origin: 'device' as const,
        detail: `This device · ${design.code}`,
      };
    }),
  ];
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
