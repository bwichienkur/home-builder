import { formatCompactUsd, formatUsd, phaseLabel } from '../buildertrend/format';
import { estimatedTimeMetricsForJob } from '../buildertrend/estimatedTimeMetrics';
import { CONTRACT_SENT_STAGE_ID, isPipedriveStageKey, pipedriveStageKey } from '../pipedrive/stageMap';
import type { OwnerPhase, ProjectSnapshot } from '../buildertrend/types';
import { overviewPhase } from '../buildertrend/summarize';
import { numericJobId } from './buildDrilldown';
import type { DrillDealRow, DrilldownKind, LiveDrilldown } from './drilldownTypes';

function openPipedriveDeals(detail: LiveDrilldown | null | undefined): DrillDealRow[] {
  if (!detail) return [];
  return Object.entries(detail.dealsByStage)
    .filter(([key]) => isPipedriveStageKey(key))
    .flatMap(([, rows]) => rows);
}

export type DrillColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** When set, values are numeric and a totals row sums this column. */
  sum?: 'usd' | 'compactUsd' | 'number';
  /** Positive = light red, negative = light green (schedule duration slip). */
  tone?: 'slip';
};

export type DrillRow = Record<string, string | number>;

export type ResolvedDrilldown = {
  title: string;
  subtitle: string;
  columns: DrillColumn[];
  rows: DrillRow[];
  /** Optional header metrics (e.g. estimated schedule durations on job slip). */
  metrics?: Array<{ id: string; label: string; days: number }>;
};

