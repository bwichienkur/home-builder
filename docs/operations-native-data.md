# Native Operations data

In-app CRUD for Owner Dashboard datapoints (jobs, daily logs, tasks, selections, deals, people). There is **no** write-back to Buildertrend or Pipedrive.

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
| `/ops/jobs` | Job list + edit |
| `/ops/jobs/:jobId` | Per-job logs / tasks / selections tabs |
| `/ops/tasks` | **All** tasks across jobs |
| `/ops/logs` | **All** daily logs across jobs |
| `/ops/selections` | **All** selections across jobs |
| `/ops/deals` | Pipeline deals |
| `/ops/people` | PMs / owners |

## Seed / reset (full BT row import)

- First load with an empty store: `seedOpsFromLiveSnapshot()` copies `LIVE_JOBS` and imports **`LIVE_DRILLDOWN`** rows:
  - pending selections (full titles/categories/deadlines)
  - past-due tasks (full titles/assignees/due dates)
  - Pipedrive open deals (mapped into Ops stages)
  - daily logs expanded from BT user×job aggregates in the rolling window
- **Reset from snapshot** on the hub replaces the store with a fresh seed.

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
