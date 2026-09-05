import { segLengthFt } from './editCadPlate';
import type { CadOpeningHintFt, CadPlate } from './types';

const MARK_PREFIX: Record<CadOpeningHintFt['kind'], string> = {
  door: 'D',
  window: 'W',
  garage: 'G',
  passage: 'P',
};

/** Assign D1../W1../G1../P1.. marks by kind when missing. */
export function assignOpeningMarks(plate: CadPlate): CadPlate {
  const counters: Record<string, number> = { D: 0, W: 0, G: 0, P: 0 };
  // Reserve numbers already present
  for (const o of plate.openingHints) {
    if (!o.mark) continue;
    const m = /^([DWGP])(\d+)$/i.exec(o.mark.trim());
    if (!m) continue;
    const prefix = m[1]!.toUpperCase();
    const n = Number(m[2]);
    if (Number.isFinite(n)) counters[prefix] = Math.max(counters[prefix] ?? 0, n);
  }

  let changed = false;
  const openingHints = plate.openingHints.map((o) => {
    if (o.mark && o.mark.trim()) return o;
    const prefix = MARK_PREFIX[o.kind] ?? 'D';
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    changed = true;
    return { ...o, mark: `${prefix}${counters[prefix]}` };
  });

  if (!changed) return plate;
  return { ...plate, openingHints };
}

/** Rename a room/plan label by index. */
export function renameRoomLabel(plate: CadPlate, labelIndex: number, name: string): CadPlate {
  if (!plate.labels[labelIndex]) return plate;
  const labels = plate.labels.map((l, i) => (i === labelIndex ? { ...l, text: name } : l));
  return { ...plate, labels };
}

/** Door/window schedule CSV: Mark, Kind, WidthFt, HeightFt, SillFt, HostWall, Swing. */
export function exportDoorWindowScheduleCsv(plate: CadPlate): string {
  const marked = assignOpeningMarks(plate);
  const rows = [['Mark', 'Kind', 'WidthFt', 'HeightFt', 'SillFt', 'HostWall', 'Swing']];
  for (const o of marked.openingHints) {
    const width = o.widthFt ?? segLengthFt(o);
    const sill = o.sillFt ?? 0;
    const height =
      o.heightFt ??
      (o.kind === 'window' ? 4 : o.kind === 'garage' ? 7 : 6 + 8 / 12);
    const host =
      o.hostWallIndex != null && marked.wallCenterlines[o.hostWallIndex]
        ? String(o.hostWallIndex)
        : '';
    rows.push([
      o.mark ?? '',
      o.kind,
      width.toFixed(3),
      height.toFixed(3),
      sill.toFixed(3),
      host,
      o.swing ?? '',
    ]);
  }
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

/** HTML/SVG table block for sheet-set door/window schedule. */
export function renderDoorWindowScheduleSvg(plate: CadPlate): string {
  const marked = assignOpeningMarks(plate);
  const rows = marked.openingHints.map((o) => {
    const width = o.widthFt ?? segLengthFt(o);
    const height =
      o.heightFt ??
      (o.kind === 'window' ? 4 : o.kind === 'garage' ? 7 : 6 + 8 / 12);
    return {
      mark: o.mark ?? '—',
      kind: o.kind,
      width: width.toFixed(2),
      height: height.toFixed(2),
      sill: (o.sillFt ?? 0).toFixed(2),
      swing: o.swing ?? '—',
    };
  });
  const rowH = 22;
  const headerH = 28;
  const W = 720;
  const H = headerH + Math.max(1, rows.length) * rowH + 40;
  const body = rows
    .map(
      (r, i) =>
        `<text x="16" y="${headerH + 16 + i * rowH}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="12" fill="#1c1917">${r.mark}</text>
         <text x="80" y="${headerH + 16 + i * rowH}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="12" fill="#44403c">${r.kind}</text>
         <text x="180" y="${headerH + 16 + i * rowH}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="12" fill="#1c1917">${r.width}</text>
         <text x="280" y="${headerH + 16 + i * rowH}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="12" fill="#1c1917">${r.height}</text>
         <text x="380" y="${headerH + 16 + i * rowH}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="12" fill="#1c1917">${r.sill}</text>
         <text x="480" y="${headerH + 16 + i * rowH}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="12" fill="#1c1917">${r.swing}</text>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="#fff"/>
  <text x="16" y="22" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="14" font-weight="700" fill="#0f172a">DOOR / WINDOW SCHEDULE</text>
  <text x="16" y="${headerH + 2}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="11" fill="#78716c">MARK</text>
  <text x="80" y="${headerH + 2}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="11" fill="#78716c">KIND</text>
  <text x="180" y="${headerH + 2}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="11" fill="#78716c">WIDTH FT</text>
  <text x="280" y="${headerH + 2}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="11" fill="#78716c">HEIGHT FT</text>
  <text x="380" y="${headerH + 2}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="11" fill="#78716c">SILL FT</text>
  <text x="480" y="${headerH + 2}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="11" fill="#78716c">SWING</text>
  ${body || `<text x="16" y="${headerH + 20}" font-family="IBM Plex Sans, Segoe UI, sans-serif" font-size="12" fill="#a8a29e">No openings</text>`}
</svg>`;
}
