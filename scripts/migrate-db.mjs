#!/usr/bin/env node
/**
 * Apply server/db/002–005 migrations against DATABASE_URL (Neon or local).
 * Usage: DATABASE_URL=... npm run db:migrate
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbDir = join(root, 'server/db');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const files = readdirSync(dbDir)
  .filter((f) => /^\d{3}_.+\.sql$/.test(f) && f !== '001_schema.sql')
  .sort();

const client = new pg.Client({ connectionString: url, ssl: url.includes('neon') ? { rejectUnauthorized: false } : undefined });
await client.connect();
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  for (const file of files) {
    const already = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file]);
    if (already.rowCount) {
      console.log(JSON.stringify({ skip: file }));
      continue;
    }
    const sql = readFileSync(join(dbDir, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(JSON.stringify({ applied: file }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }
  console.log(JSON.stringify({ ok: true, migrations: files.length }));
} finally {
  await client.end();
}
