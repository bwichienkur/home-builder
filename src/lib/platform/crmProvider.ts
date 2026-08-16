import type {
  Client,
  CustomFieldDefinition,
  HousePlanMeta,
  InventoryRecord,
  Vendor,
} from '../crm/types';

export type CrmSnapshot = {
  clients: Client[];
  vendors: Vendor[];
  inventory: InventoryRecord[];
  customFields: CustomFieldDefinition[];
  housePlans: HousePlanMeta[];
};

/**
 * CRM port — swap LocalCrmProvider ↔ HttpCrmProvider (Postgres later)
 * via VITE_CRM_PROVIDER without rewriting list/form pages.
 */
export interface CrmProvider {
  readonly id: 'local' | 'http';
  load(): Promise<CrmSnapshot>;
  save(snapshot: CrmSnapshot): Promise<void>;
}
