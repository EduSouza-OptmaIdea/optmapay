-- Exclude legacy staff-owned bank accounts from delegated customer policy operations.
BEGIN;
CREATE OR REPLACE FUNCTION public.platform_accounts_search(p_query text DEFAULT '',p_limit integer DEFAULT 75)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
BEGIN
 IF NOT public.platform_staff_has_permission('limits.manage') THEN
   RAISE EXCEPTION 'Permissão limits.manage necessária' USING ERRCODE='42501';
 END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC)
  FROM (
   SELECT a.id,a.name,a.type,a.created_at,u.email::text AS email,a.user_id,
     EXISTS(SELECT 1 FROM public.platform_account_overrides o WHERE o.account_id=a.id) AS has_override
   FROM public.accounts a LEFT JOIN auth.users u ON u.id=a.user_id
   WHERE NOT EXISTS(SELECT 1 FROM public.platform_staff staff WHERE staff.user_id=a.user_id AND staff.enabled)
     AND (coalesce(p_query,'')='' OR a.name ILIKE '%'||left(trim(p_query),100)||'%'
      OR u.email ILIKE '%'||left(trim(p_query),100)||'%'
      OR a.account_number ILIKE '%'||left(trim(p_query),100)||'%')
   ORDER BY a.created_at DESC
   LIMIT least(greatest(coalesce(p_limit,75),1),150)
  ) r),'[]'::jsonb);
END
$f$;
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
 IF EXISTS(SELECT 1 FROM public.accounts a JOIN public.platform_staff staff ON staff.user_id=a.user_id WHERE a.id=p_account_id AND staff.enabled) THEN RAISE EXCEPTION 'Operador interno não pode receber condições bancárias'; END IF;
 IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'Justificativa deve ter entre 8 e 500 caracteres'; END IF;
 IF p_valid_until IS NOT NULL AND p_valid_until<=now() THEN RAISE EXCEPTION 'Validade deve estar no futuro'; END IF;
 IF p_deposit_min IS NOT NULL AND (p_deposit_min < 0.05 OR mod(p_deposit_min*100,5)<>0) THEN RAISE EXCEPTION 'Mínimo inválido'; END IF;
 IF p_deposit_max IS NOT NULL AND (p_deposit_max < 0.05 OR p_deposit_max>1000000 OR mod(p_deposit_max*100,5)<>0) THEN RAISE EXCEPTION 'Máximo inválido'; END IF;
 IF p_pix_daily_limit IS NOT NULL AND (p_pix_daily_limit<=0 OR p_pix_daily_limit>10000000) THEN RAISE EXCEPTION 'Limite diário inválido'; END IF;
 IF p_pix_night_limit IS NOT NULL AND p_pix_night_limit<0 THEN RAISE EXCEPTION 'Limite noturno inválido'; END IF;
 SELECT to_jsonb(o) INTO v_current FROM public.platform_account_overrides o WHERE account_id=p_account_id;
 INSERT INTO public.platform_account_overrides(
  account_id,deposit_min,deposit_max,pix_daily_limit,pix_night_limit,reason,valid_until,pix_valid_until,updated_by
 ) VALUES(p_account_id,p_deposit_min,p_deposit_max,p_pix_daily_limit,p_pix_night_limit,trim(p_reason),p_valid_until,p_valid_until,auth.uid())
 ON CONFLICT(account_id) DO UPDATE SET
  deposit_min=excluded.deposit_min,deposit_max=excluded.deposit_max,
  pix_daily_limit=excluded.pix_daily_limit,pix_night_limit=excluded.pix_night_limit,
  reason=excluded.reason,valid_until=excluded.valid_until,pix_valid_until=excluded.pix_valid_until,updated_by=excluded.updated_by,updated_at=now();
 v_result:=public.platform_effective_policy_internal(p_account_id);
 INSERT INTO public.platform_admin_audit(actor_user_id,action,details) VALUES(auth.uid(),'policy.account.updated',
  jsonb_build_object('account_id',p_account_id,'previous',v_current,'current',v_result,'reason',p_reason));
 RETURN v_result;
