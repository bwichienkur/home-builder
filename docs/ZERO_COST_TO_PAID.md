# $0 path now → paid path later

Mahnikka is set up so you can stay at **$0** today and flip to hosted auth/database later **without rewriting the UI**.

## Current default ($0)

| Concern | Provider | Storage | Cost |
|---------|----------|---------|------|
| Auth | `local` | Browser (`localStorage`) | $0 |
| CRM | `local` | Browser (`localStorage`) | $0 |
| API (optional) | file store under `data/` | Disk | $0 |
| Postgres | not required | — | $0 |

Demo login: `admin@mahnikka.local` / `admin123`

Env (optional — these are already the defaults):

```bash
VITE_AUTH_PROVIDER=local
VITE_CRM_PROVIDER=local
# VITE_API_URL=   # leave empty for pure browser mode
```

## Intermediate $0 (still free, API-shaped)

Run the Express API so the **same remote interfaces** are exercised against local files. Useful rehearsal before paying for hosting.

```bash
npm run server
```

```bash
VITE_AUTH_PROVIDER=remote
VITE_CRM_PROVIDER=http
VITE_API_URL=http://localhost:4000
```

Routes already exist:

- `POST /api/auth/login|register|logout`, `GET /api/auth/me`
- `GET/PUT /api/crm/:collection`
- Public integration API: `GET/POST /api/v1/{clients,vendors,inventory,plans}` (API key)
- System admin: `GET /api/admin/users`, role + API key management
- In-app docs: `/docs/api` · user admin UI: `/users` (system admin)

Later you only change **how those routes are implemented** (Postgres + IdP), not the React pages.

## Paid path later (easy swap)

1. **Hosted Postgres** (Neon/Supabase/RDS free tier → paid)  
   - Implement SQL behind `/api/crm/*` and `/api/auth/*`.  
   - Keep `VITE_CRM_PROVIDER=http` and `VITE_AUTH_PROVIDER=remote`.

2. **Hosted auth** (Clerk/Auth0/Cognito free → paid)  
   - Replace `RemoteAuthProvider` internals (or add `ClerkAuthProvider`) implementing `AuthProvider`.  
   - Set `VITE_AUTH_PROVIDER=remote` (or a new id + one factory line in `getAuthProvider.ts`).

3. **Hosting** (Vercel/Fly/Railway)  
   - Deploy frontend + API; set the same env vars in the host dashboard.

### What you change vs what you don’t

| Change when going paid | Leave alone |
|------------------------|-------------|
| `.env` / host env vars | `LoginPage`, CRM pages, Settings forms |
| `server/authRoutes.js` / `crmRoutes.js` internals | `AuthProvider` / `CrmProvider` interfaces |
| Optional new provider class | Build studio |

## Code map

- `src/lib/platform/config.ts` — env switches  
- `src/lib/platform/authProvider.ts` + `localAuthProvider.ts` + `remoteAuthProvider.ts`  
- `src/lib/platform/crmProvider.ts` + `localCrmProvider.ts` + `httpCrmProvider.ts`  
- `src/store/authStore.ts` / `crmStore.ts` — UI stores call providers only  

## Recommendation

Stay on **local/local** until you have real client data or need multi-device sync. Then move to **remote/http + local API**, then swap the API backing to Postgres/IdP when you’re ready to pay.
