import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const migrationsDir = path.resolve('supabase/migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

console.log(`Encontradas ${files.length} migrations.`);

const client = new Client({
  connectionString: process.env.DATABASE_TEST_URL || 'postgresql://supabase_admin:postgres@127.0.0.1:54399/postgres',
});

async function main() {
  await client.connect();
  console.log('Conectado ao PostgreSQL de teste.');

  // Cria roles e schemas básicos do Supabase se não existirem
  await client.query(`
    DO $$ BEGIN
      CREATE ROLE anon NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE ROLE authenticated NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE ROLE service_role NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA auth TO service_role;
    GRANT SELECT ON auth.users TO authenticated;
  `);

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

  console.log('Todas as migrations foram aplicadas com sucesso!');
  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
