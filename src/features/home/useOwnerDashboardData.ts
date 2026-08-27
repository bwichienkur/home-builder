import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearStoredLivePull,
  fetchCachedBuildertrendPull,
  getOwnerDashboardProvider,
  loadStoredLivePull,
  mapBuildertrendReports,
  mockOwnerDashboardProvider,
  refreshBuildertrendPull,
  storeLivePull,
  summarizeOwnerDashboard,
} from '../../lib/buildertrend';
import type { BuildertrendLivePull } from '../../lib/buildertrend';
import {
  LIVE_JOBS,
  LIVE_PIPELINE,
  LIVE_PIPEDRIVE_AT,
  LIVE_PROJECTED_MARGIN_PCT,
  LIVE_ROLLING_REVENUE_12MO,
  LIVE_SALES_PERFORMANCE,
  LIVE_SNAPSHOT_AT,
  LIVE_TARGET_MARGIN_PCT,
  LIVE_TIME_METRICS,
  LIVE_WEIGHTED_PIPELINE,
} from '../../lib/buildertrend/liveSnapshot';
import type { DateRangeId, JobStatus, OwnerDashboard } from '../../lib/buildertrend/types';
import {
  clearStoredBtCookie,
  isAuthRefreshFailure,
  loadStoredBtCookie,
  storeBtCookie,
} from '../../lib/buildertrend/cookieSession';
import { LIVE_DRILLDOWN } from '../../lib/buildertrend/liveDrilldown';
import { buildLiveDrilldown } from '../../lib/dashboard/buildDrilldown';
import type { LiveDrilldown } from '../../lib/dashboard/drilldownTypes';
import { mapPipedriveDeals, mergeSalesFromPipedrive } from '../../lib/pipedrive/mapDeals';
import {
  fetchCachedPipedrivePull,
  loadStoredPipedrivePull,
  refreshPipedrivePull,
  storePipedrivePull,
  type PipedriveLivePull,
} from '../../lib/pipedrive/refreshClient';

function errorCode(reason: unknown): string | undefined {
  return (reason as { code?: string })?.code;
}

function dashboardFromLive(
  bt: BuildertrendLivePull,
  pd: PipedriveLivePull | null,
  filters: { status: JobStatus; dateRange: DateRangeId },
): OwnerDashboard {
  let mapped = mapBuildertrendReports(bt.reports, { now: new Date(bt.pulledAt) });
  if (pd) {
    mapped = mergeSalesFromPipedrive(
      mapped,
      mapPipedriveDeals(pd.reports, { now: new Date(pd.pulledAt) }),
    );
  }
  return summarizeOwnerDashboard({
    source: 'buildertrend',
    refreshedAt: bt.pulledAt,
    filters,
    ...mapped,
  });
}

function dashboardFromSnapshotWithPd(
  pd: PipedriveLivePull,
  filters: { status: JobStatus; dateRange: DateRangeId },
): OwnerDashboard {
  const mapped = mergeSalesFromPipedrive(
    {
      jobs: LIVE_JOBS,
      pipeline: LIVE_PIPELINE,
      salesPerformance: LIVE_SALES_PERFORMANCE,
      timeMetrics: LIVE_TIME_METRICS,
      targetMarginPct: LIVE_TARGET_MARGIN_PCT,
      projectedMarginPct: LIVE_PROJECTED_MARGIN_PCT,
      rollingRevenue12Mo: LIVE_ROLLING_REVENUE_12MO,
      weightedPipeline: LIVE_WEIGHTED_PIPELINE,
    },
    mapPipedriveDeals(pd.reports, { now: new Date(pd.pulledAt) }),
  );
  return summarizeOwnerDashboard({
    source: 'buildertrend',
    refreshedAt: LIVE_SNAPSHOT_AT,
    filters,
    ...mapped,
  });
}

function detailFromLive(bt: BuildertrendLivePull | null, pd: PipedriveLivePull | null): LiveDrilldown {
  const built = buildLiveDrilldown({
    buildertrend: bt ?? { pulledAt: LIVE_SNAPSHOT_AT, reports: {} },
    pipedrive: pd,
  });
  return {
    ...LIVE_DRILLDOWN,
    ...(bt
      ? {
          selectionsByJobId: built.selectionsByJobId,
          pastDueByJobId: built.pastDueByJobId,
          logsByJobId: built.logsByJobId,
          baselineSlipByJobId: built.baselineSlipByJobId,
        }
      : {}),
    ...(pd ? { dealsByStage: built.dealsByStage } : {}),
    generatedAt: built.generatedAt,
  };
}

export type BtCookiePromptState = {
  reason?: string;
};

