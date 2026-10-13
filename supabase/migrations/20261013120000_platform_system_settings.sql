-- OptmaPay Sandbox: authoritative administrative rules (not actual money).
BEGIN;
CREATE TABLE IF NOT EXISTS public.platform_system_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK(id=1),
  opening_balance_pf numeric(15,2) NOT NULL DEFAULT 2000 CHECK(opening_balance_pf >= 0 AND opening_balance_pf <= 1000000),
  opening_balance_pj numeric(15,2) NOT NULL DEFAULT 10000 CHECK(opening_balance_pj >= 0 AND opening_balance_pj <= 1000000),
  default_credit_limit numeric(15,2) NOT NULL DEFAULT 3000 CHECK(default_credit_limit >= 0 AND default_credit_limit <= 1000000),
  deposit_min numeric(15,2) NOT NULL DEFAULT 1 CHECK(deposit_min >= 1),
  deposit_max numeric(15,2) NOT NULL DEFAULT 500 CHECK(deposit_max <= 500 AND deposit_max >= deposit_min),
  deposit_free_monthly integer NOT NULL DEFAULT 5 CHECK(deposit_free_monthly BETWEEN 0 AND 100),
  deposit_excess_fee numeric(15,2) NOT NULL DEFAULT 0 CHECK(deposit_excess_fee BETWEEN 0 AND 500),
  business_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.platform_system_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_system_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_system_settings TO service_role;
INSERT INTO public.platform_system_settings(id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.platform_system_settings_get()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog, public, auth, pg_temp
AS $fn$
  SELECT to_jsonb(s) - 'updated_by' FROM public.platform_system_settings s WHERE s.id=1
$fn$;

CREATE OR REPLACE FUNCTION public.platform_system_settings_save(
  p_opening_balance_pf numeric,
  p_opening_balance_pj numeric,
  p_default_credit_limit numeric,
  p_deposit_min numeric,
  p_deposit_max numeric,
  p_deposit_free_monthly integer,
  p_deposit_excess_fee numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public, auth, pg_temp
AS $fn$
DECLARE old_value jsonb; new_value jsonb;
BEGIN
  IF NOT public.platform_staff_has_permission('system.configure') THEN
    RAISE EXCEPTION 'Permissão system.configure necessária' USING ERRCODE='42501';
  END IF;
  IF p_opening_balance_pf NOT BETWEEN 0 AND 1000000 OR
     p_opening_balance_pj NOT BETWEEN 0 AND 1000000 OR
     p_default_credit_limit NOT BETWEEN 0 AND 1000000 OR
     p_deposit_min < 1 OR p_deposit_max > 500 OR
     p_deposit_min > p_deposit_max OR
     p_deposit_free_monthly NOT BETWEEN 0 AND 100 OR
     p_deposit_excess_fee NOT BETWEEN 0 AND 500 THEN
    RAISE EXCEPTION 'Os parâmetros financeiros não respeitam os limites permitidos';
  END IF;
  IF p_opening_balance_pf IS NULL OR p_opening_balance_pj IS NULL OR
     p_default_credit_limit IS NULL OR p_deposit_min IS NULL OR
     p_deposit_max IS NULL OR p_deposit_free_monthly IS NULL OR
     p_deposit_excess_fee IS NULL THEN
    RAISE EXCEPTION 'Parâmetros obrigatórios não podem ser nulos';
  END IF;
  SELECT to_jsonb(s)-'updated_by' INTO old_value FROM public.platform_system_settings s WHERE id=1 FOR UPDATE;
  UPDATE public.platform_system_settings SET
    opening_balance_pf=round(p_opening_balance_pf,2),
    opening_balance_pj=round(p_opening_balance_pj,2),
    default_credit_limit=round(p_default_credit_limit,2),
    deposit_min=round(p_deposit_min,2),
    deposit_max=round(p_deposit_max,2),
    deposit_free_monthly=p_deposit_free_monthly,
    deposit_excess_fee=round(p_deposit_excess_fee,2),
    updated_by=auth.uid(),
    updated_at=now()
  WHERE id=1;
  SELECT to_jsonb(s)-'updated_by' INTO new_value FROM public.platform_system_settings s WHERE id=1;
  INSERT INTO public.platform_admin_audit(actor_user_id,action,details)
    VALUES (auth.uid(),'settings.updated',jsonb_build_object('previous',old_value,'current',new_value));
  RETURN new_value;
END;
$fn$;

-- Prevent client-supplied initial balances from overriding admin policy.
CREATE OR REPLACE FUNCTION public.platform_apply_opening_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog, public, auth, pg_temp
AS $fn$
DECLARE v_pf numeric; v_pj numeric;
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  SELECT opening_balance_pf,opening_balance_pj INTO v_pf,v_pj FROM public.platform_system_settings WHERE id=1;
  NEW.balance := CASE WHEN NEW.type='customer' THEN v_pf ELSE v_pj END;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_platform_apply_opening_defaults ON public.accounts;
CREATE TRIGGER trg_platform_apply_opening_defaults
BEFORE INSERT ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.platform_apply_opening_defaults();

REVOKE ALL ON FUNCTION public.platform_system_settings_get() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_system_settings_save(numeric,numeric,numeric,numeric,numeric,integer,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_system_settings_get() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_system_settings_save(numeric,numeric,numeric,numeric,numeric,integer,numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.platform_apply_opening_defaults() FROM PUBLIC, anon, authenticated;
COMMIT;