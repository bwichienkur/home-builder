import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  archiveOpsDeal,
  archiveOpsJob,
  clearOpsStore,
  deleteOpsCashflow,
  deleteOpsLog,
  deleteOpsScheduleItem,
  deleteOpsSelection,
  deleteOpsTask,
  ensureOpsSeeded,
  hydrateOpsFromRemote,
  isOpsHttpProvider,
  resetOpsFromSnapshot,
  upsertOpsCashflow,
  upsertOpsDeal,
  upsertOpsJob,
  upsertOpsLog,
  upsertOpsPerson,
  upsertOpsScheduleItem,
  upsertOpsSelection,
  upsertOpsTask,
  type OpsCashflowEntry,
  type OpsDailyLog,
  type OpsDeal,
  type OpsJob,
  type OpsPerson,
  type OpsScheduleItem,
  type OpsSelection,
  type OpsSnapshot,
  type OpsTask,
} from '../../lib/operations';

/** Reactive handle over the Operations store (localStorage and/or shared HTTP API). */
export function useOpsStore() {
  const [tick, setTick] = useState(0);
  const [hydrating, setHydrating] = useState(isOpsHttpProvider());
  const [remoteError, setRemoteError] = useState('');

  useEffect(() => {
    if (!isOpsHttpProvider()) return;
    let cancelled = false;
    setHydrating(true);
    void hydrateOpsFromRemote()
      .then(() => {
        if (!cancelled) {
          setRemoteError('');
          setTick((n) => n + 1);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setRemoteError(err instanceof Error ? err.message : 'Remote ops load failed');
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const snapshot: OpsSnapshot = useMemo(() => {
    void tick;
    return ensureOpsSeeded();
  }, [tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  const jobName = useCallback(
    (jobId: string) => snapshot.jobs.find((j) => j.id === jobId)?.name || jobId,
    [snapshot.jobs],
  );

  return {
    snapshot,
    reload,
    hydrating,
    remoteError,
    http: isOpsHttpProvider(),
    jobs: snapshot.jobs.filter((j) => !j.archived),
    allJobs: snapshot.jobs,
    logs: snapshot.logs,
    tasks: snapshot.tasks,
    selections: snapshot.selections,
    deals: snapshot.deals.filter((d) => !d.archived),
    people: snapshot.people,
    scheduleItems: snapshot.scheduleItems ?? [],
    cashflow: snapshot.cashflow ?? [],
    jobName,
    saveJob: (job: OpsJob) => {
      upsertOpsJob(job);
      reload();
    },
    archiveJob: (id: string) => {
      archiveOpsJob(id);
      reload();
    },
    saveLog: (log: OpsDailyLog) => {
      upsertOpsLog(log);
      reload();
    },
    removeLog: (id: string) => {
      deleteOpsLog(id);
      reload();
    },
    saveTask: (task: OpsTask) => {
      upsertOpsTask(task);
      reload();
    },
    removeTask: (id: string) => {
      deleteOpsTask(id);
      reload();
    },
    saveSelection: (row: OpsSelection) => {
      upsertOpsSelection(row);
      reload();
    },
    removeSelection: (id: string) => {
      deleteOpsSelection(id);
      reload();
    },
    saveDeal: (deal: OpsDeal) => {
      upsertOpsDeal(deal);
      reload();
    },
    archiveDeal: (id: string) => {
      archiveOpsDeal(id);
      reload();
    },
    savePerson: (person: OpsPerson) => {
      upsertOpsPerson(person);
      reload();
    },
    saveScheduleItem: (row: OpsScheduleItem) => {
      upsertOpsScheduleItem(row);
      reload();
    },
    removeScheduleItem: (id: string) => {
      deleteOpsScheduleItem(id);
      reload();
    },
    saveCashflow: (row: OpsCashflowEntry) => {
      upsertOpsCashflow(row);
      reload();
    },
    removeCashflow: (id: string) => {
      deleteOpsCashflow(id);
      reload();
    },
    resetFromSnapshot: () => {
      resetOpsFromSnapshot();
      reload();
    },
    clearAll: () => {
      clearOpsStore();
      reload();
    },
  };
}
