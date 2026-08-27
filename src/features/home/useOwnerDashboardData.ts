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

function dashboardFromPull(pull: BuildertrendLivePull, filters: { status: JobStatus; dateRange: DateRangeId }): OwnerDashboard {
  const mapped = mapBuildertrendReports(pull.reports, { now: new Date(pull.pulledAt) });
  return summarizeOwnerDashboard({
    source: 'buildertrend',
    refreshedAt: pull.pulledAt,
    filters,
    ...mapped,
  });
}

function errorCode(reason: unknown): string | undefined {
  return (reason as { code?: string })?.code;
}

export type BtCookiePromptState = {
  reason?: string;
};

export function useOwnerDashboardData(status: JobStatus, dateRange: DateRangeId) {
  const [dash, setDash] = useState<OwnerDashboard | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [livePull, setLivePull] = useState<BuildertrendLivePull | null>(() => loadStoredLivePull());
  const [liveDetail, setLiveDetail] = useState<LiveDrilldown | null>(null);
  const [cookiePrompt, setCookiePrompt] = useState<BtCookiePromptState | null>(null);
  const cookieResolverRef = useRef<((cookie: string | null) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    const filters = { status, dateRange };
    if (livePull) {
      try {
        setDash(dashboardFromPull(livePull, filters));
        const built = buildLiveDrilldown({ buildertrend: livePull });
        const hasDeals = Object.values(built.dealsByStage).some((rows) => rows.length > 0);
        setLiveDetail({
          ...built,
          dealsByStage: hasDeals ? built.dealsByStage : LIVE_DRILLDOWN.dealsByStage,
        });
      } catch {
        clearStoredLivePull();
        setLivePull(null);
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
  }, [status, dateRange, livePull]);

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

      // No saved browser cookie yet — collect values, then fall back to server env if cancelled.
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

  const detail = liveDetail ?? LIVE_DRILLDOWN;

  return {
    dash,
    error,
    refreshing,
    livePull,
    detail,
    cookiePrompt,
    resolveCookiePrompt,
    onRefresh,
  };
}
