import { useCallback, useMemo, useState } from 'react';
import {
  archiveOpsDeal,
  archiveOpsJob,
  clearOpsStore,
  deleteOpsLog,
  deleteOpsSelection,
  deleteOpsTask,
  ensureOpsSeeded,
  resetOpsFromSnapshot,
  upsertOpsDeal,
  upsertOpsJob,
  upsertOpsLog,
  upsertOpsPerson,
  upsertOpsSelection,
  upsertOpsTask,
  type OpsDailyLog,
  type OpsDeal,
  type OpsJob,
  type OpsPerson,
  type OpsSelection,
  type OpsSnapshot,
  type OpsTask,
} from '../../lib/operations';

/** Reactive handle over the localStorage Operations store. */
export function useOpsStore() {
  const [tick, setTick] = useState(0);
  const snapshot: OpsSnapshot = useMemo(() => {
    void tick;
    return ensureOpsSeeded();
  }, [tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  return {
    snapshot,
    reload,
    jobs: snapshot.jobs.filter((j) => !j.archived),
    allJobs: snapshot.jobs,
    logs: snapshot.logs,
    tasks: snapshot.tasks,
    selections: snapshot.selections,
    deals: snapshot.deals.filter((d) => !d.archived),
    people: snapshot.people,
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
