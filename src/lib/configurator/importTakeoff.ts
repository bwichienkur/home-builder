import * as XLSX from 'xlsx';
import type { PricingCategory } from './contractTypes';
import type { TakeoffLine, TakeoffSnapshot } from './projectTypes';

const CATEGORY_HINTS: { pattern: RegExp; category: PricingCategory | string; room?: string }[] = [
  { pattern: /kitchen.*counter|counter.*kitchen|kitchen perimeter/i, category: 'countertops-kitchen', room: 'Kitchen' },
  { pattern: /master.*granite|granite master|master bath.*top/i, category: 'countertops-bath', room: 'Master Bath' },
  { pattern: /bath 2|granite bath 2/i, category: 'countertops-bath', room: 'Bath 2' },
  { pattern: /bath 3|granite bath 3/i, category: 'countertops-bath', room: 'Bath 3' },
  { pattern: /laundry/i, category: 'countertops-bath', room: 'Laundry' },
  { pattern: /tile floor|floors matl|porcelain floor/i, category: 'floor-tile' },
  { pattern: /shower floor|shower flor|shower pan/i, category: 'shower-pan', room: 'Master Bath' },
  { pattern: /wall tile|tile wall|walls to/i, category: 'wall-tile-shower' },
  { pattern: /backsplash/i, category: 'backsplash', room: 'Kitchen' },
  { pattern: /plumbing|faucet|pot filler|disposal/i, category: 'plumbing-fixtures' },
  { pattern: /cabinet|shaker/i, category: 'cabinetry' },
  { pattern: /paver/i, category: 'pavers' },
  { pattern: /stone|eldorado/i, category: 'stone-veneer' },
  { pattern: /trim|baseboard|crown/i, category: 'trim' },
  { pattern: /window|pgt/i, category: 'windows' },
  { pattern: /summer kitchen|outdoor kitchen/i, category: 'outdoor-kitchen' },
];