function projectsFor(projects: ProjectSnapshot[], kind: DrilldownKind): ProjectSnapshot[] {
  if (
    kind.type === 'pm-projects' ||
    kind.type === 'pm-logs' ||
    kind.type === 'pm-past-due' ||
    kind.type === 'pm-revenue'
  ) {
    return projects.filter((p) => p.pm === kind.pm);
  }
  if (kind.type === 'phase-projects') {
    return projects.filter((p) => overviewPhase(p.phase) === overviewPhase(kind.phase));
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

/** Optional cell background for tone columns (e.g. duration slip). */
export function drillCellClassName(col: DrillColumn, value: string | number | undefined): string | undefined {
  if (col.tone !== 'slip' || typeof value !== 'number' || !Number.isFinite(value) || value === 0) return undefined;
  return value > 0 ? 'dash-cell-highlight dash-slip-duration-pos' : 'dash-cell-highlight dash-slip-duration-neg';
}

function compareIsoDates(a: string, b: string) {
  const empty = (value: string) => !value || value === '—';
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1;
  if (empty(b)) return -1;
  return a.localeCompare(b);
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
          ? openPipedriveDeals(detail)
          : openPipedriveDeals(detail).filter(
              (d) => d.expectedCloseDate || d.stageName === 'Contract Sent',
            );
    if (kind.type === 'expected-signing' && deals.length === 0) {
      deals = detail?.dealsByStage[pipedriveStageKey(CONTRACT_SENT_STAGE_ID)] ?? [];
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
      const pmKey = kind.pm.trim().toLowerCase().replace(/\s+/g, ' ');
      entries = entries.filter(
        (l) => ids.has(String(l.jobId)) && l.userName.trim().toLowerCase().replace(/\s+/g, ' ') === pmKey,
      );
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
        ? `${total} logs by ${kind.pm} on ${projectCount} projects · scorecard counts only when Logged by = PM`
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

  if (kind.type === 'job-slip') {
    const entries = [...(detail?.baselineSlipByJobId?.[numericJobId(kind.jobId)] ?? [])].sort(
      (a, b) =>
        compareIsoDates(a.expectedEndDate, b.expectedEndDate) || a.title.localeCompare(b.title),
    );
    const project = projects.find((p) => p.id === kind.jobId);
    const metrics = project
      ? estimatedTimeMetricsForJob({
          firstScheduleStart: project.estFirstScheduleStart,
          permittingEndDate: project.estPermittingEnd,
          foundationStartDate: project.estFoundationStart,
          closingEndDate: project.estClosingEnd,
        })
      : [];
    const positive = entries.filter((r) => r.endDateSlip > 0).reduce((s, r) => s + r.endDateSlip, 0);
    const negative = entries.filter((r) => r.endDateSlip < 0).reduce((s, r) => s + r.endDateSlip, 0);
    return {
      title: `Schedule slip · ${kind.jobName}`,
      subtitle: `${entries.length} OCH MASTER 2026 schedule items · +${positive} / ${negative} end-date workdays (ad-hoc items excluded)`,
      metrics: metrics.length ? metrics : undefined,
      columns: [
        { key: 'title', label: 'Schedule item' },
        { key: 'endDateSlip', label: 'End date slip', align: 'right', sum: 'number' },
        { key: 'durationSlip', label: 'Duration slip', align: 'right', sum: 'number', tone: 'slip' },
        { key: 'expectedEndDate', label: 'Expected end' },
        { key: 'actualEndDate', label: 'Actual end' },
        { key: 'completed', label: 'Complete' },
      ],
      rows: entries.map((row) => ({
        title: row.title,
        endDateSlip: row.endDateSlip,
        durationSlip: row.durationSlip,
        expectedEndDate: row.expectedEndDate || '—',
        actualEndDate: row.actualEndDate || '—',
        completed: row.completed ? 'Yes' : 'No',
      })),
    };
  }

  if (kind.type === 'wip-breakdown') {
    const list = [...projects].sort((a, b) => b.wip - a.wip || a.name.localeCompare(b.name));
    const totalWip = list.reduce((s, p) => s + p.wip, 0);
    return {
      title: 'Total work in progress',
      subtitle: `Sum of revised contract values (original + change orders) · ${formatCompactUsd(totalWip)}`,
      columns: [
        { key: 'name', label: 'Project' },
        { key: 'pm', label: 'PM' },
        { key: 'wip', label: 'Revised contract', align: 'right', sum: 'usd' },
        { key: 'revenue', label: 'Amount invoiced', align: 'right', sum: 'usd' },
      ],
      rows: list.map((p) => ({
        name: p.name,
        pm: p.pm,
        wip: p.wip,
        revenue: p.revenueToDate,
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
        { key: 'wip', label: 'Revised contract', align: 'right', sum: 'usd' },
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

  if (kind.type === 'change-order-breakdown') {
    const list = projects
      .filter((p) => (p.changeOrderRevenue ?? 0) !== 0)
      .sort((a, b) => (b.changeOrderRevenue ?? 0) - (a.changeOrderRevenue ?? 0) || a.name.localeCompare(b.name));
    const totalRevenue = list.reduce((s, p) => s + (p.changeOrderRevenue ?? 0), 0);
    const totalProfit = list.reduce((s, p) => s + (p.changeOrderProfit ?? 0), 0);
    const profitPct = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0;
    return {
      title: 'Change order revenue',
      subtitle: `${list.length} open projects with change orders · ${formatCompactUsd(totalRevenue)} revenue · ${profitPct}% CO profit`,
      columns: [
        { key: 'name', label: 'Project' },
        { key: 'pm', label: 'PM' },
        { key: 'revenue', label: 'CO revenue', align: 'right', sum: 'usd' },
        { key: 'profit', label: 'CO profit', align: 'right', sum: 'usd' },
        { key: 'margin', label: 'CO profit %', align: 'right' },
      ],
      rows: list.map((p) => {
        const revenue = p.changeOrderRevenue ?? 0;
        const profit = p.changeOrderProfit ?? 0;
        return {
          name: p.name,
          pm: p.pm,
          revenue,
          profit,
          margin: revenue ? `${Math.round((profit / revenue) * 1000) / 10}%` : '—',
        };
      }),
    };
  }

  if (kind.type === 'pm-revenue') {
    const list = [...projectsFor(projects, kind)].sort(
      (a, b) => (b.revenueLast30d ?? 0) - (a.revenueLast30d ?? 0) || a.name.localeCompare(b.name),
    );
    const total = list.reduce((s, p) => s + (p.revenueLast30d ?? 0), 0);
    return {
      title: `Revenue (30d) · ${kind.pm}`,
      subtitle: `Trailing 30-day Buildertrend Cash flow Money In (draws) · ${formatCompactUsd(total)} · goal $500k/PM`,
      columns: [
        { key: 'name', label: 'Project' },
        { key: 'revenue30d', label: 'Revenue (30d)', align: 'right', sum: 'usd' },
        { key: 'revenue', label: 'Lifetime invoiced', align: 'right', sum: 'usd' },
        { key: 'wip', label: 'Revised contract', align: 'right', sum: 'usd' },
      ],
      rows: list.map((p) => ({
        name: p.name,
        revenue30d: p.revenueLast30d ?? 0,
        revenue: p.revenueToDate,
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
