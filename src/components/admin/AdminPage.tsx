import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { InventoryImportDialog } from '../catalog/InventoryImportDialog';

export function AdminPage() {
  const [inventoryOpen, setInventoryOpen] = useState(false);

  return (
    <main className="admin-page">
      <header className="admin-header">
        <a href="/" className="admin-back">
          <ArrowLeft size={18} />
          Back to studio
        </a>
        <div>
          <p className="eyebrow">Advanced</p>
          <h1>Inventory admin</h1>
        </div>
      </header>
      <section className="admin-card">
        <h2>Vendor inventory import</h2>
        <p>Upload XLSX, CSV, or JSON catalogs for use in the room studio. This tools surface stays off the design canvas.</p>
        <button className="primary" onClick={() => setInventoryOpen(true)}>
          Open inventory importer
        </button>
      </section>
      {inventoryOpen && <InventoryImportDialog close={() => setInventoryOpen(false)} />}
    </main>
  );
}