function slugId(parts: (string | number | undefined)[]) {
  return parts.filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function inferCategory(text: string, sheet: string): PricingCategory | string {
  const hay = `${sheet} ${text}`.toLowerCase();
  for (const hint of CATEGORY_HINTS) {
    if (hint.pattern.test(hay)) return hint.category;
  }
  return sheet.toLowerCase().replace(/\s+/g, '-');
}

function inferRoom(text: string, sheet: string): string | undefined {
  const hay = `${sheet} ${text}`;
  for (const hint of CATEGORY_HINTS) {
    if (hint.room && hint.pattern.test(hay)) return hint.room;
  }
  const roomMatch = hay.match(
    /\b(master bath|master bathroom|kitchen|bath 2|bath 3|laundry|garage|living|dining|foyer|powder|pantry)\b/i,
  );
  return roomMatch ? roomMatch[1].replace(/\b\w/g, (c) => c.toUpperCase()) : undefined;
}

function parseQtyUnit(row: unknown[]): { qty: number; unit: string; description: string } | null {
  const cells = row.map((c) => (c == null ? '' : String(c).trim()));
  const desc = cells.find((c) => c.length > 2 && !/^[\d.$]+$/.test(c) && !/^(sf|ea|lf|sq ft|each)$/i.test(c));
  if (!desc) return null;

  let qty = 0;
  let unit = 'each';
  for (let i = 0; i < cells.length; i++) {
    const n = Number(cells[i]);
    if (Number.isFinite(n) && n > 0 && n < 100000) {
      qty = n;
      const next = cells[i + 1]?.toLowerCase();
      if (next === 'sf' || next === 'sq ft') unit = 'sq ft';
      else if (next === 'lf' || next === 'linear ft') unit = 'linear ft';
      else if (next === 'ea' || next === 'each') unit = 'each';
      break;
    }
  }
  if (!qty) return null;
  return { qty, unit, description: desc };
}

/** Parse generic Item/Qty takeoff sheets (Slab, Drywall, etc.). */
export function parseTakeoffWorkbook(buffer: ArrayBuffer, sourceFile?: string): TakeoffSnapshot {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const lines: TakeoffLine[] = [];

  for (const sheetName of wb.SheetNames) {
    if (/cover|sheet/i.test(sheetName)) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
    let headerRow = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const joined = (rows[i] as unknown[]).map(String).join('|').toLowerCase();
      if (joined.includes('qty') || joined.includes('quantity')) {
        headerRow = i;
        break;
      }
    }

    for (let i = headerRow >= 0 ? headerRow + 1 : 0; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      if (!row?.length) continue;
      const parsed = parseQtyUnit(row);
      if (!parsed) continue;
      const category = inferCategory(parsed.description, sheetName);
      const room = inferRoom(parsed.description, sheetName);
      lines.push({
        id: slugId(['takeoff', sheetName, i, parsed.description]),
        sheet: sheetName,
        room,
        category,
        description: parsed.description,
        qty: parsed.qty,
        unit: parsed.unit,
        source: 'takeoff_xlsx',
      });
    }

    // COF-style room sections: description row then qty on next lines
    let currentRoom = '';
    for (let i = 0; i < rows.length; i++) {
      const row = (rows[i] as unknown[]).map(String);
      const first = row[0]?.trim() ?? '';
      if (!first) continue;
      if (/^(master|kitchen|bath|laundry|total|budget|tile|granite)/i.test(first) && !/\d/.test(first)) {
        currentRoom = first;
      }
      const parsed = parseQtyUnit(row);
      if (!parsed) continue;
      lines.push({
        id: slugId(['cof-style', sheetName, i, parsed.description]),
        sheet: sheetName,
        room: (inferRoom(`${currentRoom} ${parsed.description}`, sheetName) ?? currentRoom) || undefined,
        category: inferCategory(`${currentRoom} ${parsed.description}`, sheetName),
        description: parsed.description,
        qty: parsed.qty,
        unit: parsed.unit,
        source: 'cof_xlsx',
      });
    }
  }

  const deduped = dedupeTakeoffLines(lines);
  return {
    importedAt: new Date().toISOString(),
    sourceFile,
    lines: deduped,
  };
}

function dedupeTakeoffLines(lines: TakeoffLine[]): TakeoffLine[] {
  const byKey = new Map<string, TakeoffLine>();
  for (const line of lines) {
    const key = `${line.sheet}|${line.room ?? ''}|${line.description}|${line.unit}`;
    const existing = byKey.get(key);
    if (!existing || line.qty > existing.qty) byKey.set(key, line);
  }
  return Array.from(byKey.values());
}

/** Parse project COF workbook (Tile, Granite sheets with room qty). */
export function parseCofTakeoffWorkbook(buffer: ArrayBuffer, sourceFile?: string): TakeoffSnapshot {
  return parseTakeoffWorkbook(buffer, sourceFile);
}

export async function loadTakeoffFromFile(file: File): Promise<TakeoffSnapshot> {
  const buffer = await file.arrayBuffer();
  const lower = file.name.toLowerCase();
  if (lower.includes('cof')) return parseCofTakeoffWorkbook(buffer, file.name);
  return parseTakeoffWorkbook(buffer, file.name);
}

export function takeoffLinesForRoom(takeoff: TakeoffSnapshot | undefined, roomName: string): TakeoffLine[] {
  if (!takeoff) return [];
  const needle = roomName.toLowerCase();
  return takeoff.lines.filter((l) => (l.room ?? '').toLowerCase().includes(needle) || l.description.toLowerCase().includes(needle));
}

export function takeoffQtyForCategory(
  takeoff: TakeoffSnapshot | undefined,
  category: PricingCategory | string,
  room?: string,
): number {
  if (!takeoff) return 0;
  return takeoff.lines
    .filter((l) => l.category === category && (!room || (l.room ?? '').toLowerCase().includes(room.toLowerCase())))
    .reduce((sum, l) => sum + l.qty, 0);
}
