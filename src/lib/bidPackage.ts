import type { EstimateLine, EstimateSnapshot, EstimateTotals } from './estimateSnapshot';
import { downloadCanvasesPdf } from './planExport/drawFloorPlan';

export type BidPackageMeta = {
  projectName: string;
  clientName?: string;
  jurisdiction?: string;
  validityDays?: number;
  paymentTerms?: string;
  inclusions?: string;
  exclusions?: string;
  alternateNotes?: string;
  preparedBy?: string;
};

export type SovRow = {
  csi: string;
  division: string;
  description: string;
  amount: number;
};

const DEFAULT_INCLUSIONS =
  'Architectural framing, envelope allowances, interior finishes from takeoff, MEP rough allowances, sitework proxies, OH&P, tax, and bond as shown.';
const DEFAULT_EXCLUSIONS =
  'Specialty engineered systems, utility company fees, permits/impact fees unless listed, furnishings beyond FF&E schedule, hazardous materials, winter conditions, and owner-furnished equipment.';
const DEFAULT_PAYMENT = 'Progress payments monthly; retainage 5%; final payment on punch completion.';

/** CSI division title for SOV grouping (first 2 digits). */
export function csiDivisionLabel(csi?: string): string {
  const div = (csi ?? '00').trim().slice(0, 2);
  const map: Record<string, string> = {
    '02': 'Existing Conditions / Site',
    '03': 'Concrete',
    '06': 'Wood, Plastics & Composites',
    '07': 'Thermal & Moisture Protection',
    '08': 'Openings',
    '09': 'Finishes',
    '22': 'Plumbing',
    '23': 'HVAC',
    '26': 'Electrical',
    '31': 'Earthwork',
    '32': 'Exterior Improvements',
  };
  return map[div] ?? `Division ${div}`;
}

/** Schedule of Values rows rolled up by CSI division. */
export function buildScheduleOfValues(lines: EstimateLine[]): SovRow[] {
  const byDiv = new Map<string, SovRow>();
  for (const line of lines) {
    const csi = line.csi ?? '00 00 00';
    const div = csi.slice(0, 2);
    const amount = line.material + line.labor;
    const existing = byDiv.get(div);
    if (existing) {
      existing.amount += amount;
      continue;
    }
    byDiv.set(div, {
      csi: `${div} 00 00`,
      division: csiDivisionLabel(csi),
      description: csiDivisionLabel(csi),
      amount,
    });
  }
  return [...byDiv.values()].sort((a, b) => a.csi.localeCompare(b.csi));
}

export function scheduleOfValuesCsv(snap: EstimateSnapshot, meta: BidPackageMeta): string {
  const rows = buildScheduleOfValues(snap.lines);
  const out: string[][] = [
    ['Project', meta.projectName],
    ['Estimate', snap.label],
    ['Version', String(snap.version)],
    ['Saved', snap.savedAt],
    ['Jurisdiction', meta.jurisdiction ?? ''],
    ['Disclaimer', snap.disclaimer],
    [],
    ['CSI', 'Division', 'Amount'],
    ...rows.map((r) => [r.csi, r.division, r.amount.toFixed(2)]),
    [],
    ['Material', snap.totals.material.toFixed(2)],
    ['Labor', snap.totals.labor.toFixed(2)],
    ['Subtotal (direct)', snap.totals.subtotal.toFixed(2)],
    ['Contingency', (snap.totals.contingency ?? 0).toFixed(2)],
    ['Escalation', (snap.totals.escalation ?? 0).toFixed(2)],
    ['OH&P markup', snap.totals.markup.toFixed(2)],
    ['Tax', snap.totals.tax.toFixed(2)],
    ['Bond', (snap.totals.bond ?? 0).toFixed(2)],
    ['Grand total', snap.totals.grandTotal.toFixed(2)],
  ];
  return out.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';
}

