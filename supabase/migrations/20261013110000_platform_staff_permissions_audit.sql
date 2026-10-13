-- OptmaPay Sandbox: isolated platform staff, authorization, and audit.
-- Existing super-admins remain owners; no bank-account data is deleted.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_staff (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','user')),
  permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_admin_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_staff, public.platform_admin_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_staff, public.platform_admin_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.platform_admin_audit_id_seq TO service_role;

INSERT INTO public.platform_staff(user_id, role, enabled, permissions)
SELECT s.user_id, 'owner', true, ARRAY[]::text[]
FROM public.optmapay_super_admins s
WHERE s.enabled = true
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.platform_staff_me()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $fn$
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'is_staff', true,
      'role', CASE WHEN EXISTS (
        SELECT 1 FROM public.optmapay_super_admins o WHERE o.user_id = s.user_id AND o.enabled
      ) THEN 'owner' ELSE s.role END,
      'permissions', CASE WHEN s.role = 'owner' THEN to_jsonb(ARRAY['*']::text[]) ELSE to_jsonb(s.permissions) END
    )
    FROM public.platform_staff s
    WHERE s.user_id = auth.uid() AND s.enabled
  ), jsonb_build_object('is_staff', false, 'role', null, 'permissions', '[]'::jsonb))
$fn$;

CREATE OR REPLACE FUNCTION public.platform_staff_has_permission(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff s
    WHERE s.user_id = auth.uid() AND s.enabled
      AND (
        (s.role = 'owner' AND EXISTS (
          SELECT 1 FROM public.optmapay_super_admins o WHERE o.user_id = s.user_id AND o.enabled
        ))
        OR (p_permission = ANY(s.permissions) AND s.role IN ('admin','user'))
      )
  )
$fn$;

