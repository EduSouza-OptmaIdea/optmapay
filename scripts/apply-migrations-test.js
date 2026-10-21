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

    -- Simulate future opt-in Data API grants, not legacy blanket auto-exposure.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  `);

  // 3. Cria schema auth, auth.users e primitivas mínimas do Supabase (auth.uid() e auth.role())
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS auth;

    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT now(),
      email_confirmed_at TIMESTAMPTZ,
      last_sign_in_at TIMESTAMPTZ,
      banned_until TIMESTAMPTZ,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE auth.users TO service_role;
    GRANT SELECT ON auth.users TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.role() TO PUBLIC, anon, authenticated, service_role;
  `);

  // As migrations são executadas por uma identidade de backend no Supabase real.
  // Replica esse contexto no PostgreSQL puro do CI para que backfills protegidos
  // por auth.role() reconheçam corretamente a execução como service_role.
  await client.query("SELECT set_config('request.jwt.claim.role', 'service_role', false)");

  // 4. Cria publication supabase_realtime exigida por migrations posteriores
  try {
    await client.query('CREATE PUBLICATION supabase_realtime');
  } catch (err) {
    if (err?.code !== '42710') throw err; // duplicate_object
  }

  // 4.1. Emula a superfície mínima do pg_cron usada pelas migrations.
  // O serviço Postgres puro do GitHub Actions não traz a extensão pg_cron,
  // mas o Supabase de destino traz. O mock serve apenas ao smoke test de DDL.
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS cron;

    CREATE TABLE IF NOT EXISTS cron.job (
      jobid BIGSERIAL PRIMARY KEY,
      jobname TEXT UNIQUE NOT NULL,
      schedule TEXT,
      command TEXT
    );

    CREATE OR REPLACE FUNCTION cron.schedule(
      p_jobname TEXT,
      p_schedule TEXT,
      p_command TEXT
    ) RETURNS BIGINT
    LANGUAGE sql
    AS '
      INSERT INTO cron.job(jobname, schedule, command)
      VALUES ($1, $2, $3)
      ON CONFLICT (jobname) DO UPDATE
        SET schedule = EXCLUDED.schedule,
            command = EXCLUDED.command
      RETURNING jobid
    ';

    CREATE OR REPLACE FUNCTION cron.unschedule(p_jobid BIGINT)
    RETURNS BOOLEAN
    LANGUAGE sql
    AS '
      WITH deleted AS (
        DELETE FROM cron.job WHERE jobid = $1 RETURNING 1
      )
      SELECT EXISTS(SELECT 1 FROM deleted)
    ';
  `);

  // 5. Configura permissões básicas no schema public
  await client.query(`
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  `);

  // 6. Aplica todas as migrations desde zero
  for (const file of files) {
    console.log(`Aplicando ${file}...`);

    // Uma migration histórica de tarifas contém backfill direcionado a uma
    // conta sandbox que já existia no ambiente real. Em um banco vazio de CI,
    // cria somente esse fixture mínimo para validar a migration desde o zero.
    if (file === '20261010194357_pj_account_fees_overdraft_and_90d_foundation.sql') {
      await client.query(`
        INSERT INTO public.accounts (
          id, user_id, name, type, cpf_cnpj, phone, balance, pix_key,
          agency, account_number, config, created_at, updated_at
        )
        VALUES (
          'afce3a88-8309-4feb-8fa7-8b07d9f22150'::uuid,
          NULL,
          'CI Legacy Merchant Fixture',
          'merchant',
          '00000000000000',
          '(00) 00000-0000',
          10000.00,
          'ci-legacy-merchant@optmapay.fake',
          '0001',
          'CI-00001',
          '{}'::jsonb,
          '2026-08-29T00:00:00Z'::timestamptz,
          '2026-08-29T00:00:00Z'::timestamptz
        )
        ON CONFLICT (id) DO NOTHING
      `);
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    try {
      await client.query(sql);
      console.log(`✓ ${file} aplicada com sucesso.`);
    } catch (err) {
      console.error(`❌ Erro ao aplicar ${file}:`, err.message);
      process.exit(1);
    }
  }

  // Strict ACL gate: a blanket post-build GRANT would mask missing permissions.
  const { rows: ac } = await client.query(`
    SELECT c.relname name,c.relrowsecurity rls,
      has_table_privilege('anon',c.oid,'SELECT') a_s,
      has_table_privilege('anon',c.oid,'INSERT') a_i,
      has_table_privilege('anon',c.oid,'UPDATE') a_u,
      has_table_privilege('anon',c.oid,'DELETE') a_d,
      has_table_privilege('authenticated',c.oid,'SELECT') u_s,
      has_table_privilege('authenticated',c.oid,'INSERT') u_i,
      has_table_privilege('authenticated',c.oid,'UPDATE') u_u,
      has_table_privilege('authenticated',c.oid,'DELETE') u_d,
      has_table_privilege('service_role',c.oid,'SELECT') s_s,
      has_table_privilege('service_role',c.oid,'INSERT') s_i,
      has_table_privilege('service_role',c.oid,'UPDATE') s_u,
      has_table_privilege('service_role',c.oid,'DELETE') s_d
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname
  `);
  const browserDml = new Set(['accounts','transactions','boletos','cartoes',
    'contas_pagar','cofrinhos_poupanca','emprestimos_edu']);
  const browserRead = new Set([...browserDml,'api_keys','webhooks_config',
    'webhooks_log','webhook_events','webhook_delivery_jobs','card_receivables',
    'credit_card_invoices','credit_card_invoice_items',
    'credit_card_invoice_payments','credit_card_invoice_payment_allocations',
    'platform_messages','data_retention_logs']);
  if (ac.length !== 30) throw new Error(`Expected 30 public tables, found ${ac.length}. Update explicit ACLs.`);
  for (const t of ac) {
    const fail=reason=>{throw new Error(`ACL ${t.name}: ${reason}`);};
    if (!t.rls) fail('RLS is off');
    if ([t.a_s,t.a_i,t.a_u,t.a_d].some(Boolean)) fail('anon unexpectedly has DML');
    if (t.u_s!==browserRead.has(t.name)) fail('unexpected authenticated SELECT');
    const expectWrite=browserDml.has(t.name);
    if (t.u_i!==(expectWrite || t.name==='data_retention_logs') ||
      t.u_u!==expectWrite || t.u_d!==expectWrite) fail('unexpected authenticated write');
    if (![t.s_s,t.s_i,t.s_u,t.s_d].every(Boolean)) fail('service role DML missing');
  }
  const { rows: seqs } = await client.query(`
    SELECT c.relname name,has_sequence_privilege('anon',c.oid,'USAGE') a,
      has_sequence_privilege('authenticated',c.oid,'USAGE') u,
      has_sequence_privilege('service_role',c.oid,'USAGE') s
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='S'
  `);
  if (seqs.length!==1 || seqs[0].name!=='platform_admin_audit_id_seq'
      || seqs[0].a || seqs[0].u || !seqs[0].s)
    throw new Error('Sequence grants are not explicitly scoped to service_role');
  const requiredRpcs=[
    ['public.transfer_pix(uuid,text,numeric,text,text,uuid,text,text)','authenticated'],
    ['public.process_card_payment(uuid,uuid,text,text,text,text,numeric,text,integer,text,text,text,uuid,text,text)','authenticated'],
    ['public.refund_pix(uuid,numeric,text)','authenticated'],
    ['public.sandbox_deposit_confirm(uuid,numeric,text,text,numeric)','authenticated'],
    ['public.claim_webhook_delivery_jobs(integer,text)','service_role'],
  ];
  for (const [signature,role] of requiredRpcs) {
    const { rows }=await client.query(
      "SELECT to_regprocedure($1)::oid AS oid, has_function_privilege($2,to_regprocedure($1),'EXECUTE') AS allowed",
      [signature,role]);
    if (!rows[0]?.oid || !rows[0]?.allowed)
      throw new Error(`Missing explicit EXECUTE: ${role} / ${signature}`);
  }
  console.log(`Strict ACL gate passed: ${ac.length} tables, ${seqs.length} sequence, ${requiredRpcs.length} RPCs`);
  console.log(`All ${files.length} migrations reconstructed with autogrants disabled.`);

  await client.end();
}

main().catch(err => {
  console.error('Falha fatal no harness de migrations:', err);
  process.exit(1);
});
