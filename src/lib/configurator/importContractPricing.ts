import * as XLSX from 'xlsx';
import type { PricingCategory } from './contractTypes';
import type { AllowanceBudget, ContractLevelOverride } from './projectTypes';

const LEVEL_IN_TEXT = /level\s*(\d+)/gi;

type ParsedContractModifiers = {
  allowances: AllowanceBudget[];
  levelOverrides: ContractLevelOverride[];
  notes: string[];
};

const CATEGORY_FROM_TEXT: { pattern: RegExp; category: PricingCategory }[] = [
  { pattern: /floor\s*tile|tile\s*floor|porcelain/i, category: 'floor-tile' },
  { pattern: /wall\s*tile|shower\s*wall|tub\s*wall/i, category: 'wall-tile-shower' },
  { pattern: /backsplash/i, category: 'backsplash' },
  { pattern: /countertop|granite|quartz/i, category: 'countertops-kitchen' },
  { pattern: /cabinet|shaker|maple/i, category: 'cabinetry' },
  { pattern: /plumbing|fixture|faucet/i, category: 'plumbing-fixtures' },
  { pattern: /paver|hardscape/i, category: 'pavers' },
  { pattern: /stone|eldorado/i, category: 'stone-veneer' },
  { pattern: /trim|baseboard|crown/i, category: 'trim' },
  { pattern: /window|pgt/i, category: 'windows' },
  { pattern: /outdoor\s*kitchen|summer\s*kitchen/i, category: 'outdoor-kitchen' },
  { pattern: /interior\s*door/i, category: 'interior-doors' },
];

function categoryFromText(text: string): PricingCategory | null {
  for (const row of CATEGORY_FROM_TEXT) {
    if (row.pattern.test(text)) return row.category;
  }
  return null;
}

/** Parse contract pricing page XLS/XLSX for allowance + level override hints. */
export function parseContractPricingWorkbook(buffer: ArrayBuffer): ParsedContractModifiers {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const allowances: AllowanceBudget[] = [];
  const levelOverrides: ContractLevelOverride[] = [];
  const notes: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
    for (const raw of rows) {
      const row = (raw as unknown[]).map((c) => (c == null ? '' : String(c).trim()));
      const text = row.filter(Boolean).join(' ');
      if (!text || text.length < 8) continue;

      const category = categoryFromText(text);
      if (!category) continue;

      const levelMatches = [...text.matchAll(LEVEL_IN_TEXT)].map((m) => `Level ${m[1]}`);
      if (levelMatches.length) {
        levelOverrides.push({
          pricingCategory: category,
          includedLevel: levelMatches[levelMatches.length - 1],
          label: text.slice(0, 120),
          source: 'contract_pricing_page',
        });
      }

      const allowanceMatch = text.match(/\$([\d,]+(?:\.\d+)?)/);
      if (/allowance|budget/i.test(text) && allowanceMatch) {
        allowances.push({
          pricingCategory: category,
          label: text.slice(0, 120),
          budgetAmount: Number(allowanceMatch[1].replace(/,/g, '')),
        });
      }

      if (/included|upgrade|pre-?purchase/i.test(text)) notes.push(text.slice(0, 160));
    }
  }

  return {
    allowances: dedupeAllowances(allowances),
    levelOverrides: dedupeOverrides(levelOverrides),
    notes,
  };
}

function dedupeAllowances(rows: AllowanceBudget[]): AllowanceBudget[] {
  const map = new Map<string, AllowanceBudget>();
  for (const row of rows) map.set(row.pricingCategory, row);
  return Array.from(map.values());
}

function dedupeOverrides(rows: ContractLevelOverride[]): ContractLevelOverride[] {
  const map = new Map<string, ContractLevelOverride>();
  for (const row of rows) map.set(row.pricingCategory, row);
  return Array.from(map.values());
}

export async function loadContractPricingFromFile(file: File): Promise<ParsedContractModifiers> {
  return parseContractPricingWorkbook(await file.arrayBuffer());
}
