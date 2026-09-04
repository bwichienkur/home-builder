import type { CadPlate } from './types';
import { detectCadRoomStamps, formatRoomAreaSqFt } from './cadRoomStamps';
import { formatWallLengthFt, segLengthFt } from './editCadPlate';

/** Minimal DXF of the CAD plate (walls, openings, slabs, stairs, guides, labels). */
export function exportCadPlateDxf(plate: CadPlate): string {
  const layerDef = (name: string, color: number) => [
    '0',
    'LAYER',
    '2',
    name,
    '70',
    '0',
    '62',
    String(color),
    '6',
    'CONTINUOUS',
  ];

  const line = (layer: string, x1: number, y1: number, x2: number, y2: number) => [
    '0',
    'LINE',
    '8',
    layer,
    '10',
    String(x1),
    '20',
    String(y1),
    '30',
    '0',
    '11',
    String(x2),
    '21',
    String(y2),
    '31',
    '0',
  ];

  const text = (layer: string, x: number, y: number, h: number, value: string) => [
    '0',
    'TEXT',
    '8',
    layer,
    '10',
    String(x),
    '20',
    String(y),
    '30',
    '0',
    '40',
    String(h),
    '1',
    value,
  ];

  const ents: string[] = [];

  for (const w of plate.wallCenterlines) {
    const layer = w.exterior ? 'A-WALL-EXT' : 'A-WALL-INT';
    ents.push(...line(layer, w.x1, w.y1, w.x2, w.y2));
  }
  for (const o of plate.openingHints) {
    const layer =
      o.kind === 'window'
        ? 'A-GLAZ'
        : o.kind === 'garage'
          ? 'A-GARAGE'
          : o.kind === 'passage'
            ? 'A-OPEN'
            : 'A-DOOR';
    ents.push(...line(layer, o.x1, o.y1, o.x2, o.y2));
  }
  for (const s of plate.slabs ?? []) {
    const layer =
      s.kind === 'foundation'
        ? 'A-FND-SLAB'
        : s.kind === 'footing'
          ? 'A-FND-FTG'
          : s.kind === 'plot'
            ? 'A-SITE-PLOT'
            : 'A-SLAB';
    const pts = s.points;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      ents.push(...line(layer, a.x, a.y, b.x, b.y));
    }
  }
  for (const st of plate.stairs ?? []) {
    const rad = (st.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const corners = [
      { x: 0, y: 0 },
      { x: st.runFt, y: 0 },
      { x: st.runFt, y: st.widthFt },
      { x: 0, y: st.widthFt },
    ].map((p) => ({
      x: st.xFt + p.x * cos - p.y * sin,
      y: st.yFt + p.x * sin + p.y * cos,
    }));
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % corners.length]!;
      ents.push(...line('A-STAIR', a.x, a.y, b.x, b.y));
    }
  }
  for (const g of plate.guidelines ?? []) {
    ents.push(...line('A-GUIDE', g.x1, g.y1, g.x2, g.y2));
  }
  for (const l of plate.labels) {
    ents.push(...text('TEXT', l.x, l.y, 1.2, l.text));
  }

  return [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$INSUNITS',
    '70',
    '2',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'TABLES',
    '0',
    'TABLE',
    '2',
    'LAYER',
    '70',
    '12',
    ...layerDef('A-WALL-EXT', 1),
    ...layerDef('A-WALL-INT', 5),
    ...layerDef('A-DOOR', 3),
    ...layerDef('A-GARAGE', 6),
    ...layerDef('A-GLAZ', 4),
    ...layerDef('A-OPEN', 3),
    ...layerDef('A-SLAB', 8),
    ...layerDef('A-FND-SLAB', 8),
    ...layerDef('A-FND-FTG', 8),
    ...layerDef('A-SITE-PLOT', 3),
    ...layerDef('A-STAIR', 2),
    ...layerDef('A-GUIDE', 8),
    ...layerDef('TEXT', 2),
    '0',
    'ENDTAB',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    ...ents,
    '0',
    'ENDSEC',
    '0',
    'EOF',
  ].join('\n');
}

export function downloadTextFile(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCadRoomScheduleCsv(plate: CadPlate): string {
  const stamps = detectCadRoomStamps(plate);
  const rows = [['Name', 'AreaSqFt', 'Xft', 'Yft']];
  let total = 0;
  for (const s of stamps) {
    total += s.areaSqFt;
    rows.push([s.name, s.areaSqFt.toFixed(1), s.x.toFixed(2), s.y.toFixed(2)]);
  }
  rows.push(['TOTAL', total.toFixed(1), '', '']);
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function roomScheduleSummary(plate: CadPlate): { name: string; areaLabel: string; areaSqFt: number }[] {
  return detectCadRoomStamps(plate).map((s) => ({
    name: s.name,
    areaLabel: formatRoomAreaSqFt(s.areaSqFt),
    areaSqFt: s.areaSqFt,
  }));
}

/** SVG string → PNG download via canvas. */
export async function downloadSvgAsPng(svg: string, filename: string, width = 1600) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const ratio = img.height / Math.max(1, img.width);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.max(1, Math.round(width * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#f1efe8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function wallLengthSummary(plate: CadPlate): string {
  const total = plate.wallCenterlines.reduce((sum, w) => sum + segLengthFt(w), 0);
  return formatWallLengthFt(total);
}
