-- ==============================================================================
-- OPTMAPAY SANDBOX - PACOTE 01 HARDENING (MIGRATION 1)
-- 1. api_keys: Criptograficamente seguras, SHA-256 hash, account_id, escopos
-- 2. api_idempotency_keys: Idempotência server-side com hash e TTL
-- 3. Webhook Outbox: webhook_events, webhook_delivery_jobs, webhooks_log imutável
-- 4. webhooks_config: segredo derivado server-side, rotação obrigatória para legados
-- 5. Endurecimento de RLS em accounts, boletos e api_keys + RPC lookup_pix_recipient
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EVOLUÇÃO DA TABELA api_keys
-- ------------------------------------------------------------------------------

-- Adiciona novas colunas caso não existam
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS key_id TEXT,
  ADD COLUMN IF NOT EXISTS key_hash TEXT,
  ADD COLUMN IF NOT EXISTS key_prefix TEXT,
  ADD COLUMN IF NOT EXISTS key_last4 TEXT,
  ADD COLUMN IF NOT EXISTS scopes TEXT[] DEFAULT ARRAY['account:read', 'transactions:read', 'cards:charge', 'pix:transfer', 'refunds:create'],
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Torna api_key legada nullable
ALTER TABLE public.api_keys ALTER COLUMN api_key DROP NOT NULL;

-- Revoga chaves antigas com api_key em texto puro (não converte silenciosamente)
UPDATE public.api_keys
SET active = false,
    revoked_at = COALESCE(revoked_at, now()),
    api_key = NULL
WHERE api_key IS NOT NULL;

