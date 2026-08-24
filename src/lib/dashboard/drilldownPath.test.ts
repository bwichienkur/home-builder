import { pipedriveStageKey } from '../pipedrive/stageMap';
import { describe, expect, it } from 'vitest';
import { drilldownHref, parseDrilldownFilters, parseDrilldownKind } from './drilldownPath';

describe('drilldownPath', () => {
  it('round-trips pipeline and project kinds', () => {
    const href = drilldownHref(
      { type: 'pipeline-stage', stageId: pipedriveStageKey(1), label: 'First Contact' },
      { status: 'open', dateRange: 'ytd' },
    );
    const params = new URLSearchParams(href.split('?')[1]);
    expect(parseDrilldownKind(params)).toEqual({
      type: 'pipeline-stage',
      stageId: pipedriveStageKey(1),
      label: 'First Contact',
    });
    expect(parseDrilldownFilters(params)).toEqual({ status: 'open', dateRange: 'ytd' });
  });

  it('round-trips job and pm kinds', () => {
    const job = drilldownHref({ type: 'job-selections', jobId: 'bt-9', jobName: 'Bennett' });
    expect(parseDrilldownKind(new URLSearchParams(job.split('?')[1]))).toEqual({
      type: 'job-selections',
      jobId: 'bt-9',
      jobName: 'Bennett',
    });
    const pm = drilldownHref({ type: 'pm-logs', pm: 'James' });
    expect(parseDrilldownKind(new URLSearchParams(pm.split('?')[1]))).toEqual({ type: 'pm-logs', pm: 'James' });
  });
});
