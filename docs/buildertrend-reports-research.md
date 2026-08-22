# Buildertrend reports research — Owner Dashboard datapoints

General research on **where Owner Dashboard metrics come from in Buildertrend**, what is automatable today, and what still needs owner decisions or deeper API discovery.

**Sources:** Buildertrend Help Center (Reports Overview, WIP FAQs, Lead Opportunities, Selections, Glossary), live read-only probes on the Olsen account (Aug 2026), and the app’s `server/buildertrend/pull.js` integration.

**Related docs**

- Fillable checklist with probe answers: [`owner-dashboard-bt-data-checklist.md`](./owner-dashboard-bt-data-checklist.md)
- UI probe notes: [`bt-probe-ui-notes.txt`](./bt-probe-ui-notes.txt)
- Concept V2 mock inference: [`owner-dashboard-concept-v2-from-picture.md`](./owner-dashboard-concept-v2-from-picture.md)

---

## 1. How data gets out of Buildertrend

| Path | What it is | Owner Dashboard use |
|------|------------|---------------------|
| **Standard Reports** (16 built-ins) | Auto-generated portfolio reports under **Reports** | Primary source for WIP, schedule %, daily logs, profitability, invoicing, baseline slip |
| **Sales grids** | **Lead Opportunities** list (not a report) | Weighted pipeline, lead $ totals |
| **PM screens** | Tasks, Selections, Schedule, Job Details | Past-due tasks, selection counts, milestone dates, projected close |
| **Summary widgets** | Per-job action-item counts | Pending selections proxy (`unapprovedSelections`) |
| **Partner API** (`api.buildertrend.com`) | Gated REST API for integrators | Not available without Buildertrend partner agreement; public probes return 401 |
| **CSV export** | Most reports support export from UI | Fallback for one-off analysis; not ideal for live dashboard |
| **Session cookie pull** | Browser `Cookie` header → same `/apix/` calls the web app uses | What Mahnikka implements today (`BUILDERTREND_COOKIE`) |

Buildertrend does **not** publish an OpenAPI spec for internal endpoints. Discovery is done by watching network traffic while logged in, same as any browser session.

**Auth note:** Unattended login is blocked by Auth0/reCAPTCHA. Production refresh uses a pasted browser cookie (include `.AspNet.Auth0`, `ASP.NET_SessionId`, `GAESA`). Never commit cookies.

---

## 2. The 16 standard reports (catalog)

Buildertrend groups these under **Reports** (`buildertrend.net/app/Reporting`).

| # | Report (UI name) | Tab | API slug (GET `/apix/v3/Reporting/…`) | Primary fields / purpose |
|---|------------------|-----|----------------------------------------|---------------------------|
| 1 | Work in progress | Financial, All | `work-in-progress` | `totalRevisedPrice`, `amountInvoiced`, `earnedRevenue`, `jobCompletionPercentage` (% complete **by cost**), `projectedProfit`, `projectedProfitPercentage`, `projectManagers`, `jobStatus` |
| 2 | Invoicing | Financial, All | `invoicing` | `originalClientPrice`, `revisedClientPrice`, `totalRevisedPrice`, `amountInvoiced`, `remainingToInvoice` |
| 3 | Profitability | Financial, All | `profitability` | Expected / projected / actual profit per job; Open / Closed / Warranty counts |
| 4 | Budgeted vs. projected | Financial, All | `budgeted-vs-projected` | Budget vs actual vs projected costs (margin protection) |
| 5 | Cash flow | Financial, All | `cashflow` | Weekly/monthly in/out; **7 / 14 / 30 day** windows only — not 12 months |
| 6 | Labor actuals vs. budgeted | Financial, All | `labor-actuals-vs-budgeted` | Time-clock labor variance (requires time clock + job costing setup) |
| 7 | Change order profit | PM, All | `change-order-profit` | CO margin (pairs with WIP for billing health) |
| 8 | Schedule percent complete by job | PM, All | `schedule-percent-complete-by-job` | `percentComplete` (**schedule items**), `projectedCompletionDate` |
| 9 | Baseline vs. actual duration by job | PM, All | `baseline-vs-actual-duration-by-job` | `endDateSlip` (total days vs baseline end), baseline/actual end dates |
| 10 | Daily Log creation by job | PM, All | `daily-log-creation-by-job` | `totalDailyLogEntries`, `actualStartDate`, `lastDailyLogDate` |
| 11 | Daily Log count by user | PM, All | *(same family as user-daily-logs)* | Per-user log counts (report UI); API also exposes `user-daily-logs?startDate&endDate` |
| 12 | Hours worked, by employee | PM, All | `hours-worked-by-employee` | Time clock hours |
| 13 | Hours worked, by job | PM, All | `hours-worked-by-job` | **404 on probe** — may be renamed, permission-gated, or account-specific |
| 14 | Lead activities by salesperson | Sales, All | `lead-activities-by-salesperson` | Activity **counts** by rep — not pipeline $ |
| 15 | Lead count by salesperson | Sales, All | `lead-count-by-salesperson` | Lead **counts** by rep |
| 16 | Lead status by source | Sales, All | `lead-status-by-source` | Lead **counts** by source — not pipeline $ |

