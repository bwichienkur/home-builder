import { Link } from 'react-router-dom';
import { Boxes, Building2, LayoutTemplate, Package, Settings, Users } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useCrmStore } from '../../store/crmStore';
import { listBuiltinHousePlans } from '../../lib/housePlans/planRegistry';

export function HomePage() {
  const user = useAuthStore((s) => s.user);
  const clients = useCrmStore((s) => s.clients.filter((c) => !c.archived).length);
  const vendors = useCrmStore((s) => s.vendors.filter((v) => !v.archived).length);
  const inventory = useCrmStore((s) => s.inventory.filter((i) => !i.archived).length);
  const importedPlans = useCrmStore((s) => s.housePlans.length);
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
          <span>{clients} active · CSV import/export</span>
        </Link>
        <Link className="home-card" to="/vendors">
          <Package size={22} />
          <strong>Vendors</strong>
          <span>{vendors} active · CSV import/export</span>
        </Link>
        <Link className="home-card" to="/inventory">
          <Boxes size={22} />
          <strong>Inventory</strong>
          <span>{inventory} SKUs · CSV import/export</span>
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
      </div>
    </div>
  );
}
