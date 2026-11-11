# Owner Dashboard — daily data refresh

## What runs automatically

`vercel.json` schedules **GET/POST `/api/dashboard`** daily at **13:00 UTC** (~8:00 AM US Central).
(Compat rewrites: `/api/dashboard/daily-pull`, `/api/dashboard/kpi-history`.)

That endpoint:

1. Pulls **Pipedrive** (`PIPEDRIVE_API_TOKEN`)
2. Pulls **Buildertrend** when `BUILDERTREND_COOKIE` is set
3. Upserts a **KPI history** row for period charts
4. Saves a slim **cron status** row (`GET /api/dashboard?__cronStatus=1`) so the Owner Dashboard can show when BT was skipped/failed

If `BUILDERTREND_COOKIE` is missing or expired, Pipedrive (and history) can still update while the Buildertrend “Updated …” timestamp stays stuck on the last successful manual refresh. Set a fresh cookie on the Vercel project (Production) or use **Refresh from Buildertrend** in the UI.

> **Hobby limit:** This is folded into a single `api/dashboard.js` so the project stays at ≤12 serverless functions.

### Required env (Vercel project)

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` |
| `PIPEDRIVE_API_TOKEN` | Pipedrive API token |
| `BUILDERTREND_COOKIE` | Optional BT session cookie for unattended pulls |
| `DATABASE_URL` | Neon — stores live pulls + `dashboard_kpi_history` |

Run `npm run db:migrate` (or deploy once) so `010_dashboard_kpi_history.sql` applies.

## Cursor Automations (optional)

You can also schedule a Cloud Agent at [cursor.com/automations](https://cursor.com/automations):

1. Create automation → **Scheduled** trigger (e.g. cron `0 13 * * *` UTC)
2. Prompt example: *Call production `/api/dashboard/daily-pull` with the cron secret, confirm Pipedrive/BT pull succeeded, and report any errors.*
3. Attach repo if the agent should open PRs / update snapshot files; otherwise no repo is fine for a pure HTTP refresh.

Prefer **Vercel Cron** for the actual data pull (cheaper, reliable). Use a Cursor Automation when you also want the agent to bake `liveSnapshot` or notify Slack after the pull.

## Manual

```bash
# Local / one-off
curl -X POST "https://YOUR_DOMAIN/api/dashboard" \
  -H "Authorization: Bearer $CRON_SECRET"

npm run dashboard:pull   # CLI: BT + PD + bake snapshot into the repo
```
