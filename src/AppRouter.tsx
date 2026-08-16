import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthCatchAll, LoginPage, RequireAuth } from './features/auth/LoginPage';
import { AppShell } from './features/shell/AppShell';
import { HomePage } from './features/home/HomePage';
import { ClientsPage } from './features/crm/ClientsPage';
import { VendorsPage } from './features/crm/VendorsPage';
import { InventoryPage } from './features/crm/InventoryPage';
import { PlansPage } from './features/plans/PlansPage';
import { SettingsPage } from './features/settings/SettingsPage';

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
          <Route path="plans" element={<PlansPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<AuthCatchAll />} />
      </Routes>
    </BrowserRouter>
  );
}