function money(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function drawProposalPage(
  title: string,
  body: Array<{ heading?: string; lines: string[] }>,
  footer: string,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1275; // 8.5" @ 150dpi
  canvas.height = 1650; // 11"
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f7f4ef';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1c2a33';
  ctx.font = '700 42px "Iowan Old Style", "Palatino Linotype", Palatino, serif';
  ctx.fillText('Mahnikka', 72, 90);
  ctx.font = '600 28px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(title, 72, 140);
  ctx.strokeStyle = '#c4b8a8';
  ctx.beginPath();
  ctx.moveTo(72, 160);
  ctx.lineTo(canvas.width - 72, 160);
  ctx.stroke();

  let y = 210;
  for (const block of body) {
    if (block.heading) {
      ctx.font = '700 20px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#1c2a33';
      ctx.fillText(block.heading, 72, y);
      y += 34;
    }
    ctx.font = '400 16px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#334049';
    for (const line of block.lines) {
      for (const wrapped of wrapText(ctx, line, canvas.width - 144)) {
        if (y > canvas.height - 100) break;
        ctx.fillText(wrapped, 72, y);
        y += 24;
      }
      y += 6;
    }
    y += 16;
  }

  ctx.font = '400 13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#6a737a';
  ctx.fillText(footer, 72, canvas.height - 48);
  return canvas;
}

/** Multi-page bid proposal PDF from a frozen estimate snapshot. */
export function downloadBidProposalPdf(
  snap: EstimateSnapshot,
  meta: BidPackageMeta,
  filename: string,
) {
  const totals: EstimateTotals = snap.totals;
  const sov = buildScheduleOfValues(snap.lines);
  const validity = meta.validityDays ?? 30;
  const cover = drawProposalPage(
    'Bid proposal',
    [
      {
        lines: [
          `Project: ${meta.projectName}`,
          meta.clientName ? `Client: ${meta.clientName}` : '',
          meta.jurisdiction ? `Jurisdiction: ${meta.jurisdiction}` : '',
          `Estimate: ${snap.label} (v${snap.version})`,
          `Prepared: ${new Date(snap.savedAt).toLocaleString()}`,
          meta.preparedBy ? `Prepared by: ${meta.preparedBy}` : '',
          `Validity: ${validity} days from proposal date`,
        ].filter(Boolean),
      },
      {
        heading: 'Commercial summary',
        lines: [
          `Direct material: ${money(totals.material)}`,
          `Direct labor: ${money(totals.labor)}`,
          `Direct subtotal: ${money(totals.subtotal)}`,
          `Contingency: ${money(totals.contingency ?? 0)}`,
          `Escalation: ${money(totals.escalation ?? 0)}`,
          `OH&P: ${money(totals.markup)}`,
          `Tax: ${money(totals.tax)}`,
          `Bond: ${money(totals.bond ?? 0)}`,
          `Grand total: ${money(totals.grandTotal)}`,
        ],
      },
    ],
    snap.disclaimer,
  );

  const sovLines = sov.map((r) => `${r.csi}  ${r.division}: ${money(r.amount)}`);
  const detailLines = snap.lines.slice(0, 40).map(
    (l) =>
      `${l.csi ?? '—'}  ${l.name}: ${l.qty.toFixed(1)} ${l.unit} → ${money(l.material + l.labor)}`,
  );
  const sovPage = drawProposalPage(
    'Schedule of values',
    [
      { heading: 'By CSI division', lines: sovLines },
      { heading: 'Line detail (top 40)', lines: detailLines },
    ],
    `Grand total ${money(totals.grandTotal)}`,
  );

  const terms = drawProposalPage(
    'Scope, terms & clarifications',
    [
      {
        heading: 'Inclusions',
        lines: [meta.inclusions?.trim() || DEFAULT_INCLUSIONS],
      },
      {
        heading: 'Exclusions',
        lines: [meta.exclusions?.trim() || DEFAULT_EXCLUSIONS],
      },
      {
        heading: 'Payment terms',
        lines: [meta.paymentTerms?.trim() || DEFAULT_PAYMENT],
      },
      {
        heading: 'Alternates / allowances',
        lines: [
          meta.alternateNotes?.trim() ||
            'Unit prices and allowances are schematic; owner selections may adjust the contract sum via change order.',
        ],
      },
    ],
    'Not an engineering-sealed document. Subject to final drawings, specs, and site conditions.',
  );

  downloadCanvasesPdf([cover, sovPage, terms], filename);
}

export function downloadTextFile(content: string, filename: string, mime = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
