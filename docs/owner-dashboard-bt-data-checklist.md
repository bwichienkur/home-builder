# Owner Dashboard — Buildertrend data checklist

Fillable checklist with **read-only probe answers** (22 Aug 2026).  
Probe used a logged-in Buildertrend session: GET reports + allowlisted POST list endpoints only. **No creates/edits/deletes.**

**Dashboard:** Owner Dashboard Concept V2 · Olsen Custom Homes  
**Filter defaults (confirm):** Status = Open · Date range = All dates  

| Legend | Meaning |
|--------|---------|
| **Probe** | Observed directly in BT UI/API |
| **Needs owner** | Business rule still required |
| **Assumed in app** | How Olsen Custom Homes maps it today (change if wrong) |

---

## Probe snapshot (22 Aug 2026)

| Source | Result |
|--------|--------|
| Jobs List / job picker | **25** Open jobs (status code `1`); UI also has Presale / Warranty / Closed |
| Work in progress | **15** Open jobs on WIP |
| Lead Opportunities | **49** Open leads · raw Est. Revenue Min **~$46.1M** · weighted (conf × min) **~$21.4M** |
| Tasks (Not completed) | **14** past-due incomplete across open jobs |
| Action-item “unapproved selections” | **81** pending across jobs with counts |
| Schedule % complete | **62** jobs with projected completion date |
| Baseline vs actual duration | Has **`endDateSlip`** (days) — **not** split into Permit/Selections/Purchasing/Construction |
| Profitability | Open **15** / Closed **45** / Warranty **28** |

Reports available in BT (16): Baseline vs. actual duration by job · Budgeted vs. projected · Cash flow · Change order profit · Daily Log count by user · Daily Log creation by job · Hours worked by employee · Hours worked by job · Invoicing · Labor actuals vs. budgeted · Lead activities by salesperson · Lead count by salesperson · Lead status by source · Profitability · Schedule percent complete by job · Work in progress.

---

## A. Filters & refresh

| # | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|----------|-----------|----------------|------|-------|--------|
| A1 | What BT job statuses map to **Open / Closed / Warranty**? | Jobs → Jobs List | Status filter | UI labels: **Presale, Open, Warranty, Closed**. API job picker uses `jobStatus: 1` = Open. Profitability/WIP use string `"Open"` / `"Closed"` / `"Warranty"`. | | **Probe:** Yes — those four UI statuses exist. **Needs owner:** Does dashboard “Open” include Presale? (App today: Open only, excludes Presale.) |
| A2 | Which date drives **Date Range** (opened, contract, start, other)? | Daily log creation by job · Schedule · Job info | `actualStartDate`, projected start, created dates | Multiple dates exist; no single “openedAt” field named that way on all reports. | | **Probe:** Best available start = `actualStartDate` on daily-log-by-job. **Assumed in app:** filter uses that as `openedAt`. **Needs owner:** confirm vs contract signed / projected start. |
| A3 | How often should data refresh, and what wins if reports disagree? | — | — | WIP **cost %** ≠ Schedule **% complete** on same job (e.g. Ahigian WIP 73% vs schedule ~89%). | | **Needs owner:** refresh cadence + conflict policy. |

---

## B. KPI ribbon

