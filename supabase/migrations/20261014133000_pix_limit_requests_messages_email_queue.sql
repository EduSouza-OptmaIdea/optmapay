-- OptmaPay notifications and audited customer limit increases.
BEGIN;
CREATE TABLE public.platform_limit_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 requested_daily_limit numeric(15,2) NOT NULL CHECK(requested_daily_limit>0 AND requested_daily_limit<=10000000),
 requested_night_limit numeric(15,2) NOT NULL CHECK(requested_night_limit>=0 AND requested_night_limit<=requested_daily_limit),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 700),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 review_note text,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX platform_limit_one_pending_per_account ON public.platform_limit_requests(account_id) WHERE status='pending';
CREATE INDEX platform_limit_requests_created ON public.platform_limit_requests(created_at DESC);
ALTER TABLE public.platform_limit_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_limit_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.platform_limit_requests TO service_role;

CREATE TABLE public.platform_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
 request_id uuid REFERENCES public.platform_limit_requests(id) ON DELETE SET NULL,
 category text NOT NULL DEFAULT 'policy' CHECK(category IN('policy','security','education','system')),
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 140),
 body text NOT NULL CHECK(length(body) BETWEEN 3 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz
);
CREATE INDEX platform_messages_user_created ON public.platform_messages(user_id,created_at DESC);
ALTER TABLE public.platform_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_messages FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.platform_messages TO service_role;

CREATE TABLE public.platform_email_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid REFERENCES public.platform_limit_requests(id) ON DELETE SET NULL,
 recipient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 event_key text UNIQUE NOT NULL,
 subject text NOT NULL CHECK(length(subject) BETWEEN 3 AND 150),
 body text NOT NULL CHECK(length(body) BETWEEN 3 AND 3000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','sent','failed')),
 attempts integer NOT NULL DEFAULT 0,
 last_error text,
 sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_email_outbox_status_created ON public.platform_email_outbox(status,created_at);
ALTER TABLE public.platform_email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_email_outbox FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.platform_email_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.platform_messages_my(p_limit integer DEFAULT 40)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão necessária' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC)
  FROM (SELECT id,account_id,category,title,body,created_at,read_at FROM public.platform_messages
   WHERE user_id=auth.uid() ORDER BY created_at DESC LIMIT least(greatest(coalesce(p_limit,40),1),100)) m),'[]'::jsonb);
END
$f$;
REVOKE ALL ON FUNCTION public.platform_messages_my(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_messages_my(integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_message_mark_read(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
BEGIN
 UPDATE public.platform_messages SET read_at=coalesce(read_at,now())
 WHERE id=p_id AND user_id=auth.uid();
 RETURN FOUND;
END
$f$;
REVOKE ALL ON FUNCTION public.platform_message_mark_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_message_mark_read(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_limit_requests_my(p_account_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account_id AND user_id=auth.uid())
 THEN RAISE EXCEPTION 'Conta não autorizada' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC)
   FROM (SELECT id,requested_daily_limit,requested_night_limit,reason,status,review_note,
      reviewed_at,created_at FROM public.platform_limit_requests
     WHERE account_id=p_account_id AND user_id=auth.uid() ORDER BY created_at DESC LIMIT 30) r),'[]'::jsonb);
END
$f$;
REVOKE ALL ON FUNCTION public.platform_limit_requests_my(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_limit_requests_my(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_limit_request_create(
 p_account_id uuid,p_requested_daily_limit numeric,p_requested_night_limit numeric,p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
DECLARE v_policy jsonb; v_id uuid; v_owner record; v_title text; v_body text; v_operator record;
BEGIN
 IF auth.uid() IS NULL OR auth.role()<>'authenticated' THEN RAISE EXCEPTION 'Sessão de correntista necessária' USING ERRCODE='42501'; END IF;
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
REVOKE ALL ON FUNCTION public.platform_limit_request_create(uuid,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_limit_request_create(uuid,numeric,numeric,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_limit_requests_admin(p_status text DEFAULT 'pending')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
BEGIN
 IF NOT public.platform_staff_has_permission('limits.manage')
 THEN RAISE EXCEPTION 'Permissão limits.manage necessária' USING ERRCODE='42501'; END IF;
 IF p_status NOT IN ('pending','approved','rejected','all') THEN RAISE EXCEPTION 'Filtro inválido'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC)
   FROM (SELECT req.*,a.name AS account_name,a.type AS account_type,u.email::text AS customer_email
     FROM public.platform_limit_requests req
     JOIN public.accounts a ON a.id=req.account_id
     JOIN auth.users u ON u.id=req.user_id
     WHERE p_status='all' OR req.status=p_status
     ORDER BY req.created_at DESC LIMIT 150) r),'[]'::jsonb);
END
$f$;
REVOKE ALL ON FUNCTION public.platform_limit_requests_admin(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_limit_requests_admin(text) TO authenticated,service_role;

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
    reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now();
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
REVOKE ALL ON FUNCTION public.platform_limit_request_review(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_limit_request_review(uuid,text,text) TO authenticated,service_role;
COMMIT;