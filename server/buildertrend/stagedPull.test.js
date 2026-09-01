import { describe, expect, it } from 'vitest';
import { toRefreshResponse } from './stagedPull.js';

describe('toRefreshResponse', () => {
  it('strips _pullState and includes continue/progress', () => {
    const response = toRefreshResponse({
      pulledAt: '2026-09-01T12:00:00.000Z',
      authMethod: 'cookie',
      enrichment: 'partial',
      readonly: true,
      serverless: true,
      reports: { wip: [], tasks: { tasks: [] } },
      _pullState: { jobIds: [1, 2], enrichedJobIds: [] },
      continue: true,
      progress: { done: 0, total: 2 },
    });
    expect(response.ok).toBe(true);
    expect(response.continue).toBe(true);
    expect(response.progress).toEqual({ done: 0, total: 2 });
    expect(response._pullState).toBeUndefined();
    expect(response.enrichment).toBe('partial');
  });
});
