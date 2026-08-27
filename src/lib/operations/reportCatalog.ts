/** Catalog of in-app reports that mirror Buildertrend / Pipedrive report objects. */

export type OpsReportId =
  | 'wip'
  | 'change-orders'
  | 'cashflow'
  | 'past-due'
  | 'selections'
  | 'daily-logs'
  | 'schedule-slip'
  | 'pipeline';

export type OpsReportDef = {
  id: OpsReportId;
  title: string;
  lede: string;
  /** Buildertrend / Pipedrive report this replaces. */
  sourceReport: string;
  /** CRUD path when the report is a thin wrapper over an entity list. */
  manageTo?: string;
};

export const OPS_REPORTS: OpsReportDef[] = [
  {
    id: 'wip',
    title: 'WIP & contracts',
    lede: 'Revised contract, revenue to date, and WIP by job — from Work in progress / Profitability.',
    sourceReport: 'Buildertrend · Work in progress / Profitability',
    manageTo: '/ops/jobs',
  },
  {
    id: 'change-orders',
    title: 'Change order profit',
    lede: 'Change order revenue and profit by job.',
    sourceReport: 'Buildertrend · Change order profit',
    manageTo: '/ops/jobs',
  },
  {
    id: 'cashflow',
    title: 'Cash flow (Money In)',
    lede: 'Owner inflow entries (trailing 30d seed from BT Cash flow Money In).',
    sourceReport: 'Buildertrend · Cash flow',
  },
  {
    id: 'past-due',
    title: 'Past-due tasks',
    lede: 'Incomplete tasks with due dates before today.',
    sourceReport: 'Buildertrend · Tasks',
    manageTo: '/ops/tasks',
  },
  {
    id: 'selections',
    title: 'Pending selections',
    lede: 'Selections still pending across jobs.',
    sourceReport: 'Buildertrend · Selections grid',
    manageTo: '/ops/selections',
  },
  {
    id: 'daily-logs',
    title: 'Daily logs',
    lede: 'Daily log rows used for PM attendance and job activity.',
    sourceReport: 'Buildertrend · User daily logs',
    manageTo: '/ops/logs',
  },
  {
    id: 'schedule-slip',
    title: 'Baseline schedule slip',
    lede: 'Schedule line items with end-date / duration slip (Total Slip drilldown).',
    sourceReport: 'Buildertrend · Baseline vs actual duration',
  },
  {
    id: 'pipeline',
    title: 'Sales pipeline',
    lede: 'Open deals with value, confidence, and expected close.',
    sourceReport: 'Pipedrive · Sales pipeline (BT Lead Opportunities fallback)',
    manageTo: '/ops/deals',
  },
];

export function opsReportById(id: string): OpsReportDef | undefined {
  return OPS_REPORTS.find((r) => r.id === id);
}
