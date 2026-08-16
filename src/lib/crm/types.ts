import { z } from 'zod';

/** Custom field types shown in Settings and forms. `select` kept for older data (= picklist). */
export const customFieldTypeSchema = z.enum([
  'text',
  'number',
  'bool',
  'date',
  'picklist',
  'select',
  'url',
  'email',
  'phone',
]);
export type CustomFieldType = z.infer<typeof customFieldTypeSchema>;

export const CUSTOM_FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'bool', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'picklist', label: 'Picklist' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
];

export function customFieldTypeLabel(type: CustomFieldType | string): string {
  if (type === 'select' || type === 'picklist') return 'Picklist';
  const found = CUSTOM_FIELD_TYPE_OPTIONS.find((t) => t.value === type);
  return found?.label ?? type;
}

export function isPicklistType(type: CustomFieldType | string): boolean {
  return type === 'picklist' || type === 'select';
}

/** Best-effort type for built-in CRM columns in the Settings field list. */
export function builtinFieldType(key: string): CustomFieldType {
  switch (key) {
    case 'email':
      return 'email';
    case 'phone':
      return 'phone';
    case 'website':
    case 'sourceUrl':
    case 'thumbnailUrl':
    case 'textureUrl':
    case 'roughnessMapUrl':
    case 'normalMapUrl':
    case 'modelUrl':
    case 'lowPolyModelUrl':
      return 'url';
    case 'width':
    case 'depth':
    case 'height':
    case 'price':
    case 'msrp':
    case 'cost':
    case 'laborCost':
    case 'leadTimeDays':
    case 'textureRepeat':
    case 'roughness':
    case 'beds':
    case 'baths':
    case 'stories':
    case 'livingSqFt':
      return 'number';
    case 'active':
    case 'sellable':
    case 'placeholderOnly':
      return 'bool';
    case 'priceVerifiedAt':
      return 'date';
    case 'placementMode':
    case 'priceUnit':
    case 'mountingType':
    case 'unit':
    case 'category':
      return 'picklist';
    default:
      return 'text';
  }
}
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

/** Matches plan/room builder catalog price units. */
export const inventoryPriceUnitSchema = z.enum(['each', 'set', 'box', 'sq ft', 'linear ft', 'allowance']);
export type InventoryPriceUnit = z.infer<typeof inventoryPriceUnitSchema>;

/** Matches CatalogPlacementMode used for trim, floor-fill, and wall art. */
export const inventoryPlacementModeSchema = z.enum([
  'wall-art',
  'ceiling-perimeter',
  'floor-perimeter',
  'floor-fill',
]);
export type InventoryPlacementMode = z.infer<typeof inventoryPlacementModeSchema>;

export const inventoryRecordSchema = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  name: z.string().min(1),
  vendorName: z.string().default(''),
  brand: z.string().default(''),
  model: z.string().default(''),
  category: z.string().min(1),
  subcategory: z.string().default(''),
  description: z.string().default(''),
  note: z.string().default(''),
  width: z.number().nonnegative().default(0),
  depth: z.number().nonnegative().default(0),
  height: z.number().nonnegative().default(0),
  unit: z.string().default('m'),
  color: z.string().default('#b9b9b2'),
  mountingType: z.string().default('floor'),
  placementSurfaces: z.array(z.string()).default(['floor']),
  placementMode: inventoryPlacementModeSchema.optional(),
  roomTypes: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  price: z.number().nonnegative().optional(),
  priceUnit: inventoryPriceUnitSchema.default('each'),
  currency: z.string().default('USD'),
  msrp: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  laborCost: z.number().nonnegative().optional(),
  priceVerifiedAt: z.string().default(''),
  sellable: z.boolean().default(true),
  placeholderOnly: z.boolean().default(false),
  active: z.boolean().default(true),
  finish: z.string().default(''),
  material: z.string().default(''),
  variantGroup: z.string().default(''),
  variantName: z.string().default(''),
  availability: z.string().default(''),
  leadTimeDays: z.number().nonnegative().optional(),
  thumbnailUrl: z.string().default(''),
  textureUrl: z.string().default(''),
  roughnessMapUrl: z.string().default(''),
  normalMapUrl: z.string().default(''),
  metalnessMapUrl: z.string().default(''),
  textureRepeat: z.number().positive().optional(),
  roughness: z.number().min(0).max(1).optional(),
  modelUrl: z.string().default(''),
  lowPolyModelUrl: z.string().default(''),
  emoji: z.string().default('▧'),
  sourceUrl: z.string().default(''),
  sourceLabel: z.string().default(''),
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
  inventory: [
    'sku',
    'name',
    'vendorName',
    'brand',
    'model',
    'category',
    'subcategory',
    'description',
    'note',
    'width',
    'depth',
    'height',
    'unit',
    'color',
    'mountingType',
    'placementSurfaces',
    'placementMode',
    'roomTypes',
    'tags',
    'price',
    'priceUnit',
    'currency',
    'msrp',
    'cost',
    'laborCost',
    'priceVerifiedAt',
    'sellable',
    'placeholderOnly',
    'active',
    'finish',
    'material',
    'variantGroup',
    'variantName',
    'availability',
    'leadTimeDays',
    'thumbnailUrl',
    'textureUrl',
    'roughnessMapUrl',
    'normalMapUrl',
    'textureRepeat',
    'roughness',
    'modelUrl',
    'lowPolyModelUrl',
    'emoji',
    'sourceUrl',
    'sourceLabel',
  ],
};