| # | Metric | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|--------|----------|-----------|----------------|------|-------|--------|
| B1 | Active Projects | Which jobs count? Exclude test/template? | Jobs List / job picker | Status = Open | Count Open jobs; omit `**** Tate TEST JOB` / template names | | **Probe:** 25 Open in picker; 15 on WIP. **Assumed in app:** Open jobs, drop test/template. **Needs owner:** count all 25 Open or only WIP jobs? |
| B2 | Total WIP | Which report/column? | Reports → Work in progress · Invoicing | `totalRevisedPrice`, `amountInvoiced`, `remainingToInvoice` | Remaining ≈ revised − invoiced (Invoicing has `remainingToInvoice`) | | **Probe:** WIP remaining sum ≈ **$7.5M** on 15 WIP jobs (`totalRevisedPrice − amountInvoiced`). Concept mock showed $18.74M — different universe/time. |
| B3 | Revenue to Date | Invoiced, earned, or paid? | WIP · Invoicing · Profitability | `amountInvoiced`, `earnedRevenue`, `profitEarned` | | | **Probe:** Both **invoiced** and **earned** exist. Open WIP: invoiced ~$12.8M, earned ~$16.2M. **Needs owner:** which one is “Revenue to Date”? **Assumed in app:** `amountInvoiced`. |
| B4 | Total Contract Value | Original, revised client, or total revised? | Invoicing · WIP | `originalClientPrice`, `revisedClientPrice`, `totalRevisedPrice` | Often equal on Fixed Price jobs sampled | | **Probe:** All three fields exist. **Assumed in app:** `totalRevisedPrice`. |
| B5 | Weighted Pipeline | confidence × est. revenue min, Open only? | Sales → Lead Opportunities | `confidence`, `estimatedRevenueMin.value`, `leadStatus` | `Σ (confidence/100 × min)` for `leadStatus === 0` (Open) | | **Probe: YES.** 49 Open leads → weighted **~$21.4M**. Lost/No Opp/Sold not in current Open grid pull. Matches your screenshot rule. |
| B6 | Target Margin | Fixed 15% or per job? | — | — | Not found as a company setting in these reports | | **Needs owner.** Concept shows 15%; not sourced from BT in probe. |
| B7 | Projected Margin | Which report? | Reports → WIP · Profitability | `projectedProfit` ÷ `revisedClientPrice` / `totalRevisedPrice` | Company % = sum profit ÷ sum revised | | **Probe:** Computable from WIP/Profitability. Profitability also has `projectedProfitPercentage` per job. |
| B8 | 12 Mo. Rolling Revenue | Which field + window? | WIP · Cash flow | `earnedRevenue`; cashflow has trailing 7/14/30 only | No explicit “12 month rolling revenue” report found | | **Needs owner** for definition. **Assumed in app:** sum of WIP `earnedRevenue` (not a true trailing-12 filter). |
| B9 | vs last month / sparkline | How calculated? | — | — | Not in BT reports | | **Needs owner** / product. Live BT pulls currently show **0 Δ** (no history store yet). |

---

## C. Project status overview (donut)

| # | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|----------|-----------|----------------|------|-------|--------|
| C1 | How are Design / Permitting / Construction / Closeout–Warranty defined? | — | No native “phase” field on WIP/jobs reports | App **infers** from schedule/WIP % and log activity | | **Probe:** No phase enum on list reports. Warranty is a **job status**, not a phase. **Needs owner:** official phase rules. |
| C2 | If two phases fit, which wins? | — | — | | | **Needs owner.** |

---

## D. Average time metrics

| # | Metric | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|--------|----------|-----------|----------------|------|-------|--------|
| D1 | Contract → Close | Start + end dates? | Not found as named report | — | | | **Probe:** No Contract→Close report among the 16. **Needs owner** + possible custom schedule milestones. |
| D2 | Permit → Close | Same | Not found | — | | | Same as D1. |
| D3 | Slab pour → Close | Same | Not found | — | | | Same as D1. |
| D4 | Scope | Closed only vs open projected? | Baseline vs actual · Schedule % | `endDate`, `projectedCompletionDate`, `jobStatus` | Baseline includes Closed + Open | | **Needs owner.** |
| D5 | Δ days | vs last month? | — | — | Not in BT | | **Needs owner** / product history. |
| — | Closest BT proxy | Reports → Baseline vs. actual duration by job | `endDateSlip`, `endDate` | Single total slip days vs baseline end — **not** milestone-split | | **Probe:** usable for overall slip, not Contract/Permit/Slab metrics. |

---

## E. Project manager scorecard