export function useOwnerDashboardData(status: JobStatus, dateRange: DateRangeId) {
  const [dash, setDash] = useState<OwnerDashboard | null>(null);
  const [error, setError] = useState('');
  const [pipedriveError, setPipedriveError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingPipedrive, setRefreshingPipedrive] = useState(false);
  const [livePull, setLivePull] = useState<BuildertrendLivePull | null>(() => loadStoredLivePull());
  const [livePdPull, setLivePdPull] = useState<PipedriveLivePull | null>(() => loadStoredPipedrivePull());
  const [liveDetail, setLiveDetail] = useState<LiveDrilldown | null>(null);
  const [cookiePrompt, setCookiePrompt] = useState<BtCookiePromptState | null>(null);
  const cookieResolverRef = useRef<((cookie: string | null) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    const filters = { status, dateRange };

    if (livePull) {
      try {
        setDash(dashboardFromLive(livePull, livePdPull, filters));
        setLiveDetail(detailFromLive(livePull, livePdPull));
        setError('');
      } catch {
        clearStoredLivePull();
        setLivePull(null);
      }
      return () => {
        cancelled = true;
      };
    }

    if (livePdPull) {
      try {
        setDash(dashboardFromSnapshotWithPd(livePdPull, filters));
        setLiveDetail(detailFromLive(null, livePdPull));
        setError('');
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : 'Dashboard could not load.');
      }
      return () => {
        cancelled = true;
      };
    }

    const provider = getOwnerDashboardProvider();
    void provider.getDashboard(filters).then(
      (next) => {
        if (!cancelled) {
          setDash(next);
          setError('');
          setLiveDetail(null);
        }
      },
      async (reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : 'Dashboard could not load.');
        const fallback = await mockOwnerDashboardProvider.getDashboard(filters);
        if (!cancelled) setDash(fallback);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [status, dateRange, livePull, livePdPull]);

  useEffect(() => {
    let cancelled = false;
    void fetchCachedBuildertrendPull().then((cached) => {
      if (cancelled || !cached) return;
      setLivePull((prev) => {
        if (prev && prev.pulledAt >= cached.pulledAt) return prev;
        storeLivePull(cached);
        return cached;
      });
    });
    void fetchCachedPipedrivePull().then((cached) => {
      if (cancelled || !cached) return;
      setLivePdPull((prev) => {
        if (prev && prev.pulledAt >= cached.pulledAt) return prev;
        storePipedrivePull(cached);
        return cached;
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      cookieResolverRef.current?.(null);
      cookieResolverRef.current = null;
    };
  }, []);

  const requestCookieValues = useCallback((reason?: string) => {
    cookieResolverRef.current?.(null);
    return new Promise<string | null>((resolve) => {
      cookieResolverRef.current = resolve;
      setCookiePrompt({ reason });
    });
  }, []);

  const resolveCookiePrompt = useCallback((cookie: string | null) => {
    const resolve = cookieResolverRef.current;
    cookieResolverRef.current = null;
    setCookiePrompt(null);
    resolve?.(cookie);
  }, []);

  const onRefresh = async () => {
    setError('');

    const applyPull = (pull: BuildertrendLivePull) => {
      setLivePull(pull);
      setError('');
    };

    const pullWithCookie = async (cookie: string) => {
      setRefreshing(true);
      try {
        const pull = await refreshBuildertrendPull(cookie);
        storeBtCookie(cookie);
        applyPull(pull);
      } finally {
        setRefreshing(false);
      }
    };

    const collectAndPull = async (reason?: string) => {
      const cookie = await requestCookieValues(reason);
      if (!cookie) {
        setError(reason || 'Refresh cancelled — paste the three Buildertrend cookie values to continue.');
        return false;
      }
      await pullWithCookie(cookie);
      return true;
    };

    try {
      const stored = loadStoredBtCookie();
      if (stored) {
        try {
          await pullWithCookie(stored);
          return;
        } catch (reason: unknown) {
          if (!isAuthRefreshFailure(errorCode(reason))) {
            setError(reason instanceof Error ? reason.message : 'Buildertrend refresh failed.');
            return;
          }
          clearStoredBtCookie();
          await collectAndPull(
            'Saved Buildertrend cookies expired or were rejected. Enter fresh values from your logged-in tab.',
          );
          return;
        }
      }

      const cookie = await requestCookieValues(
        'Enter Buildertrend cookie values once. They are saved in this browser and reused until they stop working.',
      );
      if (cookie) {
        await pullWithCookie(cookie);
        return;
      }

      setRefreshing(true);
      try {
        const pull = await refreshBuildertrendPull();
        applyPull(pull);
      } catch (reason: unknown) {
        if (isAuthRefreshFailure(errorCode(reason))) {
          setRefreshing(false);
          await collectAndPull(
            reason instanceof Error
              ? reason.message
              : 'Server has no Buildertrend cookie. Paste values from your logged-in tab.',
          );
          return;
        }
        setError(reason instanceof Error ? reason.message : 'Buildertrend refresh failed.');
      } finally {
        setRefreshing(false);
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Buildertrend refresh failed.');
      setRefreshing(false);
    }
  };

  const onRefreshPipedrive = async () => {
    setPipedriveError('');
    setRefreshingPipedrive(true);
    try {
      const pull = await refreshPipedrivePull();
      setLivePdPull(pull);
      setPipedriveError('');
    } catch (reason: unknown) {
      setPipedriveError(reason instanceof Error ? reason.message : 'Pipedrive refresh failed.');
    } finally {
      setRefreshingPipedrive(false);
    }
  };

  const detail = liveDetail ?? LIVE_DRILLDOWN;
  const pipedriveRefreshedAt = livePdPull?.pulledAt || LIVE_PIPEDRIVE_AT || LIVE_SNAPSHOT_AT;

  return {
    dash,
    error,
    pipedriveError,
    refreshing,
    refreshingPipedrive,
    livePull,
    livePdPull,
    pipedriveRefreshedAt,
    detail,
    cookiePrompt,
    resolveCookiePrompt,
    onRefresh,
    onRefreshPipedrive,
  };
}
