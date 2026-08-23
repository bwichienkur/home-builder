# Pipedrive → Owner Dashboard (Phase 1)

Read-only pull of Olsen Custom Homes Pipedrive **Sales** pipeline into the owner dashboard funnel.

## Auth

```bash
# .env (gitignored) — never commit
PIPEDRIVE_API_TOKEN=…
PIPEDRIVE_COMPANY_DOMAIN=olsencustom   # optional, for docs
```

Token: Pipedrive → Settings → Personal preferences → API.

## Commands

```bash
npm run pipedrive:pull
npm run buildertrend:update-snapshot   # merges PD funnel into liveSnapshot.ts when data/pipedrive-cache.json exists
```

API (same pattern as Buildertrend):

- `POST /api/pipedrive/refresh`
- `GET /api/pipedrive/dashboard`

## Stage → funnel mapping (Sales pipeline id=1)

| Pipedrive stage | Prob. | Dashboard bucket |
|---|---|---|
| First Contact | 10% | Lead |
| Qualified | 25% | Lead |
| Homesite Secured | 40% | Pre-Contract |
| Meet with Eric | 55% | Pre-Contract |
| Pricing Proposal | 70% | Proposal |
| Under Negotiation | 85% | Pre-Contract |
| Contract Sent | 100% | Contract |
| Won deals | — | Closed / Won |

**Weighted pipeline** = Σ (`deal.value` × stage probability). Deal-level `probability` wins when set.

**Expected Signing Value** = open deals with `expected_close_date` in next 90 days; if none dated, falls back to **Contract Sent** open $ .

## Not used (yet)

- New Leads / Nurture / WIP / Builds On Hold pipelines (lead-source and production tracking)
- Person/org custom fields
- MoM history

## Security

Do not paste API tokens into chat or commit them. Rotate the token in Pipedrive if it was shared in plaintext.
