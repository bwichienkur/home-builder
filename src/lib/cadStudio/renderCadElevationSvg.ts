import type { CadElevationSheet, CadSegmentRole } from './types';

const ROLE_STROKE: Record<CadSegmentRole, string> = {
  wall: '#334155',
  opening: '#b45309',
  fixture: '#0f766e',
  soft: '#64748b',
  elevation: '#475569',
  other: '#94a3b8',
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** SVG for a front/side elevation sheet (Y up, grade at bottom). */
export function renderCadElevationSvg(
  sheet: CadElevationSheet,
  opts?: { padFt?: number; title?: string; visibleLayers?: Set<string> },
): string {
  const pad = opts?.padFt ?? 2;
  const { minX, minY, maxX, maxY } = sheet.bounds;
  const w = Math.max(maxX - minX, 1) + pad * 2;
  const h = Math.max(maxY - minY, 1) + pad * 2;
  const ox = minX - pad;
  const oy = minY - pad;
  const stroke = Math.max(w, h) * 0.0015;
  const fontSize = Math.max(0.6, Math.min(1.4, Math.max(w, h) * 0.014));
  const visible = opts?.visibleLayers;
  const segs = visible
    ? sheet.segments.filter((s) => !visible || visible.has(s.layer))
    : sheet.segments;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(3)} ${h.toFixed(3)}" width="1200" height="${Math.round((1200 * h) / w)}" role="img" aria-label="${escapeXml(opts?.title ?? sheet.name)}">`,
    `<rect width="100%" height="100%" fill="#eef2f6"/>`,
    `<line x1="${pad.toFixed(2)}" y1="${(h - pad).toFixed(2)}" x2="${(w - pad).toFixed(2)}" y2="${(h - pad).toFixed(2)}" stroke="#64748b" stroke-width="${(stroke * 1.2).toFixed(4)}" stroke-dasharray="0.5 0.4"/>`,
    `<g>`,
  ];

  for (const s of segs) {
    const x1 = s.x1Ft - ox;
    const y1 = h - (s.y1Ft - oy);
    const x2 = s.x2Ft - ox;
    const y2 = h - (s.y2Ft - oy);
    const role = s.role;
    const color = /ROOF/i.test(s.layer) ? '#7c8491' : ROLE_STROKE[role];
    const useDash =
      /DASH|HIDDEN|PHANTOM|DOT/i.test(s.linetype ?? '') || /HATCH/i.test(s.layer)
        ? ' stroke-dasharray="0.3 0.25"'
        : '';
    parts.push(
      `<line x1="${x1.toFixed(3)}" y1="${y1.toFixed(3)}" x2="${x2.toFixed(3)}" y2="${y2.toFixed(3)}" stroke="${color}" stroke-width="${stroke.toFixed(4)}" stroke-linecap="round"${useDash}/>`,
    );
  }
  parts.push('</g>');

  for (const label of sheet.labels) {
    const x = label.x - ox;
    const y = h - (label.y - oy);
    parts.push(
      `<text x="${x.toFixed(3)}" y="${y.toFixed(3)}" fill="#0f172a" font-size="${fontSize.toFixed(3)}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-weight="500" text-anchor="middle">${escapeXml(label.text)}</text>`,
    );
  }

  if (opts?.title) {
    parts.push(
      `<text x="16" y="24" fill="#0f172a" font-size="18" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-weight="600">${escapeXml(opts.title)}</text>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}
