-- OptmaPay P0.4: cross-tenant ledger protection (STAGED, NOT DEPLOYED).
-- Reproduced with synthetic PostgREST/JWT test 2026-10-22:
--   user A inserted a transaction for user B's account by setting user_id=A.
-- Existing OR policy allowed that write; UPDATE/SELECT/DELETE also relied on
-- user_id without requiring account ownership.
--
-- Requires the previous explicit-grants and isolated-integration branches.
-- Do NOT apply to production while the Supabase migration ledger is divergent.
-- No default grants, no GRANT ALL, no RLS disablement, no direct balance changes.
BEGIN;

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='transactions' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'P0.4 requires public.transactions with RLS enabled';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='transactions'
        AND policyname IN (
          'transactions_select_policy','transactions_insert_policy',
          'transactions_update_policy','transactions_delete_policy'
        )) <> 4 THEN
    RAISE EXCEPTION 'P0.4 unexpected transaction policies: review migration ordering';
  END IF;
END;
$preflight$;

-- The account and transaction user must BOTH match the caller.
-- The accounts SELECT policy already restricts visible accounts to auth.uid().
-- SECURITY DEFINER/backend financial RPCs and service_role remain unchanged.
DROP POLICY transactions_select_policy ON public.transactions;
CREATE POLICY transactions_select_policy ON public.transactions
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = transactions.account_id
        AND a.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY transactions_insert_policy ON public.transactions;
CREATE POLICY transactions_insert_policy ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = transactions.account_id
        AND a.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY transactions_update_policy ON public.transactions;
CREATE POLICY transactions_update_policy ON public.transactions
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = transactions.account_id
        AND a.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = transactions.account_id
        AND a.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY transactions_delete_policy ON public.transactions;
CREATE POLICY transactions_delete_policy ON public.transactions
  FOR DELETE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = transactions.account_id
        AND a.user_id = (SELECT auth.uid())
    )
  );

COMMIT;
