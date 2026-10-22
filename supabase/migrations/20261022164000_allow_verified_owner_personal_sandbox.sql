-- OptmaPay P0.8 — allow only the server-verified platform OWNER to use
-- their OWN educational/developer sandbox accounts. No impersonation.
-- Staff admin/user remain prohibited. This migration is STAGED ONLY.
-- Requires P0.5/P0.6 ledger reconciliation and human release approval.
BEGIN;
DO $preflight$
BEGIN
  IF to_regprocedure('public.prevent_platform_staff_bank_account()') IS NULL
     OR to_regclass('public.platform_staff') IS NULL
     OR to_regclass('public.optmapay_super_admins') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.accounts'::regclass
         AND tgname = 'trg_prevent_platform_staff_bank_account'
         AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION 'P0.8 owner-only sandbox: missing authoritative role tables or guard';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.prevent_platform_staff_bank_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $guard$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.platform_staff ps
    WHERE ps.user_id = NEW.user_id AND ps.enabled
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.platform_staff ps
    INNER JOIN public.optmapay_super_admins sa
      ON sa.user_id = ps.user_id
    WHERE ps.user_id = NEW.user_id
      AND ps.enabled = true
      AND ps.role = 'owner'
      AND sa.enabled = true
  ) THEN
    RAISE EXCEPTION
      'Operador da plataforma não pode possuir conta bancária fictícia sem autoridade owner'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$guard$;

-- Existing RLS on accounts still enforces auth.uid() = user_id for
-- SELECT/INSERT/UPDATE/DELETE. This exception does NOT grant extra DML.
-- CREATE OR REPLACE preserves function owner and existing ACL.
COMMIT;
