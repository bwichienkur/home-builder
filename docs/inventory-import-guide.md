# Vendor inventory import guide

Roomcraft accepts `.xlsx`, `.xls`, `.csv`, and `.json` vendor inventory files from **Inventory** in the desktop header or **Import vendor inventory** in the mobile room panel.

## Recommended process

1. Download `vendor-inventory-template.xlsx` from the importer.
2. Keep one product/variant per row.
3. Preserve `vendor_name`, `sku`, `product_name`, `category`, `width`, `depth`, and `height`.
4. Set `dimension_unit` to `m`, `cm`, `mm`, `in`, or `ft`.
5. Separate multiple room types, tags, image URLs, or placement surfaces with commas, semicolons, or pipes.
6. Upload and review the dry-run preview.
7. Download and correct the row-error report, if present.
8. Select an import mode and commit valid rows.

## Import modes

- **Create new and update matches**: upserts on `vendor_id + sku`.
- **Create new; skip matches**: protects existing products.
- **Replace each vendor in this file**: removes locally imported products for represented vendors before inserting the file.

Re-importing the same vendor/SKU does not create duplicates. The browser build persists imported rows on the device. The normalized PostgreSQL migration in `server/db/002_vendor_inventory.sql` is the production data model; connect the importer to the authenticated API before using it as a multi-user source of truth.

## Pricing rules

`price` is a product/material amount for the indicated `price_unit`; it is not automatically an installed-home price. Use:

- `each`, `set`, or `box` for discrete products
- `sq ft` for tile, slab, and surface coverage
- `linear ft` for trim and linear materials
- `allowance` for estimate placeholders

Store product-only, labor, cost, waste, and tax assumptions separately. Leave `price` blank when the vendor requires a quote. Set `price_last_verified_at` whenever a price is confirmed.

## 3D assets

Provide `model_url` and `low_poly_model_url` as versioned CDN URLs when available. A product without a model is imported as a dimensionally accurate placeholder and can later receive a GLB without changing its vendor/SKU identity.

## Required columns

`vendor_name`, `sku`, `product_name`, `category`, `width`, `depth`, `height`.

All template columns are documented in the `Instructions` sheet of the downloadable workbook.
