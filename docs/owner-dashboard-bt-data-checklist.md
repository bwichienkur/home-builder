# Owner Dashboard — Buildertrend data checklist

Fill this in with whoever owns each area in Olsen / Buildertrend.  
Goal: one clear **BT source** (screen, report, or export) and rule per dashboard field.

**Dashboard:** Owner Dashboard Concept V2 · Olsen Custom Homes  
**Filter defaults (confirm):** Status = Open · Date range = All dates  

| Column | Meaning |
|--------|---------|
| **BT source** | Exact BT path (e.g. Sales → Lead Opportunities; Reports → WIP) |
| **Field / filter** | Column names + any filters |
| **Rule** | How the number is calculated |
| **Owner** | Who confirms this |
| **Answer** | Confirmed yes/no + notes |

---

## A. Filters & refresh

| # | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|----------|-----------|----------------|------|-------|--------|
| A1 | What BT job statuses map to **Open / Closed / Warranty**? | | | | | |
| A2 | Which date drives **Date Range** (opened, contract, start, other)? | | | | | |
| A3 | How often should data refresh, and what wins if reports disagree? | | | | | |

---

## B. KPI ribbon

| # | Metric | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|--------|----------|-----------|----------------|------|-------|--------|
| B1 | Active Projects | Which jobs count? Exclude test/template? | | | | | |
| B2 | Total WIP | Which report/column (revised − invoiced, remaining WIP, other)? | | | | | |
| B3 | Revenue to Date | Invoiced, earned, or paid? | | | | | |
| B4 | Total Contract Value | Original, revised client, or total revised price? | | | | | |
| B5 | Weighted Pipeline | Confirm: Lead Opportunities only, **confidence × estimated revenue min**, Open only? Exclude Lost / No Opp / Sold? | Sales → Lead Opportunities | Confidence · Est. Revenue Min · Status = Open | `Σ (confidence × estimatedRevenueMin)` | | |
| B6 | Target Margin | Fixed company % (15%) or per job/period? | | | | | |
| B7 | Projected Margin | Which report (e.g. WIP projected profit ÷ revised price)? | | | | | |
| B8 | 12 Mo. Rolling Revenue | Which revenue field + exact 12-month window? | | | | | |
| B9 | vs last month / sparkline | Same metric, prior calendar month, or trailing 30 days? | | | | | |

---

## C. Project status overview (donut)

| # | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|----------|-----------|----------------|------|-------|--------|
| C1 | How are **Design / Permitting / Construction / Closeout–Warranty** defined in BT? | | | | | |
| C2 | If a job could fit two phases, which wins? | | | | | |

---

## D. Average time metrics

| # | Metric | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|--------|----------|-----------|----------------|------|-------|--------|
| D1 | Contract → Close | Start event + end event? Which BT dates? | | | | | |
| D2 | Permit → Close | Start event + end event? Which BT dates? | | | | | |
| D3 | Slab pour → Close | Start event + end event? Which BT dates? | | | | | |
| D4 | Scope | Closed jobs only, or open with projected close too? | | | | | |
| D5 | Δ days | How is “vs last month” calculated? | | | | | |

---

## E. Project manager scorecard

| # | Metric | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|--------|----------|-----------|----------------|------|-------|--------|
| E1 | PM | Where is PM stored? What if multiple PMs / designer listed? | Jobs → Job info → Project managers | | Prefer construction PM; exclude designer? | | |
| E2 | Designer | Does Monique (or any designer) ever count as PM here? | | | | | |
| E3 | Projects / WIP | Same rules as company KPIs, filtered to that PM’s jobs? | | | | | |
| E4 | Daily logs (4 wk) | Confirm **4 logs/week/project**; show `done/expected` over rolling 4 weeks? | Reports → Daily logs / user daily logs | Date range = last 28 days | Expected = `4 × 4 × # projects` | | |
| E5 | Daily log % (life) | Lifetime = total logs ÷ (weeks on site × 4)? | | | | | |
| E6 | Whose logs | Any user on the job, or only the assigned PM? | | | | | |
| E7 | Past due | Confirm: **Status includes Not completed** + **Due date before today**, per PM’s jobs? | PM → Tasks → All tasks | Status includes Not completed · Due date is before today | Count of matching tasks | | |

---

## F. Sales pipeline funnel

| # | Stage / metric | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|----------------|----------|-----------|----------------|------|-------|--------|
| F1 | Lead | Dollar source — Est. Revenue Min, Max, or other? | | | | | |
| F2 | Proposal | Where do Proposal $ come from if Lead Opportunities is Open-only? | | | | | |
| F3 | Pre-Contract | Same as F2 | | | | | |
| F4 | Contract | Same as F2 | | | | | |
| F5 | Closed / Won | Same as F2 | | | | | |
| F6 | Weighted (footer) | Must match KPI B5 (confidence × min)? | | | | | |

---

## G. Sales performance bars

| # | Metric | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|--------|----------|-----------|----------------|------|-------|--------|
| G1 | Signed Backlog | WIP only, or WIP + recently closed? | | | | | |
| G2 | Projected Closings (90d) | Which close date + which $ (WIP remaining, contract, revenue)? | | | | | |
| G3 | Expected Signing Value (90d) | Which leads/stages + which date field? | | | | | |

---

## H. Active projects snapshot (table)

| # | Column | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|--------|----------|-----------|----------------|------|-------|--------|
| H1 | Pending selections | Anything not green **Selected**? Include pending / not started / unapproved? | PM → Selections (per job) | Status ≠ Selected | Count | | |
| H2 | Past due tasks | Same as E7? Any tags excluded (punch list, office)? | PM → Tasks → All tasks | Not completed · Due before today | Count per job | | |
| H3 | Daily logs | Rolling 4-week `done/expected` or calendar month weekdays? | | | | | |
| H4 | % Complete | Schedule %, cost %, or revenue ÷ contract? | Reports → Schedule % complete by job | | | | |
| H5 | Est. close | Schedule projected completion date? | Reports → Schedule % complete by job | Projected completion date | | | |
| H6 | Phase | Same rules as section C? | | | | | |
| H7 | Slip (Permit / Sel. / Purch. / Const. / Total) | Where do baseline vs actual days live in BT? | | | | | |
| H8 | Notes / risks | Free text from BT, or manually curated? | | | | | |

---

## I. Footer totals

| # | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|----------|-----------|----------------|------|-------|--------|
| I1 | Are footer metrics only sum/avg of the filtered table (not a separate company report)? | | | | | |
| I2 | Daily log compliance % = total done ÷ total expected across filtered jobs? | | | | | |

---

## J. Access / automation

| # | Question | BT source | Field / filter | Rule | Owner | Answer |
|---|----------|-----------|----------------|------|-------|--------|
| J1 | Preferred pull path per field: Report, grid export, or screen API? | | | | | |
| J2 | Any fields that **cannot** be automated and must stay manual? | | | | | |

---

## Already confirmed (do not re-ask unless changed)

| Item | Confirmed rule |
|------|----------------|
| Weighted pipeline | Lead Opportunities: **confidence × estimated revenue min** |
| Past due tasks | All tasks: **Status includes Not completed** + **Due date is before today** |
| Daily log standard | **4 logs per project per week**; rolling 4 weeks as `done/expected`; lifetime % from weeks on site |
| PM assignment | Jobs → Job info → Project managers (designer often listed alongside) |

---

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Construction / PMs | | | |
| Sales | | | |
| Accounting / finance | | | |
| Owner | | | |
