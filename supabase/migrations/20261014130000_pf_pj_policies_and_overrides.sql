-- OptmaPay: PF/PJ default policies and audited account exceptions.
BEGIN;
CREATE TABLE public.platform_type_policies (
 account_type text PRIMARY KEY CHECK (account_type IN ('customer','merchant')),
 deposit_min numeric(15,2) NOT NULL CHECK (deposit_min>=0.05 AND mod(deposit_min*100,5)=0),
 deposit_max numeric(15,2) NOT NULL CHECK (deposit_max>=deposit_min AND deposit_max<=1000000 AND mod(deposit_max*100,5)=0),
 pix_daily_limit numeric(15,2) NOT NULL CHECK (pix_daily_limit>0 AND pix_daily_limit<=10000000),
 pix_night_limit numeric(15,2) NOT NULL CHECK (pix_night_limit>=0 AND pix_night_limit<=pix_daily_limit),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.platform_type_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_type_policies FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.platform_type_policies TO service_role;
INSERT INTO public.platform_type_policies(account_type,deposit_min,deposit_max,pix_daily_limit,pix_night_limit)
SELECT 'customer',GREATEST(0.05,deposit_min),deposit_max,3000,1000 FROM public.platform_system_settings WHERE id=1
UNION ALL
SELECT 'merchant',GREATEST(0.05,deposit_min),deposit_max,10000,2000 FROM public.platform_system_settings WHERE id=1;

CREATE TABLE public.platform_account_overrides (
 account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
 deposit_min numeric(15,2) CHECK (deposit_min>=0.05 AND mod(deposit_min*100,5)=0),
 deposit_max numeric(15,2) CHECK (deposit_max>=0.05 AND deposit_max<=1000000 AND mod(deposit_max*100,5)=0),
 pix_daily_limit numeric(15,2) CHECK (pix_daily_limit>0 AND pix_daily_limit<=10000000),
 pix_night_limit numeric(15,2) CHECK (pix_night_limit>=0),
 reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 8 AND 500),
 valid_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.platform_account_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_account_overrides FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.platform_account_overrides TO service_role;

ALTER TABLE public.platform_system_settings
 ADD COLUMN pix_night_start_hour integer NOT NULL DEFAULT 22 CHECK (pix_night_start_hour BETWEEN 0 AND 23),
 ADD COLUMN pix_night_end_hour integer NOT NULL DEFAULT 6 CHECK (pix_night_end_hour BETWEEN 0 AND 23);
ALTER TABLE public.platform_system_settings
 ADD CONSTRAINT platform_different_pix_day_night_hours CHECK(pix_night_start_hour <> pix_night_end_hour);

CREATE OR REPLACE FUNCTION public.platform_effective_policy_internal(p_account_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
DECLARE a record; p record; o record; s record; v_min numeric; v_max numeric; v_daily numeric; v_night numeric;
BEGIN
 SELECT id,user_id,type INTO a FROM public.accounts WHERE id=p_account_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta inexistente'; END IF;
 SELECT * INTO STRICT p FROM public.platform_type_policies WHERE account_type=a.type;
 SELECT * INTO STRICT s FROM public.platform_system_settings WHERE id=1;
 SELECT * INTO o FROM public.platform_account_overrides WHERE account_id=p_account_id AND (valid_until IS NULL OR valid_until>now());
 v_min:=coalesce(o.deposit_min,p.deposit_min);
 v_max:=coalesce(o.deposit_max,p.deposit_max);
 v_daily:=coalesce(o.pix_daily_limit,p.pix_daily_limit);
 v_night:=coalesce(o.pix_night_limit,p.pix_night_limit);
 IF v_min>v_max OR v_night>v_daily THEN
  RAISE EXCEPTION 'Exceção inválida: mínimo/máximo ou limites Pix inconsistentes';
 END IF;
 RETURN jsonb_build_object(
  'account_id',a.id,'account_type',a.type,'deposit_min',v_min,'deposit_max',v_max,
  'pix_daily_limit',v_daily,'pix_night_limit',v_night,
  'pix_night_start_hour',s.pix_night_start_hour,'pix_night_end_hour',s.pix_night_end_hour,
  'timezone',s.business_timezone,'has_override',o.account_id IS NOT NULL,
  'valid_until',o.valid_until
 );
END
$f$;
REVOKE ALL ON FUNCTION public.platform_effective_policy_internal(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_effective_policy_internal(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_effective_policy(p_account_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=p_account_id AND a.user_id=auth.uid())
   AND NOT public.platform_staff_has_permission('limits.manage')
   AND NOT public.platform_staff_has_permission('accounts.read')
 THEN RAISE EXCEPTION 'Acesso negado à política desta conta' USING ERRCODE='42501'; END IF;
 RETURN public.platform_effective_policy_internal(p_account_id);
END
$f$;
REVOKE ALL ON FUNCTION public.platform_effective_policy(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_effective_policy(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_type_policies_list()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
BEGIN
 IF NOT public.platform_staff_has_permission('system.configure') THEN RAISE EXCEPTION 'Permissão negada' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_agg(to_jsonb(p) - 'updated_by' ORDER BY account_type) FROM public.platform_type_policies p);
END
$f$;
REVOKE ALL ON FUNCTION public.platform_type_policies_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_type_policies_list() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_type_policy_save(
 p_account_type text,p_deposit_min numeric,p_deposit_max numeric,
 p_pix_daily_limit numeric,p_pix_night_limit numeric,
 p_pix_night_start_hour int DEFAULT NULL,p_pix_night_end_hour int DEFAULT NULL
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
 THEN RAISE EXCEPTION 'Parâmetros PF/PJ inválidos'; END IF;
 IF (p_pix_night_start_hour IS NULL) <> (p_pix_night_end_hour IS NULL) THEN RAISE EXCEPTION 'Informe ambos os horários noturnos'; END IF;
 IF p_pix_night_start_hour IS NOT NULL AND (
   p_pix_night_start_hour NOT BETWEEN 0 AND 23 OR p_pix_night_end_hour NOT BETWEEN 0 AND 23
   OR p_pix_night_start_hour=p_pix_night_end_hour
 ) THEN RAISE EXCEPTION 'Horário noturno inválido'; END IF;
 SELECT to_jsonb(p) - 'updated_by' INTO v_before FROM public.platform_type_policies p WHERE account_type=p_account_type FOR UPDATE;
 UPDATE public.platform_type_policies SET deposit_min=p_deposit_min,deposit_max=p_deposit_max,
 pix_daily_limit=p_pix_daily_limit,pix_night_limit=p_pix_night_limit,updated_at=now(),updated_by=auth.uid()
 WHERE account_type=p_account_type;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tipo de conta inexistente'; END IF;
 IF p_pix_night_start_hour IS NOT NULL THEN
  UPDATE public.platform_system_settings SET pix_night_start_hour=p_pix_night_start_hour,
    pix_night_end_hour=p_pix_night_end_hour,updated_at=now(),updated_by=auth.uid() WHERE id=1;
 END IF;
 SELECT to_jsonb(p)-'updated_by' INTO v_after FROM public.platform_type_policies p WHERE account_type=p_account_type;
 INSERT INTO public.platform_admin_audit(actor_user_id,action,details) VALUES(
  auth.uid(),'policy.type.updated',jsonb_build_object('account_type',p_account_type,'previous',v_before,'current',v_after));
 RETURN v_after;
END
$f$;
REVOKE ALL ON FUNCTION public.platform_type_policy_save(text,numeric,numeric,numeric,numeric,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_type_policy_save(text,numeric,numeric,numeric,numeric,integer,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_account_override_save(
 p_account_id uuid,p_deposit_min numeric,p_deposit_max numeric,
 p_pix_daily_limit numeric,p_pix_night_limit numeric,p_reason text,p_valid_until timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
DECLARE v_current jsonb; v_preview record; v_result jsonb;
BEGIN
 IF NOT public.platform_staff_has_permission('limits.manage') THEN RAISE EXCEPTION 'Permissão limits.manage necessária' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account_id) THEN RAISE EXCEPTION 'Conta não encontrada'; END IF;
 IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'Justificativa deve ter entre 8 e 500 caracteres'; END IF;
 IF p_valid_until IS NOT NULL AND p_valid_until<=now() THEN RAISE EXCEPTION 'Validade deve estar no futuro'; END IF;
 IF p_deposit_min IS NOT NULL AND (p_deposit_min < 0.05 OR mod(p_deposit_min*100,5)<>0) THEN RAISE EXCEPTION 'Mínimo inválido'; END IF;
 IF p_deposit_max IS NOT NULL AND (p_deposit_max < 0.05 OR p_deposit_max>1000000 OR mod(p_deposit_max*100,5)<>0) THEN RAISE EXCEPTION 'Máximo inválido'; END IF;
 IF p_pix_daily_limit IS NOT NULL AND (p_pix_daily_limit<=0 OR p_pix_daily_limit>10000000) THEN RAISE EXCEPTION 'Limite diário inválido'; END IF;
 IF p_pix_night_limit IS NOT NULL AND p_pix_night_limit<0 THEN RAISE EXCEPTION 'Limite noturno inválido'; END IF;
 SELECT to_jsonb(o) INTO v_current FROM public.platform_account_overrides o WHERE account_id=p_account_id;
 INSERT INTO public.platform_account_overrides(
  account_id,deposit_min,deposit_max,pix_daily_limit,pix_night_limit,reason,valid_until,updated_by
 ) VALUES(p_account_id,p_deposit_min,p_deposit_max,p_pix_daily_limit,p_pix_night_limit,trim(p_reason),p_valid_until,auth.uid())
 ON CONFLICT(account_id) DO UPDATE SET
  deposit_min=excluded.deposit_min,deposit_max=excluded.deposit_max,
  pix_daily_limit=excluded.pix_daily_limit,pix_night_limit=excluded.pix_night_limit,
  reason=excluded.reason,valid_until=excluded.valid_until,updated_by=excluded.updated_by,updated_at=now();
 v_result:=public.platform_effective_policy_internal(p_account_id);
 INSERT INTO public.platform_admin_audit(actor_user_id,action,details) VALUES(auth.uid(),'policy.account.updated',
  jsonb_build_object('account_id',p_account_id,'previous',v_current,'current',v_result,'reason',p_reason));
 RETURN v_result;
END
$f$;
REVOKE ALL ON FUNCTION public.platform_account_override_save(uuid,numeric,numeric,numeric,numeric,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_account_override_save(uuid,numeric,numeric,numeric,numeric,text,timestamptz) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_account_override_get(p_account_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
BEGIN
 IF NOT public.platform_staff_has_permission('limits.manage') THEN RAISE EXCEPTION 'Permissão negada' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT to_jsonb(o) - 'updated_by' FROM public.platform_account_overrides o WHERE account_id=p_account_id),'{}'::jsonb);
END
$f$;
REVOKE ALL ON FUNCTION public.platform_account_override_get(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_account_override_get(uuid) TO authenticated,service_role;
COMMIT;