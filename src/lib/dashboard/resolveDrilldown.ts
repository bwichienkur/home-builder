import { formatCompactUsd, formatUsd, phaseLabel } from '../buildertrend/format';
import type { OwnerPhase, ProjectSnapshot } from '../buildertrend/types';
import { numericJobId } from './buildDrilldown';
import type { DrilldownKind, LiveDrilldown } from './drilldownTypes';

export type DrillColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** When set, values are numeric and a totals row sums this column. */
  sum?: 'usd' | 'compactUsd' | 'number';
};

export type DrillRow = Record<string, string | number>;

export type ResolvedDrilldown = {
  title: string;
  subtitle: string;
  columns: DrillColumn[];
  rows: DrillRow[];
};

function projectsFor(projects: ProjectSnapshot[], kind: DrilldownKind): ProjectSnapshot[] {
  if (kind.type === 'pm-projects' || kind.type === 'pm-logs' || kind.type === 'pm-past-due') {
    return projects.filter((p) => p.pm === kind.pm);
  }
  if (kind.type === 'phase-projects') {
    return projects.filter((p) => p.phase === kind.phase);
  }
  if (kind.type === 'all-projects') return projects;
  return [];
}

export function formatDrillCell(col: DrillColumn, value: string | number | undefined): string {
  if (value == null || value === '') return '—';
  if (col.sum === 'usd' && typeof value === 'number') return formatUsd(value);
  if (col.sum === 'compactUsd' && typeof value === 'number') return formatCompactUsd(value);
  if (col.sum === 'number' && typeof value === 'number') return String(value);
  return String(value);
}

/** Sum numeric columns marked with `sum` for the totals footer. */
export function sumDrillColumns(columns: DrillColumn[], rows: DrillRow[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const col of columns) {
    if (!col.sum) continue;
    totals[col.key] = rows.reduce((sum, row) => {
      const value = row[col.key];
      return sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0);
    }, 0);
  }
  return totals;
}

/** Case-insensitive match across formatted cell values for a detail grid search. */
export function filterDrillRows(columns: DrillColumn[], rows: DrillRow[], query: string): DrillRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    columns.some((col) => formatDrillCell(col, row[col.key]).toLowerCase().includes(needle)),
  );
}

