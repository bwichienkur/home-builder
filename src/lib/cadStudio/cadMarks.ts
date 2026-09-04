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

/** Door/window schedule CSV: Mark, Kind, WidthFt, SillFt, HostWall. */
export function exportDoorWindowScheduleCsv(plate: CadPlate): string {
  const marked = assignOpeningMarks(plate);
  const rows = [['Mark', 'Kind', 'WidthFt', 'SillFt', 'HostWall']];
  for (const o of marked.openingHints) {
    const width = o.widthFt ?? segLengthFt(o);
    const sill = o.sillFt ?? 0;
    const host =
      o.hostWallIndex != null && marked.wallCenterlines[o.hostWallIndex]
        ? String(o.hostWallIndex)
        : '';
    rows.push([
      o.mark ?? '',
      o.kind,
      width.toFixed(3),
      sill.toFixed(3),
      host,
    ]);
  }
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}
