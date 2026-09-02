import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthCatchAll, LoginPage, RequireAuth } from './features/auth/LoginPage';
import { AppShell } from './features/shell/AppShell';
import { HomePage } from './features/home/HomePage';
import { DrilldownPage } from './features/home/DrilldownPage';
import { ClientsPage } from './features/crm/ClientsPage';
import { VendorsPage } from './features/crm/VendorsPage';
import { InventoryPage } from './features/crm/InventoryPage';
import { PlansPage } from './features/plans/PlansPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ConfigPage } from './features/config/ConfigPage';
import { UsersPage } from './features/admin/UsersPage';
import { ApiDocsPage } from './features/docs/ApiDocsPage';

const StudioApp = lazy(() => import('./StudioApp'));
const CadStudioPage = lazy(() =>
  import('./features/cad/CadStudioPage').then((m) => ({ default: m.CadStudioPage })),
);
const TakeoffStudioPage = lazy(() =>
  import('./features/takeoff/TakeoffStudioPage').then((m) => ({ default: m.TakeoffStudioPage })),
);
const AdminPage = lazy(() =>
  import('./components/admin/AdminPage').then((m) => ({ default: m.AdminPage })),
);

/** Ops pages + LIVE_OPS_IMPORT are code-split so Home/snapshot stays lean. */
const OpsHubPage = lazy(() =>
  import('./features/operations/OpsHubPage').then((m) => ({ default: m.OpsHubPage })),
);
const OpsJobsPage = lazy(() =>
  import('./features/operations/OpsJobsPage').then((m) => ({ default: m.OpsJobsPage })),
);
const OpsJobDetailPage = lazy(() =>
  import('./features/operations/OpsJobDetailPage').then((m) => ({ default: m.OpsJobDetailPage })),
);
const OpsDealsPage = lazy(() =>
  import('./features/operations/OpsDealsPage').then((m) => ({ default: m.OpsDealsPage })),
);
const OpsPeoplePage = lazy(() =>
  import('./features/operations/OpsPeoplePage').then((m) => ({ default: m.OpsPeoplePage })),
);
const OpsTasksPage = lazy(() =>
  import('./features/operations/OpsGlobalListsPage').then((m) => ({ default: m.OpsTasksPage })),
);
const OpsLogsPage = lazy(() =>
  import('./features/operations/OpsGlobalListsPage').then((m) => ({ default: m.OpsLogsPage })),
);
const OpsSelectionsPage = lazy(() =>
  import('./features/operations/OpsGlobalListsPage').then((m) => ({ default: m.OpsSelectionsPage })),
);
const OpsReportsHubPage = lazy(() =>
  import('./features/operations/OpsReportsPage').then((m) => ({ default: m.OpsReportsHubPage })),
);
const OpsReportDetailPage = lazy(() =>
  import('./features/operations/OpsReportsPage').then((m) => ({ default: m.OpsReportDetailPage })),
);

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="loading-3d">Loading…</div>}>{children}</Suspense>;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/docs/api" element={<ApiDocsPage />} />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <Lazy>
                <AdminPage />
              </Lazy>
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="dashboard/detail" element={<DrilldownPage />} />
          <Route
            path="build"
            element={
              <Lazy>
                <StudioApp />
              </Lazy>
            }
          />
          <Route
            path="cad"
            element={
              <Lazy>
                <CadStudioPage />
              </Lazy>
            }
          />
          <Route
            path="takeoff"
            element={
              <Lazy>
                <TakeoffStudioPage />
              </Lazy>
            }
          />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="vendors" element={<VendorsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route
            path="ops"
            element={
              <Lazy>
                <OpsHubPage />
              </Lazy>
            }
          />
          <Route
            path="ops/jobs"
            element={
              <Lazy>
                <OpsJobsPage />
              </Lazy>
            }
          />
          <Route
            path="ops/jobs/:jobId"
            element={
              <Lazy>
                <OpsJobDetailPage />
              </Lazy>
            }
          />
          <Route
            path="ops/tasks"
            element={
              <Lazy>
                <OpsTasksPage />
              </Lazy>
            }
          />
          <Route
            path="ops/logs"
            element={
              <Lazy>
                <OpsLogsPage />
              </Lazy>
            }
          />
          <Route
            path="ops/selections"
            element={
              <Lazy>
                <OpsSelectionsPage />
              </Lazy>
            }
          />
          <Route
            path="ops/deals"
            element={
              <Lazy>
                <OpsDealsPage />
              </Lazy>
            }
          />
          <Route
            path="ops/people"
            element={
              <Lazy>
                <OpsPeoplePage />
              </Lazy>
            }
          />
          <Route
            path="ops/reports"
            element={
              <Lazy>
                <OpsReportsHubPage />
              </Lazy>
            }
          />
          <Route
            path="ops/reports/:reportId"
            element={
              <Lazy>
                <OpsReportDetailPage />
              </Lazy>
            }
          />
          <Route path="plans" element={<PlansPage />} />
          <Route path="config" element={<ConfigPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<AuthCatchAll />} />
      </Routes>
    </BrowserRouter>
  );
}
