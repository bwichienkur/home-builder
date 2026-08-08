CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id), name text NOT NULL, scene_json jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE catalog_categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id uuid REFERENCES catalog_categories(id), name text NOT NULL, slug text UNIQUE NOT NULL);
CREATE TABLE catalog_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku text UNIQUE NOT NULL, name text NOT NULL, category_id uuid REFERENCES catalog_categories(id), dimensions jsonb NOT NULL, thumbnail_url text NOT NULL, model_url text NOT NULL, low_poly_url text, asset_version integer NOT NULL DEFAULT 1, variants jsonb NOT NULL DEFAULT '[]', active boolean NOT NULL DEFAULT true, search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', name || ' ' || sku)) STORED);
CREATE INDEX catalog_search_idx ON catalog_items USING GIN(search_vector);
CREATE INDEX projects_user_idx ON projects(user_id, updated_at DESC);
