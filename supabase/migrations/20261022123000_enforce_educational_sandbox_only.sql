-- OptmaPay Educational Sandbox P0.7: hard database invariant.
-- Only simulated monetary activity. No money can be represented as real in
-- public.transactions even by a service_role client. This does not replace
-- safeguards on external integrations, which must also never move real funds.
-- Staged for reviewed forward-only rollout only: DO NOT apply to production
-- before reconciling migrations, taking backup and explicit approval.
BEGIN;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.transactions
    WHERE real_money IS DISTINCT FROM false
       OR environment IS DISTINCT FROM 'sandbox'
  ) THEN
    RAISE EXCEPTION 'Sandbox-only invariant cannot be applied: offending rows exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.transactions'::regclass
      AND conname='transactions_sandbox_only_check'
  ) THEN
    RAISE EXCEPTION 'Sandbox-only invariant already exists; review migration ledger';
  END IF;
END;
$preflight$;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_sandbox_only_check
  CHECK (real_money IS FALSE AND environment = 'sandbox');

COMMIT;