CREATE OR REPLACE FUNCTION public.platform_staff_list()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $fn$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_optmapay_super_admin() THEN RAISE EXCEPTION 'Acesso administrativo negado' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', s.user_id, 'email', u.email, 'role', s.role,
    'permissions', to_jsonb(s.permissions), 'enabled', s.enabled,
    'created_at', s.created_at, 'updated_at', s.updated_at
  ) ORDER BY s.created_at), '[]'::jsonb)
  INTO result
  FROM public.platform_staff s JOIN auth.users u ON u.id=s.user_id;
  RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.platform_staff_save(
  p_email text, p_role text, p_permissions text[] DEFAULT ARRAY[]::text[],
  p_enabled boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $fn$
DECLARE
  v_user auth.users%ROWTYPE;
  v_perms text[];
  v_existing public.platform_staff%ROWTYPE;
  v_allowed text[] := ARRAY[
    'customers.read','customers.manage','accounts.read','limits.manage',
    'fees.manage','rates.manage','system.configure','messages.send',
    'education.manage','investments.manage','shop.manage','reports.read','audit.read'
  ];
BEGIN
  IF NOT public.is_optmapay_super_admin() THEN RAISE EXCEPTION 'Somente Owner pode gerenciar operadores' USING ERRCODE='42501'; END IF;
  IF p_role IS NULL OR p_role NOT IN ('admin','user') THEN RAISE EXCEPTION 'Papel inválido'; END IF;
  IF p_email IS NULL OR length(trim(p_email)) < 5 THEN RAISE EXCEPTION 'E-mail inválido'; END IF;
  SELECT * INTO v_user FROM auth.users WHERE lower(email)=lower(trim(p_email));
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário inexistente. Cadastre a identidade no Auth antes de delegar acesso.'; END IF;
  IF v_user.email_confirmed_at IS NULL THEN RAISE EXCEPTION 'Usuário precisa confirmar o e-mail antes da delegação.'; END IF;
  IF EXISTS (SELECT 1 FROM public.optmapay_super_admins WHERE user_id=v_user.id)
    THEN RAISE EXCEPTION 'A autoridade Owner não pode ser alterada por esta operação'; END IF;
  IF EXISTS (SELECT 1 FROM public.accounts WHERE user_id=v_user.id)
    OR EXISTS (SELECT 1 FROM public.transactions WHERE user_id=v_user.id)
    THEN RAISE EXCEPTION 'Esta identidade possui histórico bancário. Use uma identidade administrativa distinta.'; END IF;
  v_perms := ARRAY(SELECT DISTINCT trim(x) FROM unnest(COALESCE(p_permissions, ARRAY[]::text[])) x ORDER BY 1);
  IF EXISTS (SELECT 1 FROM unnest(v_perms) x WHERE NOT x = ANY(v_allowed))
    THEN RAISE EXCEPTION 'Permissão desconhecida ou reservada ao Owner'; END IF;
  IF p_role='user' AND EXISTS (
    SELECT 1 FROM unnest(v_perms) x
    WHERE NOT x = ANY(ARRAY['customers.read','accounts.read','messages.send','reports.read'])
  ) THEN RAISE EXCEPTION 'User interno não pode receber permissões de gestão'; END IF;
  SELECT * INTO v_existing FROM public.platform_staff WHERE user_id=v_user.id FOR UPDATE;
  INSERT INTO public.platform_staff(user_id,role,permissions,enabled,created_by)
  VALUES(v_user.id,p_role,v_perms,COALESCE(p_enabled,true),auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET
    role=excluded.role, permissions=excluded.permissions,
    enabled=excluded.enabled, updated_at=now();
  INSERT INTO public.platform_admin_audit(actor_user_id,target_user_id,action,details)
  VALUES(auth.uid(),v_user.id,CASE WHEN v_existing.user_id IS NULL THEN 'operator.created' ELSE 'operator.updated' END,
    jsonb_build_object('role',p_role,'permissions',to_jsonb(v_perms),'enabled',COALESCE(p_enabled,true)));
  RETURN jsonb_build_object('user_id',v_user.id,'role',p_role,'permissions',to_jsonb(v_perms),'enabled',COALESCE(p_enabled,true));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.platform_staff_set_enabled(p_user_id uuid,p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_optmapay_super_admin() THEN RAISE EXCEPTION 'Somente Owner pode alterar operadores' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.optmapay_super_admins WHERE user_id=p_user_id)
    THEN RAISE EXCEPTION 'Não é permitido suspender Owner por esta operação'; END IF;
  UPDATE public.platform_staff SET enabled=p_enabled, updated_at=now()
  WHERE user_id=p_user_id AND role IN ('admin','user');
  IF NOT FOUND THEN RAISE EXCEPTION 'Operador não encontrado'; END IF;
  INSERT INTO public.platform_admin_audit(actor_user_id,target_user_id,action,details)
  VALUES(auth.uid(),p_user_id,CASE WHEN p_enabled THEN 'operator.enabled' ELSE 'operator.disabled' END,
    jsonb_build_object('enabled',p_enabled));
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.platform_staff_customers(p_search text DEFAULT NULL,p_limit int DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $fn$
DECLARE result jsonb;
BEGIN
  IF NOT public.platform_staff_has_permission('customers.read')
    THEN RAISE EXCEPTION 'Permissão customers.read necessária' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC),'[]'::jsonb)
  INTO result FROM (
    SELECT u.id AS user_id,u.email::text,u.created_at,
      count(a.id)::bigint AS account_count,
      count(a.id) FILTER (WHERE a.type='customer')::bigint AS pf_accounts,
      count(a.id) FILTER (WHERE a.type='merchant')::bigint AS pj_accounts
    FROM auth.users u JOIN public.accounts a ON a.user_id=u.id
    WHERE NOT EXISTS (SELECT 1 FROM public.platform_staff s WHERE s.user_id=u.id AND s.enabled)
      AND (p_search IS NULL OR u.email ILIKE '%' || p_search || '%' OR a.name ILIKE '%' || p_search || '%')
    GROUP BY u.id,u.email,u.created_at
    ORDER BY u.created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),200)
  ) c;
  RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.prevent_platform_staff_bank_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $fn$
BEGIN
  IF TG_OP='UPDATE' AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN RETURN NEW; END IF;
  IF NEW.user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.platform_staff s WHERE s.user_id=NEW.user_id AND s.enabled
  ) THEN
    RAISE EXCEPTION 'Operador da plataforma não pode possuir nova conta bancária fictícia' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_prevent_platform_staff_bank_account ON public.accounts;
CREATE TRIGGER trg_prevent_platform_staff_bank_account
BEFORE INSERT OR UPDATE OF user_id ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.prevent_platform_staff_bank_account();

REVOKE ALL ON FUNCTION public.platform_staff_me() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_staff_has_permission(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_staff_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_staff_save(text,text,text[],boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_staff_set_enabled(uuid,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_staff_customers(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_staff_me() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_staff_has_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_staff_list() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_staff_save(text,text,text[],boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_staff_set_enabled(uuid,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_staff_customers(text,integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_platform_staff_bank_account() FROM PUBLIC, anon, authenticated;
COMMIT;
