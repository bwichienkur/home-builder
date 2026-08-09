CREATE TABLE IF NOT EXISTS vendors (
 id text PRIMARY KEY,
 name text NOT NULL,
 website text,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 vendor_id text NOT NULL REFERENCES vendors(id),
 sku text NOT NULL,
 manufacturer text,
 name text NOT NULL,
 description text,
 category text NOT NULL,
 subcategory text,
 tags text[] NOT NULL DEFAULT '{}',
 sellable boolean NOT NULL DEFAULT true,
 placeholder_only boolean NOT NULL DEFAULT false,
 mounting_type text NOT NULL DEFAULT 'floor',
 placement_surfaces text[] NOT NULL DEFAULT '{floor}',
 dimensions jsonb NOT NULL,
 clearance jsonb NOT NULL DEFAULT '{}',
 material text,
 finish text,
 color text,
 availability text,
 lead_time_days integer,
 minimum_order_quantity numeric,
 units_per_box numeric,
 coverage_per_unit numeric,
 stock_status text,
 product_url text,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(vendor_id,sku)
);

CREATE TABLE IF NOT EXISTS product_room_types (
 product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 room_type text NOT NULL,
 PRIMARY KEY(product_id,room_type)
);

CREATE TABLE IF NOT EXISTS product_variants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 variant_group text,
 name text NOT NULL,
 attributes jsonb NOT NULL DEFAULT '{}',
 active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS product_prices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
 currency text NOT NULL DEFAULT 'USD',
 price numeric,
 price_unit text NOT NULL DEFAULT 'each',
 msrp numeric,
 cost numeric,
 labor_cost numeric,
 waste_factor_percent numeric,
 taxable boolean NOT NULL DEFAULT true,
 verified_at timestamptz,
 source text,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('thumbnail','image','model','low_poly_model')),
 url text NOT NULL,
 version text,
 active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS catalog_import_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES users(id),
 file_name text NOT NULL,
 mode text NOT NULL,
 status text NOT NULL DEFAULT 'processing',
 row_count integer NOT NULL DEFAULT 0,
 created_count integer NOT NULL DEFAULT 0,
 updated_count integer NOT NULL DEFAULT 0,
 skipped_count integer NOT NULL DEFAULT 0,
 error_count integer NOT NULL DEFAULT 0,
 rollback_data jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS catalog_import_errors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 import_job_id uuid NOT NULL REFERENCES catalog_import_jobs(id) ON DELETE CASCADE,
 row_number integer NOT NULL,
 raw_row jsonb,
 errors text[] NOT NULL
);

CREATE INDEX IF NOT EXISTS products_search_idx ON products USING GIN(to_tsvector('english',coalesce(name,'')||' '||coalesce(sku,'')||' '||coalesce(manufacturer,'')));
CREATE INDEX IF NOT EXISTS products_vendor_category_idx ON products(vendor_id,category,active);
CREATE INDEX IF NOT EXISTS product_room_types_room_idx ON product_room_types(room_type,product_id);
CREATE INDEX IF NOT EXISTS product_prices_product_idx ON product_prices(product_id,verified_at DESC);