**Not a report:** Selections live under **Jobs → [job] → Project Management → Selections**. There is no portfolio-level “Selections report” in the 16.

---

## 3. Non-report screens & known API paths

| Screen | UI path | Known API | Used for |
|--------|---------|-----------|----------|
| Job picker / Jobs List | Jobs → Jobs List | `GET /api/jobpicker/GetExistingJobList` | Open job count, `jobStatus` (1 = Open), job IDs |
| Lead Opportunities | Sales → Lead Opportunities | `POST /api/Leads/Grid` | `confidence`, `estimatedRevenueMin`, `estimatedRevenueMax`, `leadStatus`, `proposalStatus`, `soldDate`, salesperson |
| Tasks (All tasks) | PM → Tasks | `POST /apix/v2/Tasks/list` | `endDate`, `status`, tags, assignee — filter Not completed + due &lt; today = past due |
| Action items | Job Summary | `GET /apix/v2/Summary/job/{jobId}/action-items/count` | `unapprovedSelections.count` |
| Jobsites | — | `GET /apix/v3/Jobsites` | Supplemental job metadata |
| Schedule | Job → Schedule | *(not yet in pull)* | Milestone start/end, baseline snapshot, phase-linked items |
| Job Details | Job → Job Info | *(not yet in pull)* | Contract date, projected completion, custom fields |
| Selections grid | Job → Selections | *(not yet in pull)* | Per-item status: Unreleased, Pending:*, Selected, Expired |
| Lead detail | Sales → Lead → General | *(not yet in pull)* | “Projected sale date”, custom fields, proposal links |

---

## 4. Dashboard metric → Buildertrend source map

Legend: **✅** automatable now · **⚠️** partial / rule needed · **❌** not in standard BT reports · **🔍** needs API discovery

### A. Filters & refresh

| Metric / question | BT source | Fields | Status |
|-------------------|-----------|--------|--------|
| Job status Open / Closed / Warranty / Presale | Jobs List filter · WIP/Profitability rows | `jobStatus` (picker: 1=Open), string status on reports | ✅ |
| Date range semantics | Multiple reports | `actualStartDate`, `projectedStartDate`, `createdDate` | ⚠️ Owner must pick one “opened” date |
| Refresh cadence & conflict policy | — | WIP cost % ≠ schedule % on same job | ⚠️ Owner policy |

### B. KPI ribbon

