-- ==============================================================================
-- OPTMAPAY SANDBOX - PACOTE 01 HARDENING (MIGRATION 3)
-- Permissões seguras para criação/rotação de chaves e webhooks pelo DevPanel
-- ==============================================================================

-- 1. Políticas RLS para api_keys (o usuário autenticado pode gerenciar suas próprias chaves)
DROP POLICY IF EXISTS "api_keys_insert_policy" ON public.api_keys;
CREATE POLICY "api_keys_insert_policy" ON public.api_keys
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "api_keys_update_policy" ON public.api_keys;
CREATE POLICY "api_keys_update_policy" ON public.api_keys
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Políticas RLS para webhooks_config (o usuário autenticado pode cadastrar/alterar seus endpoints)
DROP POLICY IF EXISTS "webhooks_config_insert_policy" ON public.webhooks_config;
CREATE POLICY "webhooks_config_insert_policy" ON public.webhooks_config
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "webhooks_config_update_policy" ON public.webhooks_config;
CREATE POLICY "webhooks_config_update_policy" ON public.webhooks_config
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. RPC SEGURA: create_sandbox_api_key
CREATE OR REPLACE FUNCTION public.create_sandbox_api_key(
  p_account_id UUID,
  p_key_name TEXT,
  p_key_id TEXT,
  p_key_hash TEXT,
  p_key_prefix TEXT,
  p_key_last4 TEXT,
  p_scopes TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted_id UUID;
  v_created_at TIMESTAMPTZ;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'Usuário não autenticado.');
  END IF;

  -- Valida se a conta pertence ao usuário autenticado
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts WHERE id = p_account_id AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ACCOUNT', 'message', 'A conta indicada não pertence ao usuário autenticado.');
  END IF;

  INSERT INTO public.api_keys (
    user_id,
    account_id,
    key_name,
    key_id,
    key_hash,
    key_prefix,
    key_last4,
    scopes,
    active,
    created_by
  ) VALUES (
    v_user_id,
    p_account_id,
    COALESCE(NULLIF(TRIM(p_key_name), ''), 'Chave Sandbox API'),
    p_key_id,
    p_key_hash,
    p_key_prefix,
    p_key_last4,
    p_scopes,
    true,
    v_user_id
  )
  RETURNING id, created_at INTO v_inserted_id, v_created_at;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_inserted_id,
    'created_at', v_created_at
  );
END;
$$;

-- 4. RPC SEGURA: revoke_sandbox_api_key
CREATE OR REPLACE FUNCTION public.revoke_sandbox_api_key(
  p_key_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  UPDATE public.api_keys
  SET active = false, revoked_at = now()
  WHERE id = p_key_id AND user_id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$;
