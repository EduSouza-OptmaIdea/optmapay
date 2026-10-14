-- Financial policy per bank profile. No retroactive charges or card limit changes.
BEGIN;
ALTER TABLE public.platform_type_policies
  ADD COLUMN deposit_free_monthly integer NOT NULL DEFAULT 5
    CHECK(deposit_free_monthly BETWEEN 0 AND 100),
  ADD COLUMN deposit_excess_fee numeric(15,2) NOT NULL DEFAULT 0
    CHECK(deposit_excess_fee BETWEEN 0 AND 500),
  ADD COLUMN card_credit_limit numeric(15,2) NOT NULL DEFAULT 3000
    CHECK(card_credit_limit BETWEEN 0 AND 1000000),
  ADD COLUMN service_monthly_fee numeric(15,2) NOT NULL DEFAULT 0
    CHECK(service_monthly_fee BETWEEN 0 AND 10000);
UPDATE public.platform_type_policies SET service_monthly_fee=29.90 WHERE account_type='merchant';
ALTER TABLE public.platform_account_overrides
  ADD COLUMN deposit_free_monthly integer CHECK(deposit_free_monthly BETWEEN 0 AND 100),
  ADD COLUMN deposit_excess_fee numeric(15,2) CHECK(deposit_excess_fee BETWEEN 0 AND 500),
  ADD COLUMN card_credit_limit numeric(15,2) CHECK(card_credit_limit BETWEEN 0 AND 1000000),
  ADD COLUMN service_monthly_fee numeric(15,2) CHECK(service_monthly_fee BETWEEN 0 AND 10000);

