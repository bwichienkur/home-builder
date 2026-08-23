import type { DateRangeId, JobStatus, OwnerPhase } from '../buildertrend/types';
import type { DrilldownKind } from './drilldownTypes';

const PHASES: OwnerPhase[] = ['design', 'permitting', 'construction', 'closeout'];
const STATUSES: JobStatus[] = ['open', 'closed', 'warranty'];
const RANGES: DateRangeId[] = ['all', '30d', 'ytd', '12mo'];

export type DrilldownFilters = {
  status: JobStatus;
  dateRange: DateRangeId;
};

function setOpt(params: URLSearchParams, key: string, value: string | undefined) {
  if (value != null && value !== '') params.set(key, value);
}

/** Build `/dashboard/detail?…` for a drill-down kind (+ optional dashboard filters). */
export function drilldownHref(kind: DrilldownKind, filters?: Partial<DrilldownFilters>): string {
  const params = new URLSearchParams();
  params.set('type', kind.type);
  switch (kind.type) {
    case 'pipeline-stage':
      params.set('stageId', kind.stageId);
      setOpt(params, 'label', kind.label);
      break;
    case 'job-selections':
    case 'job-past-due':
    case 'job-logs':
      params.set('jobId', kind.jobId);
      setOpt(params, 'jobName', kind.jobName);
      break;
    case 'pm-projects':
    case 'pm-logs':
    case 'pm-past-due':
      params.set('pm', kind.pm);
      break;
    case 'phase-projects':
      params.set('phase', kind.phase);
      setOpt(params, 'label', kind.label);
      break;
    case 'open-deals':
    case 'all-projects':
      setOpt(params, 'label', kind.label);
      break;
    default:
      break;
  }
  if (filters?.status) params.set('status', filters.status);
  if (filters?.dateRange) params.set('dateRange', filters.dateRange);
  return `/dashboard/detail?${params.toString()}`;
}

export function parseDrilldownKind(params: URLSearchParams): DrilldownKind | null {
  const type = params.get('type');
  if (!type) return null;
  const label = params.get('label') || undefined;
  const jobId = params.get('jobId') || '';
  const jobName = params.get('jobName') || jobId;
  const pm = params.get('pm') || '';
  const stageId = params.get('stageId') || '';
  const phaseRaw = params.get('phase') || '';

  switch (type) {
    case 'pipeline-stage':
      if (!stageId) return null;
      return { type, stageId, label: label || stageId };
    case 'job-selections':
    case 'job-past-due':
    case 'job-logs':
      if (!jobId) return null;
      return { type, jobId, jobName };
    case 'pm-projects':
    case 'pm-logs':
    case 'pm-past-due':
      if (!pm) return null;
      return { type, pm };
    case 'phase-projects': {
      if (!PHASES.includes(phaseRaw as OwnerPhase)) return null;
      return { type, phase: phaseRaw as OwnerPhase, label: label || phaseRaw };
    }
    case 'all-pending-selections':
    case 'all-past-due':
    case 'all-logs':
    case 'expected-signing':
      return { type };
    case 'open-deals':
    case 'all-projects':
      return { type, label };
    default:
      return null;
  }
}

export function parseDrilldownFilters(params: URLSearchParams): DrilldownFilters {
  const statusRaw = params.get('status') || 'open';
  const rangeRaw = params.get('dateRange') || 'all';
  return {
    status: STATUSES.includes(statusRaw as JobStatus) ? (statusRaw as JobStatus) : 'open',
    dateRange: RANGES.includes(rangeRaw as DateRangeId) ? (rangeRaw as DateRangeId) : 'all',
  };
}
