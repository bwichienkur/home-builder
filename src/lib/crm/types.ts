import { z } from 'zod';

export const customFieldTypeSchema = z.enum(['text', 'number', 'bool', 'date', 'select']);
export type CustomFieldType = z.infer<typeof customFieldTypeSchema>;

export const entityKindSchema = z.enum(['client', 'vendor', 'inventory']);
export type EntityKind = z.infer<typeof entityKindSchema>;

export const customFieldDefinitionSchema = z.object({
  id: z.string().min(1),
  entity: entityKindSchema,
  key: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  type: customFieldTypeSchema,
  required: z.boolean().default(false),
  options: z.array(z.string()).default([]),
  order: z.number().int().nonnegative().default(0),
  archived: z.boolean().default(false),
});
export type CustomFieldDefinition = z.infer<typeof customFieldDefinitionSchema>;

export const clientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.union([z.literal(''), z.string().email()]).default(''),
  phone: z.string().default(''),
  company: z.string().default(''),
  address: z.string().default(''),
  notes: z.string().default(''),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
  archived: z.boolean().default(false),
});
export type Client = z.infer<typeof clientSchema>;

export const vendorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.union([z.literal(''), z.string().email()]).default(''),
  phone: z.string().default(''),
  website: z.string().default(''),
  contactName: z.string().default(''),
  notes: z.string().default(''),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
  archived: z.boolean().default(false),
});
export type Vendor = z.infer<typeof vendorSchema>;

export const inventoryRecordSchema = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  name: z.string().min(1),
  vendorName: z.string().default(''),
  category: z.string().min(1),
  description: z.string().default(''),
  width: z.number().nonnegative().default(0),
  depth: z.number().nonnegative().default(0),
  height: z.number().nonnegative().default(0),
  unit: z.string().default('m'),
  price: z.number().nonnegative().optional(),
  currency: z.string().default('USD'),
  active: z.boolean().default(true),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
  archived: z.boolean().default(false),
});
export type InventoryRecord = z.infer<typeof inventoryRecordSchema>;

export const housePlanMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  source: z.string().default(''),
  license: z.string().default(''),
  format: z.enum(['native-json', 'dxf', 'ifc']).default('native-json'),
  beds: z.number().nonnegative().default(0),
  baths: z.number().nonnegative().default(0),
  stories: z.number().int().positive().default(1),
  livingSqFt: z.number().nonnegative().optional(),
  notes: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Serialized HousePlan JSON (native) or import payload. */
  planJson: z.unknown(),
});
export type HousePlanMeta = z.infer<typeof housePlanMetaSchema>;

export const CORE_CSV: Record<EntityKind, string[]> = {
  client: ['name', 'email', 'phone', 'company', 'address', 'notes'],
  vendor: ['name', 'email', 'phone', 'website', 'contactName', 'notes'],
  inventory: ['sku', 'name', 'vendorName', 'category', 'description', 'width', 'depth', 'height', 'unit', 'price', 'currency', 'active'],
};
