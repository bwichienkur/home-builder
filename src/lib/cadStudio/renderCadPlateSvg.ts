import type { CadPlate, CadSegmentFt, CadSegmentRole } from './types';
import { visibleLabels, visibleSegments } from './buildCadPlate';

const ROLE_STROKE: Record<CadSegmentRole, string> = {
  wall: '#1e293b',
  opening: '#b45309',
  fixture: '#0f766e',
  soft: '#475569',
  elevation: '#64748b',
  other: '#94a3b8',
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Exact plate SVG from visible CAD segments + room labels (feet → viewBox). */
export function renderCadPlateSvg(plate: CadPlate, opts?: { padFt?: number; title?: string }): string {
  const segs = visibleSegments(plate);
  const labels = visibleLabels(plate);
  const pad = opts?.padFt ?? 2;
  const { minX, minY, maxX, maxY } = plate.bounds;
  const w = Math.max(maxX - minX, 1) + pad * 2;
  const h = Math.max(maxY - minY, 1) + pad * 2;
  const ox = minX - pad;
  const oy = minY - pad;
  const stroke = Math.max(w, h) * 0.0012;
  const fontSize = Math.max(0.7, Math.min(1.6, Math.max(w, h) * 0.012));

  const byRole: Record<CadSegmentRole, CadSegmentFt[]> = {
    wall: [],
    opening: [],
    fixture: [],
    soft: [],
    elevation: [],
    other: [],
  };
  for (const s of segs) byRole[s.role].push(s);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(3)} ${h.toFixed(3)}" width="1400" height="${Math.round((1400 * h) / w)}" role="img" aria-label="${escapeXml(opts?.title ?? plate.sourceFileName)}">`,
    `<rect width="100%" height="100%" fill="#f1efe8"/>`,
    `<g transform="translate(${(-ox).toFixed(3)} ${(h + oy).toFixed(3)}) scale(1,-1)">`,
  ];

  for (const role of Object.keys(byRole) as CadSegmentRole[]) {
    const list = byRole[role];
    if (!list.length) continue;
    const opacity = role === 'other' ? 0.35 : role === 'elevation' ? 0.4 : 0.9;
    const widthMul = role === 'fixture' ? 0.85 : role === 'soft' ? 0.7 : 1;
    for (const s of list) {
      const useDash =
        role === 'soft' || /DASH|HIDDEN|PHANTOM|DOT/i.test(s.linetype ?? '')
          ? ' stroke-dasharray="0.35 0.28"'
          : '';
      parts.push(
        `<line x1="${s.x1.toFixed(3)}" y1="${s.y1.toFixed(3)}" x2="${s.x2.toFixed(3)}" y2="${s.y2.toFixed(3)}" stroke="${ROLE_STROKE[role]}" stroke-width="${(stroke * widthMul).toFixed(4)}" stroke-opacity="${opacity}" stroke-linecap="round"${useDash}/>`,
      );
    }
  }

  parts.push('</g>');

  // Room names in screen space so text is not mirrored by the plan Y flip.
  for (const label of labels) {
    const x = label.x - ox;
    const y = h - (label.y - oy);
    parts.push(
      `<text x="${x.toFixed(3)}" y="${y.toFixed(3)}" fill="#0f172a" font-size="${fontSize.toFixed(3)}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-weight="600" text-anchor="middle" dominant-baseline="middle">${escapeXml(label.text)}</text>`,
    );
  }

  if (opts?.title) {
    parts.push(
      `<text x="16" y="28" fill="#0f172a" font-size="20" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-weight="600">${escapeXml(opts.title)}</text>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}