/** Human labels for built-in CRM / inventory form fields. */
export function coreFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    company: 'Company',
    address: 'Address',
    notes: 'Notes',
    website: 'Website',
    contactName: 'Contact name',
    sku: 'SKU',
    vendorName: 'Vendor',
    brand: 'Brand',
    model: 'Model',
    category: 'Category',
    subcategory: 'Subcategory',
    description: 'Description',
    note: 'Shop / BOM note',
    width: 'Width',
    depth: 'Depth',
    height: 'Height',
    unit: 'Dimension unit',
    color: 'Proxy color',
    mountingType: 'Mounting',
    placementSurfaces: 'Placement surfaces',
    placementMode: 'Placement mode',
    roomTypes: 'Room types',
    tags: 'Tags',
    price: 'Price',
    priceUnit: 'Price unit',
    currency: 'Currency',
    msrp: 'MSRP',
    cost: 'Cost',
    laborCost: 'Labor cost',
    priceVerifiedAt: 'Price verified at',
    sellable: 'Sellable',
    placeholderOnly: 'Placeholder only',
    active: 'Active',
    finish: 'Finish',
    material: 'Material',
    variantGroup: 'Variant group',
    variantName: 'Variant name',
    availability: 'Availability',
    leadTimeDays: 'Lead time (days)',
    thumbnailUrl: 'Thumbnail URL',
    textureUrl: 'Texture URL',
    roughnessMapUrl: 'Roughness map URL',
    normalMapUrl: 'Normal map URL',
    textureRepeat: 'Texture repeat',
    roughness: 'Roughness',
    modelUrl: 'Model URL',
    lowPolyModelUrl: 'Low-poly model URL',
    emoji: 'Emoji',
    sourceUrl: 'Source URL',
    sourceLabel: 'Source label',
  };
  return labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

/** Categories used by the Build shop / room builder. */
export const INVENTORY_CATEGORIES = [
  'Flooring',
  'Appliances',
  'Cabinetry',
  'Surfaces',
  'Tile',
  'Plumbing',
  'Paneling',
  'Trim',
  'Seating',
  'Tables',
  'Storage',
  'Bedroom',
  'Lighting',
  'Decor',
  'Textiles',
] as const;

export const INVENTORY_ROOM_TYPES = [
  'Bedroom',
  'Living room',
  'Bathroom',
  'Kitchen',
  'Dining room',
  'Office',
  'Children’s room',
  'Laundry',
  'Hallway',
  'Storage /wardrobe',
  'Outdoor',
] as const;

export const INVENTORY_MOUNTING_TYPES = ['floor', 'wall', 'ceiling'] as const;
export const INVENTORY_PLACEMENT_SURFACES = ['floor', 'wall', 'ceiling'] as const;
