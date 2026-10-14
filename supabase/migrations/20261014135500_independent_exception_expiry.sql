-- Separate expiration of deposit exceptions and approved Pix limits.
BEGIN;
ALTER TABLE public.platform_account_overrides ADD COLUMN pix_valid_until timestamptz;
UPDATE public.platform_account_overrides SET pix_valid_until=valid_until WHERE valid_until IS NOT NULL;
CREATE OR REPLACE FUNCTION public.platform_effective_policy_internal(p_account_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
DECLARE a record; p record; o record; s record; v_min numeric; v_max numeric; v_daily numeric; v_night numeric;
BEGIN
 SELECT id,user_id,type INTO a FROM public.accounts WHERE id=p_account_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta inexistente'; END IF;
 SELECT * INTO STRICT p FROM public.platform_type_policies WHERE account_type=a.type;
 SELECT * INTO STRICT s FROM public.platform_system_settings WHERE id=1;
 SELECT * INTO o FROM public.platform_account_overrides WHERE account_id=p_account_id;
 v_min:=coalesce(CASE WHEN o.valid_until IS NULL OR o.valid_until>now() THEN o.deposit_min END,p.deposit_min);
 v_max:=coalesce(CASE WHEN o.valid_until IS NULL OR o.valid_until>now() THEN o.deposit_max END,p.deposit_max);
 v_daily:=coalesce(CASE WHEN o.pix_valid_until IS NULL OR o.pix_valid_until>now() THEN o.pix_daily_limit END,p.pix_daily_limit);
 v_night:=coalesce(CASE WHEN o.pix_valid_until IS NULL OR o.pix_valid_until>now() THEN o.pix_night_limit END,p.pix_night_limit);
 IF v_min>v_max OR v_night>v_daily THEN
  RAISE EXCEPTION 'Exceção inválida: mínimo/máximo ou limites Pix inconsistentes';
 END IF;
 RETURN jsonb_build_object(
  'account_id',a.id,'account_type',a.type,'deposit_min',v_min,'deposit_max',v_max,
  'pix_daily_limit',v_daily,'pix_night_limit',v_night,
  'pix_night_start_hour',s.pix_night_start_hour,'pix_night_end_hour',s.pix_night_end_hour,
  'timezone',s.business_timezone,'has_override',(o.account_id IS NOT NULL AND (
    o.valid_until IS NULL OR o.valid_until>now() OR o.pix_valid_until IS NULL OR o.pix_valid_until>now())),
  'valid_until',o.valid_until,'pix_valid_until',o.pix_valid_until
 );
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

CREATE OR REPLACE FUNCTION public.platform_limit_request_review(
 p_request_id uuid,p_decision text,p_review_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
DECLARE v_req public.platform_limit_requests%ROWTYPE; v_message text; v_title text; v_effective jsonb;
BEGIN
 IF NOT public.platform_staff_has_permission('limits.manage')
 THEN RAISE EXCEPTION 'Permissão limits.manage necessária' USING ERRCODE='42501'; END IF;
 IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Decisão inválida'; END IF;
 IF p_review_note IS NULL OR length(trim(p_review_note)) NOT BETWEEN 8 AND 600
 THEN RAISE EXCEPTION 'A decisão exige justificativa entre 8 e 600 caracteres'; END IF;
 SELECT * INTO v_req FROM public.platform_limit_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v_req.status<>'pending' THEN RAISE EXCEPTION 'Pedido inexistente ou já analisado'; END IF;
 IF p_decision='approved' THEN
  INSERT INTO public.platform_account_overrides(account_id,pix_daily_limit,pix_night_limit,reason,updated_by)
  VALUES(v_req.account_id,v_req.requested_daily_limit,v_req.requested_night_limit,
    'Solicitação Pix aprovada: '||left(v_req.reason,460),auth.uid())
  ON CONFLICT(account_id) DO UPDATE SET
    pix_daily_limit=excluded.pix_daily_limit,pix_night_limit=excluded.pix_night_limit,
    reason=excluded.reason,pix_valid_until=NULL,updated_by=excluded.updated_by,updated_at=now();
  v_effective:=public.platform_effective_policy_internal(v_req.account_id);
 END IF;
 UPDATE public.platform_limit_requests SET status=p_decision,reviewed_by=auth.uid(),
    reviewed_at=now(),review_note=trim(p_review_note) WHERE id=p_request_id;
 v_title:=CASE WHEN p_decision='approved' THEN 'Aumento do limite Pix aprovado'
   ELSE 'Solicitação de limite Pix não aprovada' END;
 v_message:=CASE WHEN p_decision='approved'
   THEN 'Seu limite Pix diário e noturno foi atualizado. Consulte os valores em Pix → Meus limites.'
   ELSE 'Seu pedido de aumento de limite Pix não foi aprovado neste momento.' END
   ||' Motivo: '||trim(p_review_note);
 INSERT INTO public.platform_messages(user_id,account_id,request_id,title,body)
 VALUES(v_req.user_id,v_req.account_id,p_request_id,v_title,v_message);
 INSERT INTO public.platform_email_outbox(recipient_user_id,request_id,event_key,subject,body)
 VALUES(v_req.user_id,p_request_id,'pix.request.reviewed:'||p_request_id,v_title,v_message);
 INSERT INTO public.platform_admin_audit(actor_user_id,target_user_id,action,details) VALUES(
   auth.uid(),v_req.user_id,'pix.limit.'||p_decision,
   jsonb_build_object('request_id',p_request_id,'account_id',v_req.account_id,
      'decision',p_decision,'note',p_review_note,'resulting_policy',v_effective));
 RETURN jsonb_build_object('id',p_request_id,'status',p_decision,'account_id',v_req.account_id,'policy',v_effective);
END
$f$;

COMMIT;