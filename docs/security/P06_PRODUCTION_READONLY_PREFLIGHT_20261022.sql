-- OptmaPay P0.6 — Production READ-ONLY preflight queries.
-- Safe: SELECT only. No migrations, no repaired ledger, no writes, no secrets.
-- Project expected: wertmoquxdrucdbobuie.
-- Use only in the explicitly selected OptmaPay project and inspect output.
-- A green query is not a deployment approval; full E2E gates still apply.

-- A. Release safety snapshot (metadata only).
SELECT
  current_database() AS database_name,
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS applied_migration_count,
  (SELECT max(version) FROM supabase_migrations.schema_migrations) AS latest_registered_version,
  (SELECT count(*) FROM public.transactions) AS sandbox_transaction_count,
  (SELECT count(*)
     FROM public.transactions t
     JOIN public.accounts a ON a.id = t.account_id
     WHERE t.user_id IS DISTINCT FROM a.user_id) AS transaction_owner_disagreements,
  (SELECT count(*)
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity)
       AS public_tables_without_rls;

-- B. High risk pending controls, no destructive calls.
SELECT
  EXISTS (
    SELECT 1 FROM pg_index ix
    WHERE ix.indexrelid = to_regclass('public.ux_transactions_pix_paid_external_reference')
      AND ix.indisunique
  ) AS pix_single_use_unique_index_present,
  to_regprocedure('public.get_pix_instruction_status_safe(text)') IS NOT NULL
      AS expected_pix_status_rpc_present,
  (
    SELECT with_check FROM pg_policies
    WHERE schemaname='public'
      AND tablename='transactions'
      AND policyname='transactions_insert_policy'
  ) AS transaction_insert_check_active,
  (
    SELECT with_check FROM pg_policies
    WHERE schemaname='public'
      AND tablename='transactions'
      AND policyname='transactions_update_policy'
  ) AS transaction_update_check_active,
  (
    SELECT count(*)
    FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
    WHERE n.nspname='public' AND f.prosecdef
      AND has_function_privilege('authenticated', f.oid, 'EXECUTE')
  ) AS authenticated_executable_security_definer_count;

-- C. Possible duplicated paid Pix references. Should be zero before
-- introducing a unique index. This query does not expose customer identifiers.
SELECT count(*) AS duplicate_completed_pix_references
FROM (
  SELECT external_reference
  FROM public.transactions
  WHERE type='pix' AND direction='in' AND status='completed'
    AND external_reference IS NOT NULL
  GROUP BY external_reference
  HAVING count(*) > 1
) duplicates;

-- D. Data API privilege and RLS snapshot.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') AS anonymous_read,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS logged_in_read,
  has_table_privilege('authenticated', c.oid, 'INSERT') AS logged_in_insert,
  has_table_privilege('service_role', c.oid, 'SELECT') AS backend_read
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p')
ORDER BY c.relname;

-- E. Registered jobs only; external schedulers must be audited separately.
SELECT jobname,schedule,active
FROM cron.job
WHERE active = true ORDER BY jobname;

-- F. Any claim of complete migration reconciliation must account for
-- live names AND versions. A collision can be detected in the P0.5 JSON.
SELECT version,name
FROM supabase_migrations.schema_migrations
WHERE version IN ('20261014130500','20261018013732','20260928033000')
ORDER BY version;