| # | Metric | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|--------|----------|-----------|----------------|------|-------|--------|
| E1 | PM | Where stored? Multiple PMs? | Jobs → Job info · WIP / daily-log / schedule reports | `projectManagers[]` | | | **Probe:** Array of names on reports. Open-job PMs seen: Adam Horseman, James Manford, Paul Dimeglio, Richard Linck. |
| E2 | Designer | Does Monique count as PM? | Same | Often co-listed historically | | | **Assumed in app:** strip Monique Lumley when another PM present. **Needs owner:** confirm. |
| E3 | Projects / WIP | Same as company KPIs per PM? | WIP filtered by `projectManagers` | | | | **Assumed in app:** yes. **Needs owner:** confirm Unassigned / multi-PM jobs. |
| E4 | Daily logs (4 wk) | 4/week/project; rolling 4 wk `done/expected`? | Reports → Daily Log count by user | Date range last 28 days · `dailyLogCount` | Expected = `4×4×#projects` (owner standard) | | **Probe:** Endpoint returns per-user×job counts for window. **Needs owner:** confirm 4/week still the standard (already stated yes). |
| E5 | Daily log % (life) | total ÷ (weeks on site × 4)? | Daily Log creation by job | `totalDailyLogEntries`, `actualStartDate` | | | **Probe:** Lifetime totals + start date available. Formula is owner standard. |
| E6 | Whose logs | Any user or only PM? | Daily Log count by user | `userName` | | | **Probe:** Last 4 weeks include Adam, James, Paul, Richard, **Rob Dougherty**, Brian Dye, Trevor Ragno — **not only PMs**. **Needs owner:** count all users’ logs toward the job, or PM-only? |
| E7 | Past due | Not completed + due before today? | PM → Tasks → All tasks | Status includes Not completed (`status=0`) · `endDate` &lt; today | Count per job → roll up by PM | | **Probe: YES** (matches your Tasks screenshot). 14 past-due on current Open pull. |

---

## F. Sales pipeline funnel

| # | Stage / metric | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|----------------|----------|-----------|----------------|------|-------|--------|
| F1 | Lead | Min, Max, or other? | Lead Opportunities | `estimatedRevenueMin` / Max | Open grid sum of **Min** ≈ $46.1M | | **Probe:** Min and Max both present. Concept funnel Lead $46.3M ≈ Min total. |
| F2–F5 | Proposal → Closed Won | Where do stage $ come from? | Lead Opportunities | `proposalStatus` all **null** on Open leads pulled | No dollar buckets for Proposal/Pre-Contract/Contract/Closed Won in this grid | | **Probe:** Funnel stages beyond Lead **not available** from Lead Opportunities Open list. Lead status-by-source report is **counts**, not $. **Needs owner:** alternate CRM source or drop those stages. |
| F6 | Weighted footer | Match KPI B5? | Same as B5 | confidence × min | | | **Probe:** Should match B5 (**~$21.4M**). Concept’s $22.65M was mock. |

---

## G. Sales performance bars

| # | Metric | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|--------|----------|-----------|----------------|------|-------|--------|
| G1 | Signed Backlog | WIP only or WIP + closed? | WIP | Remaining / revised | | | **Needs owner.** **Assumed in app:** Open WIP remaining. |
| G2 | Projected Closings (90d) | Which close date + $? | Schedule % complete by job | `projectedCompletionDate` + WIP remaining | Filter est. close within 90 days | | **Probe:** Dates available. **Needs owner:** use remaining WIP $ vs contract. |
| G3 | Expected Signing Value (90d) | Which leads + date? | Lead Opportunities | No clear “expected sign date” on sample; `soldDate` empty for Open leads | | | **Needs owner.** Not obvious in Open Lead Opportunities fields. |

---

## H. Active projects snapshot (table)