CREATE OR REPLACE FUNCTION public.platform_effective_financial_policy_internal(p_account_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $fn$
DECLARE v_old jsonb; v_base public.platform_type_policies%ROWTYPE;
 v_special public.platform_account_overrides%ROWTYPE; v_acct_type text; v_override_active boolean;
BEGIN
 v_old:=public.platform_effective_policy_internal(p_account_id);
 v_acct_type:=v_old->>'account_type';
 SELECT * INTO STRICT v_base FROM public.platform_type_policies WHERE account_type=v_acct_type;
 SELECT * INTO v_special FROM public.platform_account_overrides WHERE account_id=p_account_id;
 v_override_active:=v_special.account_id IS NOT NULL
    AND (v_special.valid_until IS NULL OR v_special.valid_until>now());
 RETURN v_old || jsonb_build_object(
   'deposit_free_monthly',coalesce(CASE WHEN v_override_active THEN v_special.deposit_free_monthly END,v_base.deposit_free_monthly),
   'deposit_excess_fee',coalesce(CASE WHEN v_override_active THEN v_special.deposit_excess_fee END,v_base.deposit_excess_fee),
   'card_credit_limit',coalesce(CASE WHEN v_override_active THEN v_special.card_credit_limit END,v_base.card_credit_limit),
   'service_monthly_fee',coalesce(CASE WHEN v_override_active THEN v_special.service_monthly_fee END,v_base.service_monthly_fee)
 );
END
$fn$;
REVOKE ALL ON FUNCTION public.platform_effective_financial_policy_internal(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_effective_financial_policy_internal(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_effective_policy(p_account_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=p_account_id AND a.user_id=auth.uid())
    AND NOT public.platform_staff_has_permission('limits.manage')
    AND NOT public.platform_staff_has_permission('accounts.read')
 THEN RAISE EXCEPTION 'Acesso negado à política desta conta' USING ERRCODE='42501'; END IF;
 RETURN public.platform_effective_financial_policy_internal(p_account_id);
END
$fn$;

CREATE OR REPLACE FUNCTION public.platform_type_policy_save_v2(
 p_account_type text,p_deposit_min numeric,p_deposit_max numeric,
 p_pix_daily_limit numeric,p_pix_night_limit numeric,
 p_pix_night_start_hour int,p_pix_night_end_hour int,
 p_deposit_free_monthly integer,p_deposit_excess_fee numeric,
 p_card_credit_limit numeric,p_service_monthly_fee numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
DECLARE v_before jsonb; v_after jsonb;
BEGIN
 IF NOT public.platform_staff_has_permission('system.configure') THEN RAISE EXCEPTION 'Permissão system.configure necessária' USING ERRCODE='42501'; END IF;
 IF p_account_type NOT IN ('customer','merchant')
   OR p_deposit_min IS NULL OR p_deposit_max IS NULL
   OR p_pix_daily_limit IS NULL OR p_pix_night_limit IS NULL
   OR p_deposit_min < 0.05 OR mod(p_deposit_min*100,5)<>0
   OR p_deposit_max < p_deposit_min OR p_deposit_max>1000000 OR mod(p_deposit_max*100,5)<>0
   OR p_pix_daily_limit<=0 OR p_pix_daily_limit>10000000
   OR p_pix_night_limit<0 OR p_pix_night_limit>p_pix_daily_limit
   OR p_deposit_free_monthly IS NULL OR p_deposit_free_monthly NOT BETWEEN 0 AND 100
   OR p_deposit_excess_fee IS NULL OR p_deposit_excess_fee NOT BETWEEN 0 AND 500
   OR p_card_credit_limit IS NULL OR p_card_credit_limit NOT BETWEEN 0 AND 1000000
   OR p_service_monthly_fee IS NULL OR p_service_monthly_fee NOT BETWEEN 0 AND 10000
 THEN RAISE EXCEPTION 'Parâmetros PF/PJ inválidos'; END IF;
 IF (p_pix_night_start_hour IS NULL) <> (p_pix_night_end_hour IS NULL) THEN RAISE EXCEPTION 'Informe ambos os horários noturnos'; END IF;
 IF p_pix_night_start_hour IS NOT NULL AND (
   p_pix_night_start_hour NOT BETWEEN 0 AND 23 OR p_pix_night_end_hour NOT BETWEEN 0 AND 23
   OR p_pix_night_start_hour=p_pix_night_end_hour
 ) THEN RAISE EXCEPTION 'Horário noturno inválido'; END IF;
 SELECT to_jsonb(p) - 'updated_by' INTO v_before FROM public.platform_type_policies p WHERE account_type=p_account_type FOR UPDATE;
 UPDATE public.platform_type_policies SET deposit_min=p_deposit_min,deposit_max=p_deposit_max,
 pix_daily_limit=p_pix_daily_limit,pix_night_limit=p_pix_night_limit,
 deposit_free_monthly=p_deposit_free_monthly,deposit_excess_fee=round(p_deposit_excess_fee,2),
 card_credit_limit=round(p_card_credit_limit,2),service_monthly_fee=round(p_service_monthly_fee,2),
 updated_at=now(),updated_by=auth.uid()
 WHERE account_type=p_account_type;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tipo de conta inexistente'; END IF;
 IF p_pix_night_start_hour IS NOT NULL THEN
  UPDATE public.platform_system_settings SET pix_night_start_hour=p_pix_night_start_hour,
    pix_night_end_hour=p_pix_night_end_hour,updated_at=now(),updated_by=auth.uid() WHERE id=1;
 END IF;
 SELECT to_jsonb(p)-'updated_by' INTO v_after FROM public.platform_type_policies p WHERE account_type=p_account_type;
 INSERT INTO public.platform_admin_audit(actor_user_id,action,details) VALUES(
  auth.uid(),'policy.type_financial.updated',jsonb_build_object('account_type',p_account_type,'previous',v_before,'current',v_after));
 RETURN v_after;
END
$f$;

REVOKE ALL ON FUNCTION public.platform_type_policy_save_v2(text,numeric,numeric,numeric,numeric,integer,integer,integer,numeric,numeric,numeric)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_type_policy_save_v2(text,numeric,numeric,numeric,numeric,integer,integer,integer,numeric,numeric,numeric)
TO authenticated,service_role;
COMMIT;