import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthCatchAll, LoginPage, RequireAuth } from './features/auth/LoginPage';
import { AppShell } from './features/shell/AppShell';
import { HomePage } from './features/home/HomePage';
import { DrilldownPage } from './features/home/DrilldownPage';
import { ClientsPage } from './features/crm/ClientsPage';
import { VendorsPage } from './features/crm/VendorsPage';
import { InventoryPage } from './features/crm/InventoryPage';
import { OpsHubPage } from './features/operations/OpsHubPage';
import { OpsJobsPage } from './features/operations/OpsJobsPage';
import { OpsJobDetailPage } from './features/operations/OpsJobDetailPage';
import { OpsDealsPage } from './features/operations/OpsDealsPage';
import { OpsPeoplePage } from './features/operations/OpsPeoplePage';
import { OpsLogsPage, OpsSelectionsPage, OpsTasksPage } from './features/operations/OpsGlobalListsPage';
import { OpsReportDetailPage, OpsReportsHubPage } from './features/operations/OpsReportsPage';
import { PlansPage } from './features/plans/PlansPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { UsersPage } from './features/admin/UsersPage';
import { ApiDocsPage } from './features/docs/ApiDocsPage';

const StudioApp = lazy(() => import('./StudioApp'));
const AdminPage = lazy(() =>
  import('./components/admin/AdminPage').then((m) => ({ default: m.AdminPage })),
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
          <Route path="clients" element={<ClientsPage />} />
          <Route path="vendors" element={<VendorsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="ops" element={<OpsHubPage />} />
          <Route path="ops/jobs" element={<OpsJobsPage />} />
          <Route path="ops/jobs/:jobId" element={<OpsJobDetailPage />} />
          <Route path="ops/tasks" element={<OpsTasksPage />} />
          <Route path="ops/logs" element={<OpsLogsPage />} />
          <Route path="ops/selections" element={<OpsSelectionsPage />} />
          <Route path="ops/deals" element={<OpsDealsPage />} />
          <Route path="ops/people" element={<OpsPeoplePage />} />
          <Route path="ops/reports" element={<OpsReportsHubPage />} />
          <Route path="ops/reports/:reportId" element={<OpsReportDetailPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<AuthCatchAll />} />
      </Routes>
    </BrowserRouter>
  );
}
