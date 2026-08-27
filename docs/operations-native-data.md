# Native Operations data

In-app CRUD for Owner Dashboard datapoints (jobs, daily logs, tasks, selections, deals, people). Data lives in browser `localStorage` (`mahnikka-ops-v1`). There is **no** write-back to Buildertrend or Pipedrive.

## Default behavior (unchanged)

`VITE_BUILDERTREND_PROVIDER` defaults to **`snapshot`**. Home / Owner Dashboard keep using the baked BT snapshot (and optional live BT/PD refresh). Operations pages under `/ops` can still be edited; they do not drive the dashboard until you flip the flag.

## Enable native dashboard

```bash
VITE_BUILDERTREND_PROVIDER=native
```

Then restart Vite. Home loads `nativeOwnerDashboardProvider`, which seeds from the live snapshot on first open and maps the store through `summarizeOwnerDashboard`. Live BT/PD pull + cookie refresh are skipped in this mode.

## UI

| Path | Purpose |
|------|---------|
| `/ops` | Hub, counts, reset from snapshot / clear store |
| `/ops/jobs` | Job list + edit |
| `/ops/jobs/:jobId` | Logs / tasks / selections tabs |
| `/ops/deals` | Pipeline deals |
| `/ops/people` | PMs / owners |

## Seed / reset

- First load with an empty store: `ensureOpsSeeded()` copies `LIVE_JOBS` + synthetic child rows from snapshot counts.
- **Reset from snapshot** on the hub replaces the store with a fresh seed.
