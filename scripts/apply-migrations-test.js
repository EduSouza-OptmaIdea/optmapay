import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const migrationsDir = path.resolve('supabase/migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

console.log(`Encontradas ${files.length} migrations.`);

const connectionString = process.env.DATABASE_TEST_URL || 'postgresql://supabase_admin:postgres@127.0.0.1:54399/postgres';
const client = new Client({ connectionString });

async function main() {
  await client.connect();
  console.log('Conectado ao PostgreSQL de teste.');

  // 1. Limpa o schema public para garantir aplicação limpa desde zero
  await client.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
  `);

  // 2. Cria roles do Supabase necessárias
  await client.query(`
    DO $$ BEGIN
      CREATE ROLE anon NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE ROLE authenticated NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE ROLE supabase_admin NOLOGIN BYPASSRLS;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role, postgres, supabase_admin;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role, postgres, supabase_admin;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO service_role, postgres, supabase_admin;
  `);

  // 3. Cria schema auth, auth.users e primitivas mínimas do Supabase (auth.uid() e auth.role())
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS auth;

    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        nullif(current_setting('role', true), ''),
        'anon'
      );
    $$;

    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA auth TO service_role;
    GRANT SELECT ON auth.users TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.role() TO PUBLIC, anon, authenticated, service_role;
  `);

  // 4. Cria publication supabase_realtime exigida por migrations posteriores
  await client.query(`
    DO $$ BEGIN
      CREATE PUBLICATION supabase_realtime;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // 5. Configura permissões básicas no schema public
  await client.query(`
    GRANT USAGE, CREATE ON SCHEMA public TO anon, authenticated, service_role;
  `);

  // 6. Aplica todas as migrations desde zero
  for (const file of files) {
    console.log(`Aplicando ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    try {
      await client.query(sql);
      console.log(`✓ ${file} aplicada com sucesso.`);
    } catch (err) {
      console.error(`❌ Erro ao aplicar ${file}:`, err.message);
      process.exit(1);
    }
  }

  // Garante permissões completas para service_role em todas as tabelas criadas
  await client.query(`
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;
  `);

  console.log(`Todas as ${files.length} migrations foram aplicadas com sucesso desde o zero!`);
  await client.end();
}

main().catch(err => {
  console.error('Falha fatal no harness de migrations:', err);
  process.exit(1);
});