| # | Column | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|--------|----------|-----------|----------------|------|-------|--------|
| H1 | Pending selections | Per job: count selections **without** green **Selected** or **Completed** status | Job → Selections → List | `POST /api/Selections/Grid?selectedTab=1` per open job | Status 2 (Selected) and 3 (BuilderOverride → Selected or Completed) excluded | | **Confirmed:** exclude all BT green/success tags (Selected + Completed). |
| H2 | Past due tasks | Same as E7? Exclude tags? | Tasks | Not completed · due before today | Tags exist (Office To Do, Inspections, etc.) | | **Probe:** Same filter works. **Needs owner:** exclude any tags? (App today: no tag exclusions.) |
| H3 | Daily logs | 4 wk vs calendar month? | User daily logs report | Date-bounded pull | | | **Assumed in app:** rolling **4 weeks** per owner standard (not calendar month weekdays). |
| H4 | % Complete | Schedule vs cost vs revenue/contract? | Schedule % · WIP | `percentComplete` vs `jobCompletionPercentage` | **They differ** on same jobs | | **Needs owner.** Example Ahigian: schedule ~89% vs WIP 73%. |
| H5 | Est. close | Schedule projected completion? | Schedule percent complete by job | `projectedCompletionDate` | | | **Probe: YES** — best match. |
| H6 | Phase | Same as C? | — | Inferred today | | | Same as C1. |
| H7 | Slip columns | Where baseline vs actual? | Baseline vs. actual duration by job | **`endDateSlip` only** | No Permit/Selections/Purchasing/Construction breakdown in this report | | **Probe:** Can show **total slip days**. Concept’s 5 slip columns **not** on this report. **Needs owner:** another source or drop split columns. |
| H8 | Notes / risks | From BT or manual? | Job notes / daily logs (partial) | | | | **Needs owner.** Not automated as a curated risks field. |

---

## I. Footer totals

| # | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|----------|-----------|----------------|------|-------|--------|
| I1 | Footer = sum/avg of filtered table? | Dashboard compute | — | | | **Assumed in app:** yes (client-side from filtered jobs). |
| I2 | Daily log compliance = done ÷ expected? | Same as E4/E5 | | | | **Assumed in app:** yes for rolling window and/or lifetime %. |

---

## J. Access / automation

| # | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|----------|-----------|----------------|------|-------|--------|
| J1 | Preferred pull path? | Reports APIs + Lead Opportunities grid + Tasks list + action-item counts | See probe snapshot | Read-only GET / allowlisted POST list | | **Probe:** Automatable for WIP, logs, schedule, baseline slip, profitability, leads weighted, tasks past-due, selection **counts**. |
| J2 | What cannot be automated? | — | — | | | **Probe gaps:** funnel Proposal→Closed $ buckets; Contract/Permit/Slab time metrics; 5-way slip split; Target Margin 15%; true 12‑mo rolling window; vs-last-month trends; curated notes; selection status detail beyond unapproved count. |

---

## Already confirmed

| Item | Confirmed rule |
|------|----------------|
| Weighted pipeline | Lead Opportunities: **confidence × estimated revenue min** (Open) — **probe verified ~$21.4M** |
| Past due tasks | **Status includes Not completed** + **Due date before today** — **probe verified** |
| Daily log standard | **4 logs / project / week**; rolling 4 weeks + lifetime % |
| PM assignment | Jobs / reports `projectManagers` (designer often co-listed) |

---

## Highest-priority owner decisions (block accurate Concept V2 parity)

1. **Revenue to Date** = invoiced or earned?  
2. **Active count** = all Open (25) or WIP-only (15)? Include Presale?  
3. **% Complete** = schedule % or WIP cost %?  
4. **Pending selections** definition vs Unreleased / All Pending.  
5. **Daily logs** — count all users (incl. Rob / supers) or PM only?  
6. Keep Concept **funnel stages / slip splits / time metrics** (need new BT sources) or simplify to what reports provide?  
7. **Target margin 15%** — confirm fixed company target.

---

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Construction / PMs | | | Especially E6, H1, H4, H7 |
| Sales | | | Especially F2–F5, G3, B5 |
| Accounting / finance | | | Especially B2–B4, B7–B8 |
| Owner | | | A1–A3, B6, priority list above |

---

## Related probe notes

- **Reports research (how to get each datapoint):** [`docs/buildertrend-reports-research.md`](./buildertrend-reports-research.md)  
- UI notes: `docs/bt-probe-ui-notes.txt`  
- Live pull cache (gitignored): `data/buildertrend-cache.json` after `npm run buildertrend:pull`