END
$f$;
CREATE OR REPLACE FUNCTION public.platform_limit_request_create(
 p_account_id uuid,p_requested_daily_limit numeric,p_requested_night_limit numeric,p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
DECLARE v_policy jsonb; v_id uuid; v_owner record; v_title text; v_body text; v_operator record;
BEGIN
 IF auth.uid() IS NULL OR auth.role()<>'authenticated' THEN RAISE EXCEPTION 'Sessão de correntista necessária' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_staff staff WHERE staff.user_id=auth.uid() AND staff.enabled) THEN RAISE EXCEPTION 'Operador da plataforma não pode solicitar limites de correntista' USING ERRCODE='42501'; END IF;
 SELECT a.id,a.user_id,a.name INTO v_owner FROM public.accounts a WHERE a.id=p_account_id AND a.user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta não autorizada' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 10 AND 700 THEN RAISE EXCEPTION 'Explique seu pedido em 10 a 700 caracteres'; END IF;
 v_policy:=public.platform_effective_policy_internal(p_account_id);
 IF p_requested_daily_limit IS NULL OR p_requested_night_limit IS NULL
    OR p_requested_daily_limit<=0 OR p_requested_daily_limit>10000000
    OR p_requested_night_limit<0 OR p_requested_night_limit>p_requested_daily_limit
    OR p_requested_daily_limit<(v_policy->>'pix_daily_limit')::numeric
    OR p_requested_night_limit<(v_policy->>'pix_night_limit')::numeric
    OR (p_requested_daily_limit=(v_policy->>'pix_daily_limit')::numeric
         AND p_requested_night_limit=(v_policy->>'pix_night_limit')::numeric)
 THEN RAISE EXCEPTION 'Solicite um aumento válido, sem diminuir os limites existentes'; END IF;
 INSERT INTO public.platform_limit_requests(account_id,user_id,requested_daily_limit,requested_night_limit,reason)
 VALUES (p_account_id,auth.uid(),p_requested_daily_limit,p_requested_night_limit,trim(p_reason))
 RETURNING id INTO v_id;
 v_title:='Recebemos sua solicitação de limite Pix';
 v_body:='Seu pedido de alteração dos limites diários e noturnos da conta '||v_owner.name||
  ' foi registrado para análise. Nenhuma mudança é aplicada até a aprovação.';
 INSERT INTO public.platform_messages(user_id,account_id,request_id,title,body)
 VALUES(auth.uid(),p_account_id,v_id,v_title,v_body);
 INSERT INTO public.platform_email_outbox(recipient_user_id,request_id,event_key,subject,body)
 VALUES(auth.uid(),v_id,'pix.request.submitted:'||v_id||':customer',v_title,v_body);
 FOR v_operator IN SELECT s.user_id FROM public.platform_staff s
 WHERE s.enabled AND ((s.role='owner' AND EXISTS(SELECT 1 FROM public.optmapay_super_admins o WHERE o.user_id=s.user_id AND o.enabled))
   OR (s.role IN ('admin','user') AND 'limits.manage'=ANY(s.permissions))) LOOP
  INSERT INTO public.platform_messages(user_id,account_id,request_id,title,body)
  VALUES(v_operator.user_id,p_account_id,v_id,'Nova solicitação de limite Pix',
    'Conta '||v_owner.name||': pedido de limite diário R$ '||p_requested_daily_limit||
    ' e noturno R$ '||p_requested_night_limit||'. Avaliar no administrativo.');
  INSERT INTO public.platform_email_outbox(recipient_user_id,request_id,event_key,subject,body)
  VALUES(v_operator.user_id,v_id,'pix.request.submitted:'||v_id||':'||v_operator.user_id,
    'OptmaPay — análise de limite Pix pendente',
    'Uma solicitação de aumento Pix aguarda revisão no painel administrativo.');
 END LOOP;
 INSERT INTO public.platform_admin_audit(actor_user_id,target_user_id,action,details) VALUES(
   auth.uid(),auth.uid(),'pix.limit.requested',
   jsonb_build_object('request_id',v_id,'account_id',p_account_id,
   'requested_daily',p_requested_daily_limit,'requested_night',p_requested_night_limit));
 RETURN jsonb_build_object('id',v_id,'status','pending','account_id',p_account_id);
END
$f$;
COMMIT;