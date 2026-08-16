import { Link } from 'react-router-dom';
import { BookOpen, Boxes, Building2, LayoutTemplate, Package, Settings, Shield, Users } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useCrmStore } from '../../store/crmStore';
import { listBuiltinHousePlans } from '../../lib/housePlans/planRegistry';
import { canManageUsers } from '../../lib/platform/roles';

export function HomePage() {
  const user = useAuthStore((s) => s.user);
  const clients = useCrmStore((s) => s.clients);
  const vendors = useCrmStore((s) => s.vendors);
  const inventory = useCrmStore((s) => s.inventory);
  const importedPlans = useCrmStore((s) => s.housePlans.length);
  const clientCount = clients.reduce((n, c) => n + (c.archived ? 0 : 1), 0);
  const vendorCount = vendors.reduce((n, v) => n + (v.archived ? 0 : 1), 0);
  const inventoryCount = inventory.reduce((n, i) => n + (i.archived ? 0 : 1), 0);
  const builtin = listBuiltinHousePlans().length;

  return (
    <div className="data-page">
      <header className="data-page-header">
        <div>
          <p className="eyebrow">Welcome</p>
          <h1>{user?.name ? `Hi, ${user.name}` : 'Home'}</h1>
          <p className="muted">Choose where to work — Build keeps the full plan studio.</p>
        </div>
      </header>
      <div className="home-grid">
        <Link className="home-card" to="/build">
          <Building2 size={22} />
          <strong>Build</strong>
          <span>Plan and furnish rooms in 2D/3D.</span>
        </Link>
        <Link className="home-card" to="/clients">
          <Users size={22} />
          <strong>Clients</strong>
          <span>{clientCount} active · CSV import/export</span>
        </Link>
        <Link className="home-card" to="/vendors">
          <Package size={22} />
          <strong>Vendors</strong>
          <span>{vendorCount} active · CSV import/export</span>
        </Link>
        <Link className="home-card" to="/inventory">
          <Boxes size={22} />
          <strong>Inventory</strong>
          <span>{inventoryCount} SKUs · CSV import/export</span>
        </Link>
        <Link className="home-card" to="/plans">
          <LayoutTemplate size={22} />
          <strong>House plans</strong>
          <span>
            {builtin} samples · {importedPlans} imported (DXF / JSON)
          </span>
        </Link>
        <Link className="home-card" to="/settings">
          <Settings size={22} />
          <strong>Settings</strong>
          <span>Custom fields for clients, vendors, inventory</span>
        </Link>
        <Link className="home-card" to="/docs/api">
          <BookOpen size={22} />
          <strong>API docs</strong>
          <span>Public endpoints for vendors and external apps</span>
        </Link>
        {canManageUsers(user?.role) && (
          <Link className="home-card" to="/users">
            <Shield size={22} />
            <strong>Users</strong>
            <span>Search accounts, roles, and API keys</span>
          </Link>
        )}
      </div>
    </div>
  );
}
