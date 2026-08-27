import { useEffect, useState } from 'react';
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

export function useOwnerDashboardData(status: JobStatus, dateRange: DateRangeId) {
  const [dash, setDash] = useState<OwnerDashboard | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [livePull, setLivePull] = useState<BuildertrendLivePull | null>(() => loadStoredLivePull());
  const [liveDetail, setLiveDetail] = useState<LiveDrilldown | null>(null);

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

  const onRefresh = async () => {
    setRefreshing(true);
    setError('');
    try {
      const pasted = window
        .prompt(
          'Paste Buildertrend cookie header from your logged-in Buildertrend tab.\n\n' +
            'Required cookies: .AspNet.Auth0, ASP.NET_SessionId, GAESA\n' +
            'Format: name1=value1; name2=value2; ...\n\n' +
            'Leave blank / Cancel to try the server cookie (if configured).',
        )
        ?.trim();

      const pull = await refreshBuildertrendPull(pasted || undefined);
      setLivePull(pull);
      setError('');
    } catch (reason: unknown) {
      const err = reason instanceof Error ? reason : null;
      const code = (reason as { code?: string })?.code;
      const authFailure = code === 'credentials_missing' || code === 'login_failed';

      // If the first attempt used no pasted cookie (or it failed), offer one more paste.
      if (authFailure) {
        const retryPaste = window
          .prompt(
            (err?.message ? `${err.message}\n\n` : '') +
              'Paste a fresh Buildertrend cookie header and try again:\n\n' +
              'Required: .AspNet.Auth0; ASP.NET_SessionId; GAESA=…\n' +
              'Format: name1=value1; name2=value2; ...',
          )
          ?.trim();
        if (retryPaste) {
          try {
            const pull = await refreshBuildertrendPull(retryPaste);
            setLivePull(pull);
            setError('');
            return;
          } catch (retryReason: unknown) {
            setError(retryReason instanceof Error ? retryReason.message : 'Buildertrend refresh failed.');
            return;
          }
        }
      }
      setError(err ? err.message : 'Buildertrend refresh failed.');
    } finally {
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
    onRefresh,
  };
}
