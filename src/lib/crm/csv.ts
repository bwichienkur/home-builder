import type { CustomFieldDefinition, EntityKind } from './types';
import { CORE_CSV } from './types';

/** Minimal RFC4180-ish CSV parse (quoted fields, commas, newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, '');
  while (i < s.length) {
    const ch = s[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '') || rows.length === 0) rows.push(row);
      row = [];
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((v) => {
          const s = v == null ? '' : String(v);
          if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
          return s;
        })
        .join(','),
    )
    .join('\n');
}

export function csvHeaders(entity: EntityKind, fields: CustomFieldDefinition[]) {
  const custom = fields
    .filter((f) => f.entity === entity && !f.archived)
    .sort((a, b) => a.order - b.order)
    .map((f) => `custom.${f.key}`);
  return [...CORE_CSV[entity], ...custom];
}

export function downloadCsv(filename: string, rows: (string | number | boolean | null | undefined)[][]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function rowsToObjects(headers: string[], dataRows: string[][]) {
  return dataRows.map((cells, index) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = (cells[i] ?? '').trim();
    });
    return { row: index + 2, values: obj };
  });
}
