-- Financial per-account exemptions share the original audit and permission model.
BEGIN;
CREATE OR REPLACE FUNCTION public.platform_account_override_save_v2(
 p_account_id uuid,p_deposit_min numeric,p_deposit_max numeric,
 p_pix_daily_limit numeric,p_pix_night_limit numeric,p_reason text,p_valid_until timestamptz,
 p_deposit_free_monthly integer,p_deposit_excess_fee numeric,
 p_card_credit_limit numeric,p_service_monthly_fee numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
DECLARE v_current jsonb; v_preview record; v_result jsonb;
BEGIN
 IF NOT public.platform_staff_has_permission('limits.manage') THEN RAISE EXCEPTION 'Permissão limits.manage necessária' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account_id) THEN RAISE EXCEPTION 'Conta não encontrada'; END IF;
 IF EXISTS(SELECT 1 FROM public.accounts a JOIN public.platform_staff staff ON staff.user_id=a.user_id WHERE a.id=p_account_id AND staff.enabled) THEN RAISE EXCEPTION 'Operador interno não pode receber condições bancárias'; END IF;
 IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'Justificativa deve ter entre 8 e 500 caracteres'; END IF;
 IF p_valid_until IS NOT NULL AND p_valid_until<=now() THEN RAISE EXCEPTION 'Validade deve estar no futuro'; END IF;
 IF p_deposit_min IS NOT NULL AND (p_deposit_min < 0.05 OR mod(p_deposit_min*100,5)<>0) THEN RAISE EXCEPTION 'Mínimo inválido'; END IF;
 IF p_deposit_max IS NOT NULL AND (p_deposit_max < 0.05 OR p_deposit_max>1000000 OR mod(p_deposit_max*100,5)<>0) THEN RAISE EXCEPTION 'Máximo inválido'; END IF;
 IF p_pix_daily_limit IS NOT NULL AND (p_pix_daily_limit<=0 OR p_pix_daily_limit>10000000) THEN RAISE EXCEPTION 'Limite diário inválido'; END IF;
 IF p_pix_night_limit IS NOT NULL AND p_pix_night_limit<0 THEN RAISE EXCEPTION 'Limite noturno inválido'; END IF;
 IF p_deposit_free_monthly IS NOT NULL AND p_deposit_free_monthly NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Franquia de depósitos inválida'; END IF;
 IF p_deposit_excess_fee IS NOT NULL AND p_deposit_excess_fee NOT BETWEEN 0 AND 500 THEN RAISE EXCEPTION 'Tarifa excedente inválida'; END IF;
 IF p_card_credit_limit IS NOT NULL AND p_card_credit_limit NOT BETWEEN 0 AND 1000000 THEN RAISE EXCEPTION 'Limite de cartão inválido'; END IF;
 IF p_service_monthly_fee IS NOT NULL AND p_service_monthly_fee NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'Mensalidade inválida'; END IF;
 SELECT to_jsonb(o) INTO v_current FROM public.platform_account_overrides o WHERE account_id=p_account_id;
 INSERT INTO public.platform_account_overrides(
  account_id,deposit_min,deposit_max,pix_daily_limit,pix_night_limit,reason,valid_until,pix_valid_until,
  deposit_free_monthly,deposit_excess_fee,card_credit_limit,service_monthly_fee,updated_by
 ) VALUES(p_account_id,p_deposit_min,p_deposit_max,p_pix_daily_limit,p_pix_night_limit,trim(p_reason),p_valid_until,p_valid_until,
    p_deposit_free_monthly,p_deposit_excess_fee,p_card_credit_limit,p_service_monthly_fee,auth.uid())
 ON CONFLICT(account_id) DO UPDATE SET
  deposit_min=excluded.deposit_min,deposit_max=excluded.deposit_max,
  pix_daily_limit=excluded.pix_daily_limit,pix_night_limit=excluded.pix_night_limit,
  reason=excluded.reason,valid_until=excluded.valid_until,
  pix_valid_until=CASE WHEN public.platform_account_overrides.pix_daily_limit IS DISTINCT FROM excluded.pix_daily_limit
    OR public.platform_account_overrides.pix_night_limit IS DISTINCT FROM excluded.pix_night_limit
    THEN excluded.pix_valid_until ELSE public.platform_account_overrides.pix_valid_until END,
  deposit_free_monthly=excluded.deposit_free_monthly,deposit_excess_fee=excluded.deposit_excess_fee,
  card_credit_limit=excluded.card_credit_limit,service_monthly_fee=excluded.service_monthly_fee,
  updated_by=excluded.updated_by,updated_at=now();
 v_result:=public.platform_effective_financial_policy_internal(p_account_id);
 INSERT INTO public.platform_admin_audit(actor_user_id,action,details) VALUES(auth.uid(),'policy.account_financial.updated',
  jsonb_build_object('account_id',p_account_id,'previous',v_current,'current',v_result,'reason',p_reason));
 RETURN v_result;
END
$f$;

REVOKE ALL ON FUNCTION public.platform_account_override_save_v2(uuid,numeric,numeric,numeric,numeric,text,timestamptz,integer,numeric,numeric,numeric)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_account_override_save_v2(uuid,numeric,numeric,numeric,numeric,text,timestamptz,integer,numeric,numeric,numeric)
TO authenticated,service_role;
COMMIT;