| KPI | Best BT source | Field / formula | Status |
|-----|----------------|-----------------|--------|
| Active Projects | Jobs List **or** WIP | Count Open (`jobStatus=1`) vs count WIP rows (15 vs 25 on probe) | ⚠️ Owner: all Open vs WIP-only; include Presale? |
| Total WIP | WIP **or** Invoicing | `totalRevisedPrice − amountInvoiced` (remaining) **or** sum PM WIP column | ✅ WIP report; ⚠️ which “WIP” definition matches Concept ($18.74M mock used PM rollup) |
| Revenue to Date | WIP · Invoicing | `amountInvoiced` vs `earnedRevenue` | ⚠️ Owner: invoiced (billing) vs earned (accrual). Concept footer says “% complete based on **billing**” → favors invoiced |
| Total Contract Value | WIP · Invoicing | `totalRevisedPrice` (revised client price) | ✅ |
| Weighted Pipeline | Lead Opportunities grid | `Σ (confidence/100 × estimatedRevenueMin.value)` where `leadStatus === 0` (Open) | ✅ Verified ~$21.4M |
| Target Margin 15% | — | Not in any of 16 reports | ❌ Manual company constant unless stored in BT Settings / custom field |
| Projected Margin | WIP · Profitability | `Σ projectedProfit / Σ totalRevisedPrice` or `projectedProfitPercentage` | ✅ |
| 12 Mo. Rolling Revenue | — | No trailing-12 report. Cash flow = 30d. WIP `earnedRevenue` is point-in-time, not rolling | ❌ Needs: store monthly snapshots, export Invoicing history, or custom report |
| vs last month / sparklines | — | BT reports are current snapshot only | ❌ Requires Mahnikka history store (save each refresh) |

