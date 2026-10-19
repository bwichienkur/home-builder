import { describe, expect, it } from 'vitest';
import { buildCronStatusPayload } from './dashboardCronStatus.js';

describe('buildCronStatusPayload', () => {
  it('marks overall failure when Buildertrend cookie is missing', () => {
    const status = buildCronStatusPayload({
      pipedrive: { ok: true, pulledAt: '2026-10-19T13:31:00.000Z' },
      buildertrend: { ok: false, skipped: true, reason: 'BUILDERTREND_COOKIE not set' },
      history: { saved: true, backend: 'postgres' },
    });
    expect(status.ok).toBe(false);
    expect(status.buildertrend).toMatchObject({
      ok: false,
      skipped: true,
      reason: 'BUILDERTREND_COOKIE not set',
    });
    expect(status.pipedrive.ok).toBe(true);
  });

  it('marks overall success when both pulls succeed', () => {
    const status = buildCronStatusPayload({
      pipedrive: { ok: true, pulledAt: '2026-10-19T13:31:00.000Z' },
      buildertrend: {
        ok: true,
        pulledAt: '2026-10-19T13:31:05.000Z',
        enrichment: 'core',
      },
      history: { saved: true },
    });
    expect(status.ok).toBe(true);
    expect(status.buildertrend.pulledAt).toBe('2026-10-19T13:31:05.000Z');
  });
});