export function resolveDrilldown(
  kind: DrilldownKind,
  projects: ProjectSnapshot[],
  detail: LiveDrilldown | null,
): ResolvedDrilldown {
  if (kind.type === 'pipeline-stage' || kind.type === 'expected-signing' || kind.type === 'open-deals') {
    let deals =
      kind.type === 'pipeline-stage'
        ? detail?.dealsByStage[kind.stageId] ?? []
        : kind.type === 'open-deals'
          ? [
              ...(detail?.dealsByStage.lead ?? []),
              ...(detail?.dealsByStage.proposal ?? []),
              ...(detail?.dealsByStage['pre-contract'] ?? []),
              ...(detail?.dealsByStage.contract ?? []),
            ]
          : [
              ...(detail?.dealsByStage.contract ?? []),
              ...(detail?.dealsByStage.lead ?? []),
              ...(detail?.dealsByStage.proposal ?? []),
              ...(detail?.dealsByStage['pre-contract'] ?? []),
            ].filter((d) => d.expectedCloseDate || d.stageName === 'Contract Sent');
    if (kind.type === 'expected-signing' && deals.length === 0) {
      deals = detail?.dealsByStage.contract ?? [];
    }
    const total = deals.reduce((s, d) => s + d.value, 0);
    const weighted = deals.reduce((s, d) => s + d.weightedValue, 0);
    const title =
      kind.type === 'expected-signing'
        ? 'Expected signing value'
        : kind.type === 'open-deals'
          ? kind.label || 'Open Sales deals (weighted pipeline)'
          : `${kind.label} deals`;
    const subtitle =
      kind.type === 'expected-signing'
        ? `${deals.length} deals · ${formatCompactUsd(total)} (Contract Sent and/or expected close within ~90 days)`
        : kind.type === 'open-deals'
          ? `${deals.length} open deals · ${formatCompactUsd(total)} value · ${formatCompactUsd(weighted)} weighted`
          : `${deals.length} deals · ${formatCompactUsd(total)} total value`;
    return {
      title,
      subtitle,
      columns: [
        { key: 'title', label: 'Deal' },
        { key: 'stageName', label: 'Pipedrive stage' },
        { key: 'value', label: 'Value', align: 'right', sum: 'usd' },
        { key: 'probabilityPct', label: 'Prob %', align: 'right' },
        { key: 'weightedValue', label: 'Weighted', align: 'right', sum: 'usd' },
        { key: 'expectedCloseDate', label: 'Expected close' },
      ],
      rows: deals.map((d) => ({
        title: d.title || `Deal ${d.id}`,
        stageName: d.stageName,
        value: d.value,
        probabilityPct: Math.round(d.probabilityPct),
        weightedValue: d.weightedValue,
        expectedCloseDate: d.expectedCloseDate || '—',
      })),
    };
  }

  if (kind.type === 'job-selections' || kind.type === 'all-pending-selections') {
    const entries =
      kind.type === 'job-selections'
        ? detail?.selectionsByJobId[numericJobId(kind.jobId)] ?? []
        : Object.values(detail?.selectionsByJobId ?? {}).flat();
    const title = kind.type === 'job-selections' ? `Pending selections · ${kind.jobName}` : 'Pending selections (all jobs)';
    return {
      title,
      subtitle: `${entries.length} selections not marked Selected/Completed`,
      columns: [
        { key: 'jobName', label: 'Job' },
        { key: 'title', label: 'Selection' },
        { key: 'statusLabel', label: 'Status' },
        { key: 'category', label: 'Category' },
        { key: 'location', label: 'Location' },
        { key: 'deadline', label: 'Deadline' },
      ],
      rows: entries.map((row) => ({
        jobName: row.jobName,
        title: row.title || `Selection ${row.id}`,
        statusLabel: row.statusLabel,
        category: row.category || '—',
        location: row.location || '—',
        deadline: row.deadline || '—',
      })),
    };
  }

  if (kind.type === 'job-past-due' || kind.type === 'all-past-due' || kind.type === 'pm-past-due') {
    let entries = Object.values(detail?.pastDueByJobId ?? {}).flat();
    if (kind.type === 'job-past-due') {
      entries = detail?.pastDueByJobId[numericJobId(kind.jobId)] ?? [];
    } else if (kind.type === 'pm-past-due') {
      const ids = new Set(projects.filter((p) => p.pm === kind.pm).map((p) => numericJobId(p.id)));
      entries = entries.filter((t) => ids.has(String(t.jobId)));
    }
    const title =
      kind.type === 'job-past-due'
        ? `Past-due tasks · ${kind.jobName}`
        : kind.type === 'pm-past-due'
          ? `Past-due tasks · ${kind.pm}`
          : 'Past-due tasks (all jobs)';
    return {
      title,
      subtitle: `${entries.length} incomplete tasks with due date before today`,
      columns: [
        { key: 'jobName', label: 'Job' },
        { key: 'title', label: 'Task' },
        { key: 'endDate', label: 'Due' },
        { key: 'assignedTo', label: 'Assigned' },
      ],
      rows: entries.map((row) => ({
        jobName: row.jobName,
        title: row.title || `Task ${row.taskId}`,
        endDate: row.endDate,
        assignedTo: row.assignedTo || '—',
      })),
    };
  }

  if (kind.type === 'job-logs' || kind.type === 'pm-logs' || kind.type === 'all-logs') {
    let entries = Object.values(detail?.logsByJobId ?? {}).flat();
    if (kind.type === 'job-logs') {
      entries = detail?.logsByJobId[numericJobId(kind.jobId)] ?? [];
    } else if (kind.type === 'pm-logs') {
      const ids = new Set(projects.filter((p) => p.pm === kind.pm).map((p) => numericJobId(p.id)));
      entries = entries.filter((l) => ids.has(String(l.jobId)));
    }
    const pmByJob = new Map(projects.map((p) => [numericJobId(p.id), p.pm]));
    entries = [...entries].sort((a, b) => {
      const byJob = a.jobName.localeCompare(b.jobName);
      if (byJob !== 0) return byJob;
      return a.userName.localeCompare(b.userName);
    });
    const total = entries.reduce((s, r) => s + r.dailyLogCount, 0);
    const projectCount = new Set(entries.map((e) => e.jobId)).size;
    const title =
      kind.type === 'job-logs'
        ? `Daily logs (4 wk) · ${kind.jobName}`
        : kind.type === 'pm-logs'
          ? `Daily logs (4 wk) · ${kind.pm}`
          : 'Daily logs (4 wk · all jobs)';
    const subtitle =
      kind.type === 'pm-logs'
        ? `${total} logs on ${projectCount} projects · each row is one person’s logs on one project in the rolling 4-week window (scorecard total = sum of Logs)`
        : `${total} logs across ${entries.length} user×project rows in the rolling 4-week window`;
    return {
      title,
      subtitle,
      columns: [
        { key: 'jobName', label: 'Project' },
        { key: 'pm', label: 'PM' },
        { key: 'userName', label: 'Logged by' },
        { key: 'dailyLogCount', label: 'Logs', align: 'right', sum: 'number' },
        { key: 'lastLogDate', label: 'Last log' },
      ],
      rows: entries.map((row) => ({
        jobName: row.jobName,
        pm: pmByJob.get(String(row.jobId)) || '—',
        userName: row.userName || '—',
        dailyLogCount: row.dailyLogCount,
        lastLogDate: row.lastLogDate || '—',
      })),
    };
  }

  if (kind.type === 'wip-breakdown') {
    const list = [...projects].sort((a, b) => b.wip - a.wip || a.name.localeCompare(b.name));
    const totalWip = list.reduce((s, p) => s + p.wip, 0);
    const totalContract = list.reduce((s, p) => s + p.contractPrice, 0);
    const totalRevenue = list.reduce((s, p) => s + p.revenueToDate, 0);
    return {
      title: 'Total work in progress',
      subtitle: `WIP = revised contract − amount invoiced · ${formatCompactUsd(totalContract)} contract − ${formatCompactUsd(totalRevenue)} invoiced = ${formatCompactUsd(totalWip)}`,
      columns: [
        { key: 'name', label: 'Project' },
        { key: 'pm', label: 'PM' },
        { key: 'contract', label: 'Revised contract', align: 'right', sum: 'usd' },
        { key: 'revenue', label: 'Amount invoiced', align: 'right', sum: 'usd' },
        { key: 'wip', label: 'WIP remaining', align: 'right', sum: 'usd' },
        { key: 'calc', label: 'Calculation' },
      ],
      rows: list.map((p) => ({
        name: p.name,
        pm: p.pm,
        contract: p.contractPrice,
        revenue: p.revenueToDate,
        wip: p.wip,
        calc: `${formatCompactUsd(p.contractPrice)} − ${formatCompactUsd(p.revenueToDate)}`,
      })),
    };
  }

  if (kind.type === 'revenue-breakdown') {
    const list = [...projects].sort((a, b) => b.revenueToDate - a.revenueToDate || a.name.localeCompare(b.name));
    const totalRevenue = list.reduce((s, p) => s + p.revenueToDate, 0);
    const totalContract = list.reduce((s, p) => s + p.contractPrice, 0);
    return {
      title: 'Revenue to date',
      subtitle: `Sum of Buildertrend amount invoiced on these jobs · ${formatCompactUsd(totalRevenue)} of ${formatCompactUsd(totalContract)} revised contract`,
      columns: [
        { key: 'name', label: 'Project' },
        { key: 'pm', label: 'PM' },
        { key: 'contract', label: 'Revised contract', align: 'right', sum: 'usd' },
        { key: 'revenue', label: 'Amount invoiced', align: 'right', sum: 'usd' },
        { key: 'pct', label: '% invoiced', align: 'right' },
        { key: 'wip', label: 'WIP remaining', align: 'right', sum: 'usd' },
      ],
      rows: list.map((p) => ({
        name: p.name,
        pm: p.pm,
        contract: p.contractPrice,
        revenue: p.revenueToDate,
        pct: p.contractPrice ? `${Math.round((p.revenueToDate / p.contractPrice) * 100)}%` : '—',
        wip: p.wip,
      })),
    };
  }

  const list = projectsFor(projects, kind);
  const title =
    kind.type === 'phase-projects'
      ? `${kind.label} projects`
      : kind.type === 'pm-projects'
        ? `Projects · ${kind.pm}`
        : kind.label || 'Projects';
  return {
    title,
    subtitle: `${list.length} projects in this view`,
    columns: [
      { key: 'name', label: 'Project' },
      { key: 'pm', label: 'PM' },
      { key: 'phase', label: 'Phase' },
      { key: 'pendingSelections', label: 'Pending sel.', align: 'right', sum: 'number' },
      { key: 'pastDueTasks', label: 'Past due', align: 'right', sum: 'number' },
      { key: 'contract', label: 'Contract', align: 'right', sum: 'compactUsd' },
      { key: 'revenue', label: 'Revenue', align: 'right', sum: 'compactUsd' },
      { key: 'wip', label: 'WIP', align: 'right', sum: 'compactUsd' },
    ],
    rows: list.map((p) => ({
      name: p.name,
      pm: p.pm,
      phase: phaseLabel(p.phase),
      pendingSelections: p.pendingSelections,
      pastDueTasks: p.pastDueTasks,
      contract: p.contractPrice,
      revenue: p.revenueToDate,
      wip: p.wip,
    })),
  };
}

export function phaseDrill(phase: OwnerPhase, label: string): DrilldownKind {
  return { type: 'phase-projects', phase, label };
}
