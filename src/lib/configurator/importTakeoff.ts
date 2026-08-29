import * as XLSX from 'xlsx';
import type { PricingCategory } from './contractTypes';
import type { TakeoffLine, TakeoffSnapshot, QtySource } from './projectTypes';

const CATEGORY_HINTS: { pattern: RegExp; category: PricingCategory | string; room?: string }[] = [
  { pattern: /kitchen.*counter|counter.*kitchen|kitchen perimeter|kitchen island/i, category: 'countertops-kitchen', room: 'Kitchen' },
  { pattern: /master.*granite|granite master|owner.?s bath/i, category: 'countertops-bath', room: "Owner's Bath" },
  { pattern: /bath 2|granite bath 2/i, category: 'countertops-bath', room: 'Bath 2' },
  { pattern: /bath 3|granite bath 3/i, category: 'countertops-bath', room: 'Bath 3' },
  { pattern: /laundry/i, category: 'countertops-bath', room: 'Laundry' },
  { pattern: /tile floor|floors matl|porcelain floor|cottage fassa/i, category: 'floor-tile' },
  { pattern: /shower floor|shower flor|shower pan|zero entry/i, category: 'shower-pan' },
  { pattern: /wall tile|tile wall|walls to|8' to/i, category: 'wall-tile-shower' },
  { pattern: /backsplash|vetri/i, category: 'backsplash', room: 'Kitchen' },
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

function normalizeRoomName(raw: string): string | undefined {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s || /^(floors|total|budget|tile|granite)$/i.test(s)) return undefined;
  if (/master bath|owner.?s bath/i.test(s)) return "Owner's Bath";
  if (/bath\s*#?\s*2/i.test(s)) return 'Bath 2';
  if (/bath\s*#?\s*3/i.test(s)) return 'Bath 3';
  if (/master bedroom|owner.?s suite/i.test(s)) return "Owner's Suite";
  if (/great room/i.test(s)) return 'Great Room';
  if (/kitchen/i.test(s)) return 'Kitchen';
  if (/laundry/i.test(s)) return 'Laundry';
  if (/wet bar/i.test(s)) return 'Wet Bar';
  if (/stop/i.test(s)) return 'Stop & Drop';
  if (/pantry/i.test(s)) return 'Pantry';
  if (/lanai|summer kitchen/i.test(s)) return 'Lanai';
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferRoom(text: string, sheet: string): string | undefined {
  const hay = `${sheet} ${text}`;
  for (const hint of CATEGORY_HINTS) {
    if (hint.room && hint.pattern.test(hay)) return hint.room;
  }
  return normalizeRoomName(hay);
}

function roomsRoughlyMatch(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const nb = b.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  if (/owner|master/.test(na) && /owner|master/.test(nb) && /bath/.test(na) && /bath/.test(nb)) return true;
  return false;
}

/** Prefer rows with an explicit unit cell (sf/ea/lf) so budget dollars are skipped. */
function parseQtyUnit(row: unknown[]): { qty: number; unit: string; description: string } | null {
  const cells = row.map((c) => (c == null ? '' : String(c).trim()));
  const desc = cells.find((c) => c.length > 2 && !/^[\d.$]+$/.test(c) && !/^(sf|ea|lf|sq ft|each)$/i.test(c));
  if (!desc) return null;

  for (let i = 0; i < cells.length; i++) {
    const n = Number(cells[i]);
    if (!Number.isFinite(n) || n <= 0) continue;
    const next = cells[i + 1]?.toLowerCase();
    if (next === 'sf' || next === 'sq ft') return { qty: n, unit: 'sq ft', description: desc };
    if (next === 'lf' || next === 'linear ft') return { qty: n, unit: 'linear ft', description: desc };
    if (next === 'ea' || next === 'each') return { qty: n, unit: 'each', description: desc };
  }

  // Embedded "28 SF" / "680 LF" in description (Granite / Trim COF style)
  const embedded = desc.match(/([\d.]+)\s*(SF|LF)\b/i);
  if (embedded) {
    const qty = Number(embedded[1]);
    if (Number.isFinite(qty) && qty > 0) {
      return {
        qty,
        unit: /lf/i.test(embedded[2]!) ? 'linear ft' : 'sq ft',
        description: desc,
      };
    }
  }
  return null;
}

function parseSheetLines(sheetName: string, rows: unknown[][], source: TakeoffLine['source']): TakeoffLine[] {
  const lines: TakeoffLine[] = [];
  let currentRoom = '';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row?.length) continue;
    const cells = row.map((c) => (c == null ? '' : String(c).trim()));
    const first = cells[0] ?? '';

    if (/^(master bath|bath\s*#?\s*\d|floors|kitchen|great room|laundry)\b/i.test(first) && !parseQtyUnit(row)) {
      currentRoom = normalizeRoomName(first) ?? first;
      continue;
    }

    const parsed = parseQtyUnit(row);
    if (!parsed) continue;

    const room =
      normalizeRoomName(currentRoom) ??
      inferRoom(`${currentRoom} ${parsed.description}`, sheetName) ??
      undefined;

    lines.push({
      id: slugId([source, sheetName, i, parsed.description]),
      sheet: sheetName,
      room,
      category: inferCategory(`${currentRoom} ${parsed.description}`, sheetName),
      description: parsed.description,
      qty: parsed.qty,
      unit: parsed.unit,
      source,
    });
  }
  return lines;
}

/** Parse takeoff or COF workbooks into verified qty lines (skips bare dollar budgets). */
export function parseTakeoffWorkbook(buffer: ArrayBuffer, sourceFile?: string): TakeoffSnapshot {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const lines: TakeoffLine[] = [];
  const source: TakeoffLine['source'] = sourceFile?.toLowerCase().includes('cof') ? 'cof_xlsx' : 'takeoff_xlsx';

  for (const sheetName of wb.SheetNames) {
    if (/cover|sheet|allowance/i.test(sheetName)) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
    lines.push(...parseSheetLines(sheetName, rows, source));
  }

  return {
    importedAt: new Date().toISOString(),
    sourceFile,
    qtySource: 'takeoff',
    lines: dedupeTakeoffLines(lines),
  };
}

export function parseCofTakeoffWorkbook(buffer: ArrayBuffer, sourceFile?: string): TakeoffSnapshot {
  return parseTakeoffWorkbook(buffer, sourceFile ?? 'cof.xlsx');
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

export async function loadTakeoffFromFile(file: File): Promise<TakeoffSnapshot> {
  const buffer = await file.arrayBuffer();
  const lower = file.name.toLowerCase();
  if (lower.includes('cof')) return parseCofTakeoffWorkbook(buffer, file.name);
  return parseTakeoffWorkbook(buffer, file.name);
}

export function takeoffLinesForRoom(takeoff: TakeoffSnapshot | undefined, roomName: string): TakeoffLine[] {
  if (!takeoff) return [];
  return takeoff.lines.filter(
    (l) => (l.room && roomsRoughlyMatch(l.room, roomName)) || l.description.toLowerCase().includes(roomName.toLowerCase()),
  );
}

export function takeoffQtyForCategory(
  takeoff: TakeoffSnapshot | undefined,
  category: PricingCategory | string,
  room?: string,
): number {
  if (!takeoff) return 0;
  return takeoff.lines
    .filter((l) => l.category === category && (!room || !l.room || roomsRoughlyMatch(l.room, room)))
    .reduce((sum, l) => sum + l.qty, 0);
}

/** After plan approval: takeoff wins when present; otherwise geometry. */
export function resolveQtySource(
  planVerification: string,
  takeoff?: TakeoffSnapshot,
  preferred?: QtySource,
): QtySource {
  if (preferred === 'takeoff' || preferred === 'geometry') return preferred;
  if (takeoff?.qtySource === 'takeoff' || takeoff?.qtySource === 'geometry') return takeoff.qtySource;
  if (planVerification === 'approved_for_selections' && takeoff && takeoff.lines.length > 0) return 'takeoff';
  return 'geometry';
}

export function effectiveQty(input: {
  planVerification: string;
  takeoff?: TakeoffSnapshot;
  category: PricingCategory | string;
  room?: string;
  geometryQty: number;
  preferred?: QtySource;
}): number {
  const source = resolveQtySource(input.planVerification, input.takeoff, input.preferred ?? input.takeoff?.qtySource);
  if (source === 'takeoff') {
    const imported = takeoffQtyForCategory(input.takeoff, input.category, input.room);
    if (imported > 0) return imported;
  }
  return input.geometryQty;
}