**WIP % complete (official BT definition):**  
`(Actual Costs ÷ Projected Costs) × 100` — from [WIP Report FAQs](https://buildertrend.com/help-article/work-in-progress-report-faqs/).  
**Schedule % complete:** completed schedule items ÷ total duration — from Schedule Percent Complete report / Glossary.

### C. Project status donut (Design / Permitting / Construction / Closeout–Warranty)

| Need | BT source | Status |
|------|-----------|--------|
| Native “phase” field | — | ❌ No phase enum on WIP or job list reports |
| Possible proxies | Schedule % + WIP % + log activity · job `jobStatus=Warranty` | ⚠️ App **infers** phase today; owner must define rules (e.g. &lt;15% + on WIP = Design) |
| Warranty as phase | Job status filter | ⚠️ BT treats Warranty as **status**, Concept groups it with Closeout **phase** |

**How to get closer to real phases:** Map standard schedule **milestone names** (Permit, Slab, Frame, CO) to phases via Schedule API per job — 🔍 not yet probed.

### D. Average time metrics (Contract / Permit / Slab → Close)

| Metric | BT source | Status |
|--------|-----------|--------|
| Contract → Close | Job Details contract/signed date → `actualCompletionDate` or `projectedCompletionDate` | 🔍 No portfolio report; compute from job fields + closed jobs |
| Permit → Close | Schedule milestone “Permit” (or similar) → close | 🔍 Requires schedule item dates per job |
| Slab pour → Close | Schedule milestone “Slab” → close | 🔍 Same |
| Overall slip (single number) | Baseline vs actual duration | ✅ `endDateSlip` |
| Slip split (Permit / Sel / Purch / Const) | — | ❌ Not in baseline report; Concept mock columns are custom |

**Research path:** In BT Help, baseline is a **schedule snapshot** (Schedule → Baseline tab). Slip by category would require either (a) tagged schedule phases with baseline vs actual per phase, or (b) a custom spreadsheet — not one of the 16 reports.

### E. PM scorecard

| Metric | BT source | Fields / rule | Status |
|--------|-----------|---------------|--------|
| PM name | WIP, daily logs, schedule reports | `projectManagers[]` | ✅ |
| Designer vs PM (Monique) | Same | Co-listed on many jobs | ⚠️ Owner: exclude designer from PM rollups? |
| Projects / WIP per PM | WIP filtered by PM | Sum remaining or contract by PM | ✅ |
| Daily logs 4 wk | `user-daily-logs?startDate&endDate` (28d) | Count entries per job; expected = 4×4×#projects | ✅ Endpoint works; ⚠️ count all users or PM-only? |
| Daily log % (lifetime) | Daily log creation by job | `totalDailyLogEntries`, `actualStartDate`, weeks×4 | ✅ Formula is owner standard |
| Past due tasks | Tasks list | `status=0` (Not completed), `endDate < today` | ✅ 14 on probe |

### F. Sales pipeline funnel

| Stage | BT source | Status |
|-------|-----------|--------|
| Lead $ (top of funnel) | Lead Opportunities | Sum `estimatedRevenueMin` for Open — ✅ ~$46.1M |
| Proposal $ | Lead grid `proposalStatus` **or** Legacy Lead Proposals | ⚠️ All `proposalStatus` null on Open pull; may populate on leads with sent proposals — 🔍 re-pull with column filter / Sold leads |
| Pre-Contract / Contract / Closed Won $ | — | ❌ No dollar buckets in Lead status-by-source (counts only) |
| Weighted footer | Same as KPI | ✅ |

**How to get funnel stages in BT (research):**

1. **Lead Opportunities grid** with different saved views / filters: Open vs Sold vs Lost vs No Opportunity — each row still has min/max revenue and confidence.
2. **Proposal status / Legacy Lead Proposals** — Glossary lists “Legacy Lead Proposals” as pre-job estimates; proposal sent/signed state may drive Pre-Contract vs Contract buckets.
3. **Presale jobs** — When a lead converts to a Presale job, dollars move from CRM to job costing; “Contract” stage might = Presale jobs with signed proposal.
4. **Manual mapping** — Owner defines which `leadStatus` + `proposalStatus` combinations map to each funnel bar.

None of the **three Sales reports** expose stage **dollars** — only activity/count/source breakdowns.

### G. Sales performance bars

| Bar | BT source | Status |
|-----|-----------|--------|
| Signed Backlog (WIP + Closed) | WIP remaining + Closed jobs’ contract or remaining | ⚠️ Owner: Open WIP only vs include Closed backlog |
| Projected Closings (90d) | Schedule `projectedCompletionDate` within 90d × WIP `$` | ⚠️ Date ✅; dollar field = remaining WIP vs full contract — owner |
| Expected Signing Value (90d) | Lead Opportunities | 🔍 Blog/help mention “projected sale date” on leads — field not confirmed on Open grid pull; filter leads by that date × min revenue |

### H. Active projects table

| Column | BT source | Status |
|--------|-----------|--------|
| Pending selections | Action-items count **or** Selections grid | ⚠️ Proxy: `unapprovedSelections` (81 total). True rule needs Selections API: count statuses ≠ Selected, or “All Pending” only, exclude Unreleased? |
| Past due tasks | Tasks list | ✅ Same as PM scorecard; ⚠️ exclude tags? |
| Daily logs | User daily logs (28d) | ✅ Rolling 4 weeks (owner standard) vs Concept mock calendar month |
| % Complete | WIP `jobCompletionPercentage` **or** Schedule `percentComplete` | ⚠️ Owner: billing/cost (WIP) vs schedule; Concept says billing |
| Est. close | Schedule percent complete | ✅ `projectedCompletionDate` |
| Phase | Inferred | ⚠️ Same as donut |
| Slip columns | Baseline vs actual | ⚠️ Total `endDateSlip` only — no 4-way split |
| Notes / risks | Daily logs, job notes | ❌ No curated BT “risk” field — manual or NLP on logs |

### I. Footer totals

All are **client-side sums/averages** of the filtered job table once columns above are defined — ✅ computable; no separate BT report.

---

## 5. Blocked datapoints — how you *would* get them

| # | Blocked item | Realistic BT path | Effort |
|---|--------------|-------------------|--------|
| 1 | Funnel Proposal → Closed Won $ | Lead grid multi-status pulls + proposalStatus; Presale job contracts; possibly `/api/Proposals` or lead detail endpoints | Medium — API discovery + owner stage mapping |
| 2 | Expected signing value (90d) | Lead record “projected sale date” (help/blog) + `estimatedRevenueMin` | Medium — confirm field name in grid/detail |
| 3 | Contract / Permit / Slab → Close averages | Closed jobs: Job Details dates + Schedule milestone actuals | High — per-job schedule API, milestone naming standard |
| 4 | Slip split (4 categories) | Custom schedule phases with baseline dates; or manual tracker | High — not in BT reports as-is |
| 5 | Target margin 15% | Company constant in app Settings; or BT custom company field if one exists | Low — not a report field |
| 6 | True 12-mo rolling revenue | Monthly snapshot table in Mahnikka; or export Invoicing + filter by invoice date | Medium — needs history or export pipeline |
| 7 | MoM deltas & sparklines | Store `pulledAt` snapshots on each refresh | Medium — app-side only |
| 8 | Notes / risks | Optional: latest daily log subject line; job `notes` field if exposed | Low quality — mostly manual |
| 9 | Pending selections exact count | Selections list API per job (filter `All Pending` or status ≠ Selected) | Medium — discover grid endpoint |
| 10 | Daily logs: month vs 4-week | Same report, different date window | Low — owner rule |
| 11 | % complete: billing vs schedule | WIP vs Schedule reports — pick one column | Low — owner rule |
| 12 | Revenue: invoiced vs earned | WIP columns — pick one | Low — owner rule |
| 13 | Active count universe | Job picker vs WIP vs exclude test jobs | Low — owner rule |
| 14 | Monique on PM scorecard | Filter `projectManagers` | Low — owner rule |
| 15 | Past due tag exclusions | Tasks list filter by tag | Low — extend Tasks POST filters |

---

## 6. Recommended next API probes (read-only)

Priority order for a logged-in DevTools session:

1. **Selections grid** — Network tab on Jobs → Selections; look for `POST` list/grid under `/apix/` or `/api/Selections`.
2. **Lead Opportunities** — Expand grid columns; capture full row JSON for Sold/Lost leads; find projected sale / expected close date field IDs.
3. **Schedule items** — Job → Schedule → XHR for milestone list with baseline vs actual dates (enables phase + slip split).
4. **Add to pull.js (safe GETs already 200 on probe):**
   - `/apix/v3/Reporting/baseline-vs-actual-duration-by-job`
   - `/apix/v3/Reporting/invoicing`
   - `/apix/v3/Reporting/profitability`
   - `/apix/v3/Reporting/budgeted-vs-projected`
5. **Job detail** — `GET` job summary / job info by ID for contract signed date.
6. **Partner API** — Contact Buildertrend integrations if long-term unattended access is required (eliminates cookie refresh).

---

## 7. What Mahnikka pulls today

`npm run buildertrend:pull` (see `server/buildertrend/pull.js`):

| Endpoint | Maps to |
|----------|---------|
| `work-in-progress` | WIP, revenue, margin, cost % complete |
| `daily-log-creation-by-job` | Lifetime log totals, start dates |
| `user-daily-logs` (28d) | Rolling weekly log counts |
| `schedule-percent-complete-by-job` | Schedule %, projected close |
| `lead-status-by-source` | Supplemental (counts) |
| `GetExistingJobList` | Open jobs, IDs |
| `Leads/Grid` | Weighted pipeline |
| `Tasks/list` | Past-due tasks |
| `Summary/.../action-items/count` | Pending selections proxy |

Not yet wired: baseline slip, invoicing, profitability, selections detail, schedule milestones, funnel stage filters.

---

## 8. Owner decisions still blocking Concept V2 parity

These cannot be resolved by more report research alone:

1. Revenue to Date = **invoiced** or **earned**?
2. Active count = **25 Open** or **15 WIP**? Include **Presale**?
3. % Complete = **WIP cost %** or **schedule %**? (Concept: billing → invoiced/WIP)
4. Pending selections = **unapproved count**, **All Pending**, or **not Selected**?
5. Daily logs credited to **all field users** or **PM only**?
6. Keep Concept **funnel / slip split / time metrics** (needs schedule + CRM mapping) or **simplify** to available reports?
7. **Target margin 15%** — confirm fixed constant.

---

## 9. References

- [Reports Overview](https://helpcenter.buildertrend.net/s/article/Reports-Overview) — WIP, Budgeted vs Projected, Profitability, Invoicing, Labor, Cash Flow
- [WIP Report FAQs](https://buildertrend.com/help-article/work-in-progress-report-faqs/) — % complete formula, earned revenue, projected profit
- [Lead Opportunities Overview](https://helpcenter.buildertrend.net/s/article/Lead-Opportunities-Overview) — CRM, convert to Presale job
- [Selections and Allowances](https://helpcenter.buildertrend.net/s/article/Selections) — Pending / Selected workflow
- [Buildertrend Glossary](https://buildertrend.com/help-article/buildertrend-glossary/) — Baseline, Schedule %, Projected Completion
- Partner API status: [apis.io/providers/buildertrend](https://apis.io/providers/buildertrend/) — partner-gated, no public spec
