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
  opts?: { padFt?: number; title?: string; visibleLayers?: Set<string>; richFills?: boolean },
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
    `<rect width="100%" height="100%" fill="#c8d4e0"/>`,
    `<line x1="${pad.toFixed(2)}" y1="${(h - pad).toFixed(2)}" x2="${(w - pad).toFixed(2)}" y2="${(h - pad).toFixed(2)}" stroke="#64748b" stroke-width="${(stroke * 1.2).toFixed(4)}" stroke-dasharray="0.5 0.4"/>`,
  ];

  if (opts?.richFills) {
    const wallTop = Math.max(
      ...segs.filter((s) => /WALL|EXT|BRG/i.test(s.layer)).flatMap((s) => [s.y1Ft, s.y2Ft]),
      maxY - 1,
    );
    const wallLeft = minX - ox;
    const wallRight = maxX - ox;
    const gradeY = h - (minY - oy);
    const topY = h - (Math.min(wallTop, maxY) - oy);
    parts.push(
      `<rect x="${wallLeft.toFixed(2)}" y="${topY.toFixed(2)}" width="${(wallRight - wallLeft).toFixed(2)}" height="${(gradeY - topY).toFixed(2)}" fill="#e8e2d6"/>`,
    );

    for (const s of segs) {
      const u = s.layer.toUpperCase();
      if (/STONE|BRG|COLUMN|PORCH/i.test(u)) {
        const x1 = Math.min(s.x1Ft, s.x2Ft) - ox;
        const x2 = Math.max(s.x1Ft, s.x2Ft) - ox;
        const y1 = h - (Math.max(s.y1Ft, s.y2Ft) - oy);
        const y2 = h - (Math.min(s.y1Ft, s.y2Ft) - oy);
        if (x2 - x1 > 0.2 && y2 - y1 > 0.2) {
          parts.push(
            `<rect x="${x1.toFixed(2)}" y="${y1.toFixed(2)}" width="${(x2 - x1).toFixed(2)}" height="${(y2 - y1).toFixed(2)}" fill="#a8a29e" opacity="0.85"/>`,
          );
        }
      }
    }

    for (const s of segs) {
      if (s.role !== 'opening' && !/WINDOW|DOOR|GLAZ|GARAGE|OPEN/i.test(s.layer)) continue;
      const x1 = Math.min(s.x1Ft, s.x2Ft) - ox;
      const x2 = Math.max(s.x1Ft, s.x2Ft) - ox;
      const y1 = h - (Math.max(s.y1Ft, s.y2Ft) - oy);
      const y2 = h - (Math.min(s.y1Ft, s.y2Ft) - oy);
      if (x2 - x1 < 0.3 || y2 - y1 < 0.3) continue;
      const isWindow = /WINDOW|GLAZ/i.test(s.layer) || s.role === 'opening' && !/DOOR|GARAGE/i.test(s.layer);
      const fill = isWindow ? '#7dd3fc' : '#334155';
      const op = isWindow ? 0.65 : 0.9;
      parts.push(
        `<rect x="${x1.toFixed(2)}" y="${y1.toFixed(2)}" width="${(x2 - x1).toFixed(2)}" height="${(y2 - y1).toFixed(2)}" fill="${fill}" opacity="${op}" rx="0.08"/>`,
      );
    }

    const roofPts = segs
      .filter((s) => /ROOF|TRUSS|RAFTER|GABLE/i.test(s.layer))
      .flatMap((s) => [
        { x: s.x1Ft - ox, y: h - (s.y1Ft - oy) },
        { x: s.x2Ft - ox, y: h - (s.y2Ft - oy) },
      ]);
    if (roofPts.length >= 4) {
      const bins = new Map<number, number>();
      for (const p of roofPts) {
        const k = Math.round(p.x * 4);
        bins.set(k, Math.max(bins.get(k) ?? 0, p.y));
      }
      const profile = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([k, y]) => ({ x: k / 4, y }));
      if (profile.length >= 2) {
        const poly = profile.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
        const base = `${profile[0]!.x.toFixed(2)},${gradeY.toFixed(2)} ${profile[profile.length - 1]!.x.toFixed(2)},${gradeY.toFixed(2)}`;
        parts.push(`<polygon points="${poly} ${base}" fill="#8b7355" opacity="0.88"/>`);
      }
    }
  }

  parts.push(`<g>`);

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


  // Level markers + overall height dim (Plan7 elevation finish)
  const gradeY = h - ((sheet.gradeFt ?? minY) - oy);
  const ridgeY = Math.min(
    ...segs.map((s) => h - (Math.max(s.y1Ft, s.y2Ft) - oy)),
    h - pad,
  );
  const eaveCandidates = segs
    .filter((s) => /WALL|EXT|BRG|FACADE/i.test(s.layer))
    .map((s) => h - (Math.max(s.y1Ft, s.y2Ft) - oy));
  const eaveY = eaveCandidates.length ? Math.min(...eaveCandidates) : (gradeY + ridgeY) / 2;
  const levels: Array<{ label: string; y: number }> = [
    { label: 'GRADE', y: gradeY },
    { label: 'EAVE', y: eaveY },
    { label: 'RIDGE', y: ridgeY },
  ];
  const lx = w - pad * 0.35;
  for (const lvl of levels) {
    parts.push(
      `<line x1="${pad.toFixed(2)}" y1="${lvl.y.toFixed(2)}" x2="${(w - pad * 0.55).toFixed(2)}" y2="${lvl.y.toFixed(2)}" stroke="#a8a29e" stroke-width="0.03" stroke-dasharray="0.25 0.18"/>`,
    );
    parts.push(
      `<polygon points="${lx.toFixed(2)},${lvl.y.toFixed(2)} ${(lx - 0.35).toFixed(2)},${(lvl.y - 0.18).toFixed(2)} ${(lx - 0.35).toFixed(2)},${(lvl.y + 0.18).toFixed(2)}" fill="#0f172a"/>`,
    );
    parts.push(
      `<text x="${(lx - 0.5).toFixed(2)}" y="${(lvl.y + 0.12).toFixed(2)}" fill="#0f172a" font-size="${(fontSize * 0.7).toFixed(3)}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-weight="600" text-anchor="end">${escapeXml(lvl.label)}</text>`,
    );
  }
  // Overall height dimension on the left
  const dimX = pad * 0.45;
  parts.push(
    `<line x1="${dimX.toFixed(2)}" y1="${gradeY.toFixed(2)}" x2="${dimX.toFixed(2)}" y2="${ridgeY.toFixed(2)}" stroke="#475569" stroke-width="0.05"/>`,
  );
  parts.push(
    `<line x1="${(dimX - 0.25).toFixed(2)}" y1="${gradeY.toFixed(2)}" x2="${(dimX + 0.25).toFixed(2)}" y2="${gradeY.toFixed(2)}" stroke="#475569" stroke-width="0.05"/>`,
  );
  parts.push(
    `<line x1="${(dimX - 0.25).toFixed(2)}" y1="${ridgeY.toFixed(2)}" x2="${(dimX + 0.25).toFixed(2)}" y2="${ridgeY.toFixed(2)}" stroke="#475569" stroke-width="0.05"/>`,
  );
  const heightFt = Math.abs((sheet.gradeFt ?? minY) - (maxY));
  const midY = (gradeY + ridgeY) / 2;
  parts.push(
    `<text x="${(dimX + 0.35).toFixed(2)}" y="${midY.toFixed(2)}" fill="#334155" font-size="${(fontSize * 0.75).toFixed(3)}" font-family="IBM Plex Sans, Segoe UI, sans-serif" transform="rotate(-90 ${(dimX + 0.35).toFixed(2)} ${midY.toFixed(2)})" text-anchor="middle">${heightFt.toFixed(1)}'</text>`,
  );

  if (opts?.title) {
    parts.push(
      `<text x="16" y="24" fill="#0f172a" font-size="18" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-weight="600">${escapeXml(opts.title)}</text>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

/** Data URL for the same SVG used on the Plate elevation tab (Massing facade texture). */
export function elevationSvgDataUrl(
  sheet: CadElevationSheet,
  opts?: { padFt?: number; visibleLayers?: Set<string>; richFills?: boolean },
): string {
  const svg = renderCadElevationSvg(sheet, {
    padFt: opts?.padFt ?? 0.25,
    visibleLayers: opts?.visibleLayers,
    richFills: opts?.richFills ?? false,
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