-- Garante índices únicos para key_id e key_hash
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_key_id_key') THEN
    ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_key_id_key UNIQUE (key_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_key_hash_key') THEN
    ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_api_keys_account_id ON public.api_keys(account_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON public.api_keys(active) WHERE active = true;

-- Políticas RLS estritas para api_keys: authenticated só pode consultar metadados de suas chaves
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_keys_select_policy" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_insert_policy" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_update_policy" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_delete_policy" ON public.api_keys;
DROP POLICY IF EXISTS "Acesso Total API Keys" ON public.api_keys;

CREATE POLICY "api_keys_select_policy" ON public.api_keys
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Somente service_role pode inserir/alterar/excluir chaves diretamente
-- As operações para usuários ocorrem via endpoints autenticados no servidor.


-- ------------------------------------------------------------------------------
-- 2. TABELA DE IDEMPOTÊNCIA: api_idempotency_keys
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
  response_status INTEGER,
  response_body JSONB,
  resource_type TEXT,
  resource_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
  CONSTRAINT uq_account_operation_idempotency UNIQUE (account_id, operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_lookup ON public.api_idempotency_keys(account_id, operation, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at ON public.api_idempotency_keys(expires_at);

ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;
-- Apenas service_role manipula chaves de idempotência
DROP POLICY IF EXISTS "idempotency_service_role_all" ON public.api_idempotency_keys;
CREATE POLICY "idempotency_service_role_all" ON public.api_idempotency_keys
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- 3. OUTBOX DE EVENTOS DE WEBHOOK
-- ------------------------------------------------------------------------------

-- 3.1. webhook_events: Eventos de negócio autoritativos gerados no backend
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_account_id ON public.webhook_events(account_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON public.webhook_events(created_at DESC);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_events_select_policy" ON public.webhook_events
  FOR SELECT TO authenticated
  USING (account_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid()));

CREATE POLICY "webhook_events_service_role_all" ON public.webhook_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- 3.2. webhook_delivery_jobs: Fila de jobs de entrega para cada webhook_config ativo
CREATE TABLE IF NOT EXISTS public.webhook_delivery_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.webhook_events(id) ON DELETE CASCADE,
  webhook_config_id UUID NOT NULL REFERENCES public.webhooks_config(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivering', 'retry', 'delivered', 'dead')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ DEFAULT now(),
  locked_at TIMESTAMPTZ,
  last_response_status INTEGER,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_event_webhook_config UNIQUE (event_id, webhook_config_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_jobs_status_next ON public.webhook_delivery_jobs(status, next_attempt_at)
  WHERE status IN ('pending', 'retry');
CREATE INDEX IF NOT EXISTS idx_delivery_jobs_webhook_config_id ON public.webhook_delivery_jobs(webhook_config_id);

ALTER TABLE public.webhook_delivery_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_delivery_jobs_select_policy" ON public.webhook_delivery_jobs
  FOR SELECT TO authenticated
  USING (webhook_config_id IN (
    SELECT id FROM public.webhooks_config WHERE account_id IN (
      SELECT id FROM public.accounts WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "webhook_delivery_jobs_service_role_all" ON public.webhook_delivery_jobs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- 3.3. Evolução de webhooks_log: Histórico imutável de cada tentativa individual
ALTER TABLE public.webhooks_log
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.webhook_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_job_id UUID REFERENCES public.webhook_delivery_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS attempt_no INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS request_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS is_manual_retry BOOLEAN NOT NULL DEFAULT false;

-- Desativa UPDATE e DELETE em webhooks_log para authenticated (garantia de log de auditoria imutável)
DROP POLICY IF EXISTS "webhooks_log_update_policy" ON public.webhooks_log;
DROP POLICY IF EXISTS "webhooks_log_delete_policy" ON public.webhooks_log;
DROP POLICY IF EXISTS "webhooks_log_insert_policy" ON public.webhooks_log;
DROP POLICY IF EXISTS "webhooks_log_select_policy" ON public.webhooks_log;

CREATE POLICY "webhooks_log_select_policy" ON public.webhooks_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR webhook_config_id IN (
    SELECT id FROM public.webhooks_config WHERE account_id IN (
      SELECT id FROM public.accounts WHERE user_id = auth.uid()
    )
  ));

-- Inserção de log apenas via service_role (backend/dispatcher)
CREATE POLICY "webhooks_log_service_role_all" ON public.webhooks_log
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- 4. EVOLUÇÃO DE webhooks_config (SEGREDO DERIVADO SERVER-SIDE)
-- ------------------------------------------------------------------------------
ALTER TABLE public.webhooks_config
  ADD COLUMN IF NOT EXISTS secret_salt TEXT,
  ADD COLUMN IF NOT EXISTS secret_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS secret_last4 TEXT,
  ADD COLUMN IF NOT EXISTS requires_secret_rotation BOOLEAN DEFAULT false;

ALTER TABLE public.webhooks_config ALTER COLUMN secret DROP NOT NULL;

-- Configurações legadas perdem o segredo plaintext e exigem rotação pelo DevPanel
UPDATE public.webhooks_config
SET secret = NULL,
    active = false,
    requires_secret_rotation = true
WHERE secret IS NOT NULL AND secret_salt IS NULL;

-- Políticas de RLS em webhooks_config
DROP POLICY IF EXISTS "webhooks_config_select_policy" ON public.webhooks_config;
DROP POLICY IF EXISTS "webhooks_config_insert_policy" ON public.webhooks_config;
DROP POLICY IF EXISTS "webhooks_config_update_policy" ON public.webhooks_config;
DROP POLICY IF EXISTS "webhooks_config_delete_policy" ON public.webhooks_config;

CREATE POLICY "webhooks_config_select_policy" ON public.webhooks_config
  FOR SELECT TO authenticated
  USING (account_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid()));

CREATE POLICY "webhooks_config_service_role_all" ON public.webhooks_config
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- 5. ENDURECIMENTO DE PERMISSÕES ADICIONAIS DA AUDITORIA
-- ------------------------------------------------------------------------------

-- 5.1. ACCOUNTS: Fechamento de SELECT * aberto
DROP POLICY IF EXISTS "accounts_select_policy" ON public.accounts;
CREATE POLICY "accounts_select_policy" ON public.accounts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 5.2. BOLETOS: Remoção de FOR UPDATE USING (true) WITH CHECK (true)
DROP POLICY IF EXISTS "boletos_update_policy" ON public.boletos;
CREATE POLICY "boletos_update_policy" ON public.boletos
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR account_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid()))
  WITH CHECK (auth.uid() = user_id OR account_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid()));

-- 5.3. RPC SEGURA PARA DESCOBERTA DE DESTINATÁRIO PIX (SEM SELECT * AMPLO)
CREATE OR REPLACE FUNCTION public.lookup_pix_recipient(
  p_pix_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account RECORD;
  v_clean_key TEXT;
BEGIN
  IF p_pix_key IS NULL OR TRIM(p_pix_key) = '' THEN
    RETURN jsonb_build_object('found', false, 'message', 'Chave Pix não informada.');
  END IF;

  v_clean_key := TRIM(p_pix_key);

  SELECT id, name, pix_key, type INTO v_account
  FROM public.accounts
  WHERE pix_key = v_clean_key
     OR pix_key ILIKE v_clean_key
     OR cpf_cnpj = v_clean_key
     OR cpf_cnpj = regexp_replace(v_clean_key, '[^0-9]', '', 'g')
     OR (v_clean_key ~ '^[0-9a-fA-F-]{36}$' AND id = v_clean_key::uuid)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'message', 'Destinatário não encontrado.');
  END IF;

  -- Expõe somente dados estritamente necessários para confirmação do pagamento
  RETURN jsonb_build_object(
    'found', true,
    'account_id', v_account.id,
    'name', v_account.name,
    'pix_key', v_account.pix_key,
    'type', v_account.type
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_pix_recipient(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lookup_pix_recipient(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.lookup_pix_recipient(TEXT) TO authenticated, service_role;
