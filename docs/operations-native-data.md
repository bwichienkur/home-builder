# Native Operations data

In-app CRUD for Owner Dashboard datapoints (jobs, daily logs, tasks, selections, deals, people, schedule slip, cashflow, schedule milestones, time metrics) plus **Operations Reports** that mirror Buildertrend / Pipedrive report views. There is **no** write-back to Buildertrend or Pipedrive.

## Default behavior (unchanged)

`VITE_BUILDERTREND_PROVIDER` defaults to **`snapshot`**. Home / Owner Dashboard keep using the baked BT snapshot (and optional live BT/PD refresh). Operations pages under `/ops` can still be edited; they do not drive the dashboard until you flip the flag.

## Enable native dashboard

```bash
VITE_BUILDERTREND_PROVIDER=native
```

Then restart Vite. Home loads `nativeOwnerDashboardProvider`. Live BT/PD pull + cookie refresh are skipped in this mode.

## UI

| Path | Purpose |
|------|---------|
| `/ops` | Hub, counts, reset from snapshot / clear store |
| `/ops/jobs` | Job list + edit (financials, slip, **schedule milestones**, lifetime log count) |
| `/ops/jobs/:jobId` | Per-job **logs / tasks / selections / schedule / cashflow** tabs |
| `/ops/tasks` | **All** tasks across jobs (past-due seed + any manual tasks) |
| `/ops/logs` | **All** daily logs across jobs |
| `/ops/selections` | **All** selections across jobs |
| `/ops/deals` | Pipeline deals |
| `/ops/people` | PMs / owners |
| `/ops/reports` | Report hub (WIP, CO, cashflow, tasks, selections, logs, schedule slip, milestones, time metrics, pipeline) |
| `/ops/reports/:reportId` | Individual report grid (+ edit for cashflow / schedule slip / time metrics) |

## Seed / reset (BT bake import)

- First load with an empty store: `seedOpsFromLiveSnapshot()` copies `LIVE_JOBS` and imports:
  - **`LIVE_OPS_IMPORT`** (Ops-only bake from the full local BT cache): **all incomplete tasks** (+ optional start dates / truncated descriptions)
  - **`LIVE_DRILLDOWN`** for selections, deals, baseline slip (same as Home drilldown; unchanged)
  - jobs with WIP/CO/slip + **Gantt milestone dates** + **lifetime daily log totals**
  - daily logs expanded from BT user×job **rolling-window aggregates** (entry **bodies are not in the BT reports API**)
  - cashflow Money In stubs from each job’s trailing-30d revenue
  - portfolio **time metrics** + sales-performance seed from `LIVE_TIME_METRICS` / `LIVE_SALES_PERFORMANCE`
- If `LIVE_OPS_IMPORT` is missing, tasks fall back to `LIVE_DRILLDOWN.pastDueByJobId` (past-due only).
- **Reset from snapshot** on the hub replaces the store with a fresh seed.

### Home snapshot isolation

| Artifact | Used by | Notes |
|----------|---------|-------|
| `LIVE_JOBS` / `LIVE_*` in `liveSnapshot.ts` | Home dashboard | Unchanged |
| `LIVE_DRILLDOWN` | Home drilldowns (+ Ops fallback) | Still past-due-only tasks + log aggregates |
| `LIVE_OPS_IMPORT` (`liveOpsImport.json`) | Operations seed only | All incomplete tasks; not imported by Home |

Regenerate both Home bake and Ops import from the same cache (Home files stay past-due/compact):

```bash
BUILDERTREND_COOKIE=… npm run buildertrend:pull
npm run buildertrend:update-snapshot
```

Then **Reset from snapshot** on the Ops hub (or clear Neon ops store) to load the richer task list.

Live BT/PD refresh on Home **does not** update the Ops store, and Vercel refresh stays slim (does not carry full incomplete tasks).

### Daily log bodies

BT Reporting only exposes **counts** (`user-daily-logs`, `daily-log-creation-by-job`). There is no wired per-entry list/detail API in this repo yet, so Ops cannot auto-import log notes/bodies. `LIVE_OPS_IMPORT.meta.logBodiesUnavailable` is always `true` until a new probe lands.

## Dashboard mapping (native)

`mapOpsSnapshotToDashboardInputs` builds Owner Dashboard inputs from Ops:

| Dashboard need | Ops source |
|----------------|------------|
| Past-due / pending selections | Tasks + selections entities |
| Rolling 4-week logs / PM attendance | Log rows in window |
| Lifetime daily log % | `OpsJob.lifetimeDailyLogCount` (not just row count) |
| Contract/Permit/Slab → Close | Job milestones; portfolio averages from closed/warranty jobs or settings `timeMetrics` |
| Revenue last 30d | Cashflow Money In in window, else job field |
| Sales performance bars | Recomputed from WIP + deals (backlog / closings / signing) |

## Reports vs Buildertrend

| Ops report | Replaces |
|------------|----------|
| WIP & contracts | BT Work in progress / Profitability |
| Change order profit | BT Change order profit |
| Cash flow (Money In) | BT Cash flow |
| Past-due tasks | BT Tasks (past-due slice) |
| Pending selections | BT Selections |
| Daily logs | BT User daily logs |
| Baseline schedule slip | BT Baseline vs actual duration |
| Job schedule milestones | BT Gantt milestone dates |
| Average time metrics | BT Closed/Warranty Contract/Permit/Slab → Close |
| Sales pipeline | Pipedrive Sales pipeline (BT Lead Opportunities fallback) |

## Known bake gaps (need richer BT pull to auto-import)

- ~~Full incomplete (non-past-due) task list~~ — **Ops** now seeds all incomplete via `LIVE_OPS_IMPORT` (Home drilldown still past-due-only)
- Individual daily-log entry bodies / lifetime log rows — bake has aggregates + lifetime counts only (no BT reports API for bodies yet)
- Closed/warranty jobs as Ops rows — only open jobs in `LIVE_JOBS`; time metrics are seeded as portfolio averages
- Full cashflow Money Out ledger

## Storage (shared vs browser)

| Mode | Env | Backend |
|------|-----|---------|
| local (Vite default) | unset / `VITE_OPS_PROVIDER=local` | Browser `localStorage` (`mahnikka-ops-v1`) — per device |
| http (production default) | Production builds default to http; or set `VITE_OPS_PROVIDER=http` | Shared **Neon Postgres** via `DATABASE_URL` on Vercel (`GET/PUT /api/ops`). Local `npm run server` uses Postgres when `DATABASE_URL` is set, else `data/ops-store.json`. |

### Vercel + Neon

1. Add the [Neon integration](https://vercel.com/integrations/neon) to the project (injects `DATABASE_URL`).
2. Redeploy Production so serverless `/api/ops` sees the var.
3. Open **Operations** in the deployed app — production builds use shared HTTP ops automatically. The first load seeds from the BT drilldown bake into Neon (`ops_snapshots` table is created on first request).

Schema: `server/db/003_ops_snapshot.sql` (`ops_snapshots` jsonb).
