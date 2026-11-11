/**
 * Summarize / persist the last automated daily-pull outcome so the Owner Dashboard
 * can show why Buildertrend refresh time did not move.
 */

function summarizeBuildertrend(result) {
  if (!result || typeof result !== 'object') return { ok: false, error: 'No Buildertrend result' };
  if (result.skipped) {
    return {
      ok: false,
      skipped: true,
      reason: result.reason || 'BUILDERTREND_COOKIE not set',
    };
  }
  if (result.ok === false || result.error) {
    return {
      ok: false,
      error: result.error || 'Buildertrend pull failed',
      code: result.code,
    };
  }
  return {
    ok: true,
    pulledAt: result.pulledAt || null,
    enrichment: result.enrichment || null,
    authMethod: result.authMethod || null,
  };
}

function summarizePipedrive(result) {
  if (!result || typeof result !== 'object') return { ok: false, error: 'No Pipedrive result' };
  if (result.ok === false || result.error) {
    return { ok: false, error: result.error || 'Pipedrive pull failed' };
  }
  return {
    ok: true,
    pulledAt: result.pulledAt || null,
  };
}

/**
 * @param {{ pipedrive?: unknown, buildertrend?: unknown, history?: unknown }} results
 */
export function buildCronStatusPayload(results) {
  const buildertrend = summarizeBuildertrend(results?.buildertrend);
  const pipedrive = summarizePipedrive(results?.pipedrive);
  const history =
    results?.history && typeof results.history === 'object'
      ? {
          saved: Boolean(results.history.saved ?? results.history.backend),
          reason: results.history.reason,
          backend: results.history.backend,
        }
      : null;

  return {
    pulledAt: new Date().toISOString(),
    kind: 'cron-status',
    buildertrend,
    pipedrive,
    history,
    /** True when both BT and PD pulls succeeded (or PD ok and BT ok). */
    ok: Boolean(buildertrend.ok && pipedrive.ok),
  };
}
