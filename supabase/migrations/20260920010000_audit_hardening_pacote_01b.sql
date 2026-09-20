-- ==============================================================================
-- OPTMAPAY SANDBOX - PACOTE 01B: CORREÇÕES OBRIGATÓRIAS PÓS-AUDITORIA
-- 1. Eliminação definitiva de overloads de process_card_payment e transfer_pix
-- 2. Privilégios de RPC explícitos: REVOKE FROM PUBLIC/anon, GRANT service_role
-- 3. Idempotência estrita: INSERT ON CONFLICT DO NOTHING, actor_user_id, sem UUID zero
-- 4. Matriz oficial de taxas MDR unificada com src/lib/cardRules.ts
-- 5. Claim atômico de webhooks unificado para workers e retries com detecção de locks expirados
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. AJUSTES NO SCHEMA DE IDEMPOTÊNCIA E JOBS DE WEBHOOK
-- ------------------------------------------------------------------------------

-- Permitir api_key_id nulo para operações executadas por usuários (ex: Pix no dashboard)
ALTER TABLE public.api_idempotency_keys ALTER COLUMN api_key_id DROP NOT NULL;

-- Adicionar actor_user_id para identificar operações autenticadas por usuário sem FK fictício
ALTER TABLE public.api_idempotency_keys ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Garantir coluna locked_by na tabela webhook_delivery_jobs
ALTER TABLE public.webhook_delivery_jobs ADD COLUMN IF NOT EXISTS locked_by TEXT;

-- ------------------------------------------------------------------------------
-- 2. ELIMINAÇÃO DEFINITIVA DE OVERLOADS INSEGUROS
-- ------------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Remove todas as variantes históricas de process_card_payment
  FOR r IN (
    SELECT oid::regprocedure AS func_signature
    FROM pg_proc
    WHERE proname = 'process_card_payment'
      AND pronamespace = 'public'::regnamespace
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;

  -- Remove todas as variantes históricas de transfer_pix
  FOR r IN (
    SELECT oid::regprocedure AS func_signature
    FROM pg_proc
    WHERE proname = 'transfer_pix'
      AND pronamespace = 'public'::regnamespace
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;

  -- Remove todas as variantes de claim_webhook_delivery_jobs
  FOR r IN (
    SELECT oid::regprocedure AS func_signature
    FROM pg_proc
    WHERE proname = 'claim_webhook_delivery_jobs'
      AND pronamespace = 'public'::regnamespace
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
  END LOOP;
END $$;


-- ------------------------------------------------------------------------------
-- 3. RPC: claim_webhook_delivery_jobs (Atômico, com recuperação de locks expirados)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_webhook_delivery_jobs(
  p_limit INTEGER DEFAULT 50,
  p_locked_by TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  event_id UUID,
  webhook_config_id UUID,
  attempt_count INTEGER,
  status TEXT,
  locked_at TIMESTAMPTZ,
  locked_by TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT j.id
    FROM public.webhook_delivery_jobs j
    WHERE (
      j.status IN ('pending', 'retry') AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= now())
    ) OR (
      j.status = 'delivering' AND j.locked_at IS NOT NULL AND j.locked_at < (now() - INTERVAL '5 minutes')
    )
    ORDER BY j.next_attempt_at ASC NULLS FIRST
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.webhook_delivery_jobs upd
  SET status = 'delivering',
      locked_at = now(),
      locked_by = p_locked_by,
      updated_at = now()
  FROM eligible
  WHERE upd.id = eligible.id
  RETURNING upd.id, upd.event_id, upd.webhook_config_id, upd.attempt_count, upd.status, upd.locked_at, upd.locked_by;
END;
$$;

-- Privilégios explícitos: apenas service_role pode fazer claim de jobs
REVOKE ALL ON FUNCTION public.claim_webhook_delivery_jobs(INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_webhook_delivery_jobs(INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webhook_delivery_jobs(INTEGER, TEXT) TO service_role;


-- ------------------------------------------------------------------------------
-- 4. RPC: claim_single_webhook_job (Claim atômico para despachos imediatos e retries manuais)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_single_webhook_job(
  p_job_id UUID,
  p_locked_by TEXT DEFAULT NULL,
  p_force_retry BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  event_id UUID,
  webhook_config_id UUID,
  attempt_count INTEGER,
  status TEXT,
  locked_at TIMESTAMPTZ,
  locked_by TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT j.id
    FROM public.webhook_delivery_jobs j
    WHERE j.id = p_job_id
      AND (
        p_force_retry = true
        OR j.status IN ('pending', 'retry')
        OR (j.status = 'delivering' AND j.locked_at IS NOT NULL AND j.locked_at < (now() - INTERVAL '5 minutes'))
      )
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.webhook_delivery_jobs upd
  SET status = 'delivering',
      locked_at = now(),
      locked_by = p_locked_by,
      updated_at = now()
  FROM eligible
  WHERE upd.id = eligible.id
  RETURNING upd.id, upd.event_id, upd.webhook_config_id, upd.attempt_count, upd.status, upd.locked_at, upd.locked_by;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_single_webhook_job(UUID, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_single_webhook_job(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_single_webhook_job(UUID, TEXT, BOOLEAN) TO service_role;


-- ------------------------------------------------------------------------------
-- 5. RPC AUTORITATIVA: process_card_payment
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_card_payment(
  p_merchant_account_id UUID,
  p_card_id UUID DEFAULT NULL,
  p_card_number TEXT DEFAULT NULL,
  p_cardholder_name TEXT DEFAULT 'CLIENTE SANDBOX',
  p_validade TEXT DEFAULT NULL,
  p_cvv TEXT DEFAULT NULL,
  p_amount NUMERIC DEFAULT 0,
  p_tipo TEXT DEFAULT 'credito',
  p_installments INTEGER DEFAULT 1,
  p_plan TEXT DEFAULT 'standard',
  p_description TEXT DEFAULT 'Pagamento com Cartao Sandbox',
  p_external_reference TEXT DEFAULT NULL,
  p_api_key_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_request_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gross_amount NUMERIC;
  v_fee_percent NUMERIC;
  v_fee_amount NUMERIC;
  v_net_amount NUMERIC;
  v_effective_plan TEXT;
  v_installments INTEGER;
  v_clean_card_number TEXT;
  v_card_record RECORD;
  v_payer_account_id UUID;
  v_payer_balance NUMERIC;
  v_merchant_balance NUMERIC;
  v_payer_name TEXT;
  v_merchant_name TEXT;
  v_auth_code TEXT;
  v_nsu TEXT;
  v_tid TEXT;
  v_tx_out_id UUID;
  v_tx_in_id UUID;
  v_event_id UUID;
  v_exp_month INTEGER;
  v_exp_year INTEGER;
  v_current_month INTEGER;
  v_current_year INTEGER;
  v_response_json JSONB;
  v_idemp_id UUID;
  v_existing_idemp RECORD;
  v_cfg RECORD;
BEGIN
  -- 1. VALIDAÇÃO E CLAIM ATÔMICO DE IDEMPOTÊNCIA NO SQL
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
    IF p_request_hash IS NULL OR trim(p_request_hash) = '' THEN
      RAISE EXCEPTION 'p_request_hash obrigatorio quando p_idempotency_key e informada.';
    END IF;

    -- Concorrência estrita: INSERT ... ON CONFLICT DO NOTHING
    INSERT INTO public.api_idempotency_keys (
      account_id,
      api_key_id,
      operation,
      idempotency_key,
      request_hash,
      status,
      created_at,
      expires_at
    ) VALUES (
      p_merchant_account_id,
      p_api_key_id,
      'cards:charge',
      trim(p_idempotency_key),
      trim(p_request_hash),
      'in_progress',
      now(),
      now() + INTERVAL '24 hours'
    )
    ON CONFLICT (account_id, operation, idempotency_key) DO NOTHING
    RETURNING id INTO v_idemp_id;

    -- Se não inseriu linha, outro processo venceu o claim ou a chave já existe
    IF v_idemp_id IS NULL THEN
      SELECT * INTO v_existing_idemp
      FROM public.api_idempotency_keys
      WHERE account_id = p_merchant_account_id
        AND operation = 'cards:charge'
        AND idempotency_key = trim(p_idempotency_key);

      IF FOUND THEN
        -- Reuso com payload diferente -> Conflito 409
        IF v_existing_idemp.request_hash <> trim(p_request_hash) THEN
          RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED: Esta chave ja foi utilizada com parametros diferentes.';
        END IF;

        -- Concluída com sucesso -> Devolve cache persistido
        IF v_existing_idemp.status = 'completed' AND v_existing_idemp.response_body IS NOT NULL THEN
          RETURN jsonb_set(
            v_existing_idemp.response_body,
            '{from_cache}',
            'true'::jsonb
          );
        END IF;

        -- Concorrente em processamento -> Conflito 409
        IF v_existing_idemp.status = 'in_progress' THEN
          RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS: Requisicao concorrente em andamento para esta chave.';
        END IF;
      END IF;
    END IF;
  END IF;

  -- 2. VALIDAÇÃO DE ENTRADA E PRECISÃO FINANCEIRA
  v_gross_amount := round(p_amount, 2);
  IF v_gross_amount <= 0 THEN
    RAISE EXCEPTION 'O valor da venda (amount) deve ser maior que zero.';
  END IF;

  IF p_tipo NOT IN ('credito', 'debito') THEN
    RAISE EXCEPTION 'Tipo de cartao invalido. Aceito apenas debito ou credito.';
  END IF;

  v_installments := COALESCE(p_installments, 1);
  IF p_tipo = 'debito' AND v_installments <> 1 THEN
    RAISE EXCEPTION 'Vendas no debito nao permitem parcelamento (installments deve ser 1).';
  END IF;

  IF v_installments < 1 OR v_installments > 12 THEN
    RAISE EXCEPTION 'Numero de parcelas invalido (deve ser entre 1 e 12).';
  END IF;

  -- 3. PLANO EFETIVO E MATRIZ OFICIAL DE TAXAS MDR (Unificada com cardRules.ts)
  IF p_tipo = 'debito' THEN
    IF p_plan IN ('ontime', 'nitro') THEN
      v_effective_plan := 'ontime';
      v_fee_percent := 1.99;
    ELSE
      v_effective_plan := 'standard';
      v_fee_percent := 0.85;
    END IF;
  ELSE
    -- Crédito
    v_effective_plan := COALESCE(p_plan, 'standard');
    IF v_effective_plan = 'due_date' THEN
      v_fee_percent := 2.601;
    ELSIF v_effective_plan IN ('ontime', 'nitro') THEN
      CASE v_installments
        WHEN 1 THEN v_fee_percent := 5.99;
        WHEN 2 THEN v_fee_percent := 11.39;
        WHEN 3 THEN v_fee_percent := 12.49;
        WHEN 4 THEN v_fee_percent := 13.09;
        WHEN 5 THEN v_fee_percent := 13.79;
        WHEN 6 THEN v_fee_percent := 14.49;
        WHEN 7 THEN v_fee_percent := 15.49;
        WHEN 8 THEN v_fee_percent := 16.09;
        WHEN 9 THEN v_fee_percent := 16.69;
        WHEN 10 THEN v_fee_percent := 17.39;
        WHEN 11 THEN v_fee_percent := 18.39;
        WHEN 12 THEN v_fee_percent := 18.79;
        ELSE v_fee_percent := 5.99;
      END CASE;
    ELSIF v_effective_plan = 'd7' THEN
      CASE v_installments
        WHEN 1 THEN v_fee_percent := 2.8033;
        WHEN 2 THEN v_fee_percent := 4.0934;
        WHEN 3 THEN v_fee_percent := 4.6851;
        WHEN 4 THEN v_fee_percent := 5.2768;
        WHEN 5 THEN v_fee_percent := 5.8685;
        WHEN 6 THEN v_fee_percent := 6.4408;
        WHEN 7 THEN v_fee_percent := 7.0228;
        WHEN 8 THEN v_fee_percent := 7.5854;
        WHEN 9 THEN v_fee_percent := 8.1577;
        WHEN 10 THEN v_fee_percent := 8.7106;
        WHEN 11 THEN v_fee_percent := 9.2732;
        WHEN 12 THEN v_fee_percent := 9.8164;
        ELSE v_fee_percent := 2.8033;
      END CASE;
    ELSIF v_effective_plan = 'd15' THEN
      CASE v_installments
        WHEN 1 THEN v_fee_percent := 2.7455;
        WHEN 2 THEN v_fee_percent := 4.0090;
        WHEN 3 THEN v_fee_percent := 4.5885;
        WHEN 4 THEN v_fee_percent := 5.1680;
        WHEN 5 THEN v_fee_percent := 5.7475;
        WHEN 6 THEN v_fee_percent := 6.3080;
        WHEN 7 THEN v_fee_percent := 6.8780;
        WHEN 8 THEN v_fee_percent := 7.4290;
        WHEN 9 THEN v_fee_percent := 7.9895;
        WHEN 10 THEN v_fee_percent := 8.5310;
        WHEN 11 THEN v_fee_percent := 9.0820;
        WHEN 12 THEN v_fee_percent := 9.6140;
        ELSE v_fee_percent := 2.7455;
      END CASE;
    ELSE
      -- Padrão D+1 ('standard' / 'd1')
      v_effective_plan := 'standard';
      CASE v_installments
        WHEN 1 THEN v_fee_percent := 2.89;
        WHEN 2 THEN v_fee_percent := 4.22;
        WHEN 3 THEN v_fee_percent := 4.83;
        WHEN 4 THEN v_fee_percent := 5.44;
        WHEN 5 THEN v_fee_percent := 6.05;
        WHEN 6 THEN v_fee_percent := 6.64;
        WHEN 7 THEN v_fee_percent := 7.24;
        WHEN 8 THEN v_fee_percent := 7.82;
        WHEN 9 THEN v_fee_percent := 8.41;
        WHEN 10 THEN v_fee_percent := 8.98;
        WHEN 11 THEN v_fee_percent := 9.56;
        WHEN 12 THEN v_fee_percent := 10.12;
        ELSE v_fee_percent := 2.89;
      END CASE;
    END IF;
  END IF;

  -- Cálculo autoritativo e invariante matemático: net = gross - fee (impossível net > gross)
  v_fee_amount := round((v_gross_amount * (v_fee_percent / 100.0)), 2);
  v_net_amount := greatest(0.00, round((v_gross_amount - v_fee_amount), 2));

  -- 4. LOCALIZAÇÃO E VALIDAÇÃO ESTREITA DO CARTÃO
  v_clean_card_number := regexp_replace(COALESCE(p_card_number, ''), '\D', '', 'g');

  IF p_card_id IS NOT NULL THEN
    SELECT * INTO v_card_record
    FROM public.sandbox_cards
    WHERE id = p_card_id AND active = true;
  ELSIF v_clean_card_number <> '' THEN
    SELECT * INTO v_card_record
    FROM public.sandbox_cards
    WHERE card_number = v_clean_card_number AND active = true;
  ELSE
    RAISE EXCEPTION 'Identificacao do cartao ausente (forneca card_id ou card_number completo).';
  END IF;

  IF v_card_record IS NULL THEN
    RAISE EXCEPTION 'Cartao nao encontrado, bloqueado ou inativo no Sandbox.';
  END IF;

  -- Validação obrigatória de CVV
  IF p_cvv IS NULL OR trim(p_cvv) = '' OR NOT (trim(p_cvv) ~ '^\d{3,4}$') THEN
    RAISE EXCEPTION 'Codigo de seguranca (CVV) invalido ou ausente.';
  END IF;

  IF v_card_record.cvv IS NOT NULL AND trim(v_card_record.cvv) <> '' AND trim(v_card_record.cvv) <> trim(p_cvv) THEN
    RAISE EXCEPTION 'Codigo de seguranca (CVV) incorreto.';
  END IF;

  -- Validação obrigatória de data de validade (MM/AA)
  IF p_validade IS NULL OR NOT (trim(p_validade) ~ '^(0[1-9]|1[0-2])\/([0-9]{2})$') THEN
    RAISE EXCEPTION 'Data de validade invalida. Formato exigido: MM/AA.';
  END IF;

  v_exp_month := substring(trim(p_validade) from 1 for 2)::INTEGER;
  v_exp_year  := 2000 + substring(trim(p_validade) from 4 for 2)::INTEGER;
  v_current_month := EXTRACT(MONTH FROM now())::INTEGER;
  v_current_year  := EXTRACT(YEAR FROM now())::INTEGER;

  IF v_exp_year < v_current_year OR (v_exp_year = v_current_year AND v_exp_month < v_current_month) THEN
    RAISE EXCEPTION 'Cartao vencido/expirado.';
  END IF;

  -- 5. VALIDAÇÃO DE SALDO E CONTAS
  v_payer_account_id := v_card_record.account_id;
  IF v_payer_account_id = p_merchant_account_id THEN
    RAISE EXCEPTION 'Transacao recusada: a conta de origem nao pode ser igual a conta de destino.';
  END IF;

  SELECT balance, name INTO v_payer_balance, v_payer_name
  FROM public.accounts
  WHERE id = v_payer_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta do portador do cartao nao encontrada.';
  END IF;

  SELECT balance, name INTO v_merchant_balance, v_merchant_name
  FROM public.accounts
  WHERE id = p_merchant_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta do estabelecimento recebedor nao encontrada.';
  END IF;

  IF p_tipo = 'debito' THEN
    IF v_payer_balance < v_gross_amount THEN
      RAISE EXCEPTION 'Saldo insuficiente na conta do titular para transacao de debito.';
    END IF;
  ELSE
    IF v_card_record.credit_limit IS NOT NULL AND v_card_record.credit_used IS NOT NULL THEN
      IF (v_card_record.credit_limit - v_card_record.credit_used) < v_gross_amount THEN
        RAISE EXCEPTION 'Limite de credito insuficiente no cartao.';
      END IF;
    END IF;
  END IF;

  -- 6. MOVIMENTAÇÃO CONTÁBIL ATÔMICA
  v_auth_code := substring(md5(random()::text) from 1 for 6);
  v_nsu       := lpad((floor(random() * 900000 + 100000))::text, 6, '0');
  v_tid       := 'TID' || to_char(now(), 'YYYYMMDDHH24MISS') || lpad((floor(random() * 9000 + 1000))::text, 4, '0');

  IF p_tipo = 'debito' THEN
    -- Débito imediato na conta do portador
    UPDATE public.accounts
    SET balance = balance - v_gross_amount
    WHERE id = v_payer_account_id;

    -- Crédito do valor líquido no merchant
    UPDATE public.accounts
    SET balance = balance + v_net_amount
    WHERE id = p_merchant_account_id;
  ELSE
    -- Crédito: atualiza limite utilizado do cartão
    UPDATE public.sandbox_cards
    SET credit_used = COALESCE(credit_used, 0) + v_gross_amount
    WHERE id = v_card_record.id;

    -- No OnTime o crédito do lojista é imediato
    IF v_effective_plan = 'ontime' THEN
      UPDATE public.accounts
      SET balance = balance + v_net_amount
      WHERE id = p_merchant_account_id;
    END IF;
  END IF;

  -- Registra lançamentos no extrato (transactions)
  INSERT INTO public.transactions (
    account_id,
    type,
    amount,
    description,
    balance_after,
    created_at
  ) VALUES (
    v_payer_account_id,
    'card_payment',
    -v_gross_amount,
    COALESCE(p_description, 'Compra Cartao Sandbox') || ' (Doc: ' || v_nsu || ')',
    (SELECT balance FROM public.accounts WHERE id = v_payer_account_id),
    now()
  ) RETURNING id INTO v_tx_out_id;

  INSERT INTO public.transactions (
    account_id,
    type,
    amount,
    description,
    balance_after,
    created_at
  ) VALUES (
    p_merchant_account_id,
    'card_settlement',
    v_net_amount,
    COALESCE(p_description, 'Recebimento Venda Cartao') || ' (Doc: ' || v_nsu || ')',
    (SELECT balance FROM public.accounts WHERE id = p_merchant_account_id),
    now()
  ) RETURNING id INTO v_tx_in_id;

  -- 7. EVENTO DE OUTBOX E ENFILEIRAMENTO ATÔMICO DE JOBS
  INSERT INTO public.webhook_events (
    account_id,
    event_type,
    resource_type,
    resource_id,
    idempotency_key,
    payload,
    occurred_at,
    created_at
  ) VALUES (
    p_merchant_account_id,
    'card.paid',
    'transaction',
    v_tx_in_id::text,
    'card_paid_' || v_tx_in_id::text,
    jsonb_build_object(
      'event', 'card.paid',
      'transactionId', v_tx_in_id,
      'orderId', p_external_reference,
      'amountGross', v_gross_amount,
      'amountNet', v_net_amount,
      'feePercent', v_fee_percent,
      'feeAmount', v_fee_amount,
      'installments', v_installments,
      'settlementPlan', v_effective_plan,
      'tipo', p_tipo,
      'nsu', v_nsu,
      'tid', v_tid,
      'authorizationCode', v_auth_code,
      'realMoney', false,
      'environment', 'sandbox',
      'occurredAt', now()
    ),
    now(),
    now()
  ) RETURNING id INTO v_event_id;

  FOR v_cfg IN
    SELECT id FROM public.webhooks_config
    WHERE account_id = p_merchant_account_id AND active = true
  LOOP
    INSERT INTO public.webhook_delivery_jobs (
      event_id,
      webhook_config_id,
      status,
      attempt_count,
      next_attempt_at
    ) VALUES (
      v_event_id,
      v_cfg.id,
      'pending',
      0,
      now()
    ) ON CONFLICT (event_id, webhook_config_id) DO NOTHING;
  END LOOP;

  -- 8. MONTAGEM DA RESPOSTA CANÔNICA ALINHADA (gross_amount + amount_gross)
  v_response_json := jsonb_build_object(
    'success', true,
    'message', 'Transacao autorizada com sucesso no OptmaPay Sandbox!',
    'status', 'approved',
    'transaction_in_id', v_tx_in_id,
    'transaction_out_id', v_tx_out_id,
    'transactionId', v_tx_in_id,
    'amount_gross', v_gross_amount,
    'gross_amount', v_gross_amount,
    'amountGross', v_gross_amount,
    'fee_percent', v_fee_percent,
    'feePercent', v_fee_percent,
    'fee_amount', v_fee_amount,
    'feeAmount', v_fee_amount,
    'amount_net', v_net_amount,
    'net_amount', v_net_amount,
    'amountNet', v_net_amount,
    'installments', v_installments,
    'tipo', p_tipo,
    'settlement_plan', v_effective_plan,
    'plan', v_effective_plan,
    'settlementPlan', v_effective_plan,
    'card_masked', '•••• ' || right(v_card_record.card_number, 4),
    'cardMasked', '•••• ' || right(v_card_record.card_number, 4),
    'card_brand', 'OptmaCard',
    'cardBrand', 'OptmaCard',
    'cardholder_name', COALESCE(p_cardholder_name, 'CLIENTE SANDBOX'),
    'authorization_code', v_auth_code,
    'authorizationCode', v_auth_code,
    'nsu', v_nsu,
    'tid', v_tid,
    'webhook_event_id', v_event_id,
    'webhookEventId', v_event_id,
    'order_id', p_external_reference,
    'orderId', p_external_reference,
    'created_at', now(),
    'real_money', false,
    'environment', 'sandbox'
  );

  -- 9. FINALIZAÇÃO DA IDEMPOTÊNCIA NA MESMA TRANSAÇÃO POSTGRESQL
  IF v_idemp_id IS NOT NULL THEN
    UPDATE public.api_idempotency_keys
    SET status = 'completed',
        response_status = 200,
        response_body = v_response_json,
        resource_type = 'transaction',
        resource_id = v_tx_in_id::text
    WHERE id = v_idemp_id;
  END IF;

  RETURN v_response_json;
END;
$$;

-- Privilégios explícitos para process_card_payment
REVOKE ALL ON FUNCTION public.process_card_payment(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, INTEGER, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_card_payment(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, INTEGER, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_card_payment(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, INTEGER, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 6. RPC AUTORITATIVA: transfer_pix
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transfer_pix(
  p_sender_account_id UUID,
  p_receiver_pix_key TEXT,
  p_amount NUMERIC,
  p_description TEXT DEFAULT 'Transferencia Pix Sandbox',
  p_external_reference TEXT DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_request_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender_balance NUMERIC;
  v_sender_name TEXT;
  v_sender_user_id UUID;
  v_receiver_account_id UUID;
  v_receiver_name TEXT;
  v_tx_out_id UUID;
  v_tx_in_id UUID;
  v_event_id UUID;
  v_idemp_id UUID;
  v_existing_idemp RECORD;
  v_response_json JSONB;
  v_cfg RECORD;
  v_clean_key TEXT;
BEGIN
  -- 1. VALIDAÇÃO E CLAIM ATÔMICO DE IDEMPOTÊNCIA NO SQL
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
    IF p_request_hash IS NULL OR trim(p_request_hash) = '' THEN
      RAISE EXCEPTION 'p_request_hash obrigatorio quando p_idempotency_key e informada.';
    END IF;

    INSERT INTO public.api_idempotency_keys (
      account_id,
      actor_user_id,
      api_key_id,
      operation,
      idempotency_key,
      request_hash,
      status,
      created_at,
      expires_at
    ) VALUES (
      p_sender_account_id,
      p_actor_user_id,
      NULL,
      'pix:transfer',
      trim(p_idempotency_key),
      trim(p_request_hash),
      'in_progress',
      now(),
      now() + INTERVAL '24 hours'
    )
    ON CONFLICT (account_id, operation, idempotency_key) DO NOTHING
    RETURNING id INTO v_idemp_id;

    IF v_idemp_id IS NULL THEN
      SELECT * INTO v_existing_idemp
      FROM public.api_idempotency_keys
      WHERE account_id = p_sender_account_id
        AND operation = 'pix:transfer'
        AND idempotency_key = trim(p_idempotency_key);

      IF FOUND THEN
        IF v_existing_idemp.request_hash <> trim(p_request_hash) THEN
          RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED: Esta chave Pix ja foi utilizada com parametros diferentes.';
        END IF;

        IF v_existing_idemp.status = 'completed' AND v_existing_idemp.response_body IS NOT NULL THEN
          RETURN jsonb_set(
            v_existing_idemp.response_body,
            '{from_cache}',
            'true'::jsonb
          );
        END IF;

        IF v_existing_idemp.status = 'in_progress' THEN
          RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS: Transferencia Pix com esta chave ja esta em andamento.';
        END IF;
      END IF;
    END IF;
  END IF;

  -- 2. VALIDAÇÃO DE VALORES E CONTAS
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor da transferencia deve ser maior que zero.';
  END IF;

  SELECT balance, name, user_id INTO v_sender_balance, v_sender_name, v_sender_user_id
  FROM public.accounts
  WHERE id = p_sender_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta de origem nao encontrada.';
  END IF;

  IF v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente na conta de origem.';
  END IF;

  v_clean_key := trim(p_receiver_pix_key);

  -- Localiza a conta de destino por ID ou por Chave Pix
  IF v_clean_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id, name INTO v_receiver_account_id, v_receiver_name
    FROM public.accounts
    WHERE id = v_clean_key::UUID
    FOR UPDATE;
  END IF;

  IF v_receiver_account_id IS NULL THEN
    SELECT id, name INTO v_receiver_account_id, v_receiver_name
    FROM public.accounts
    WHERE lower(pix_key) = lower(v_clean_key)
    FOR UPDATE;
  END IF;

  IF v_receiver_account_id IS NULL THEN
    RAISE EXCEPTION 'Chave Pix ou conta de destino nao encontrada no Sandbox.';
  END IF;

  IF v_receiver_account_id = p_sender_account_id THEN
    RAISE EXCEPTION 'Nao e permitido transferir Pix para a mesma conta.';
  END IF;

  -- 3. MOVIMENTAÇÃO CONTÁBIL ATÔMICA
  UPDATE public.accounts
  SET balance = balance - p_amount
  WHERE id = p_sender_account_id;

  UPDATE public.accounts
  SET balance = balance + p_amount
  WHERE id = v_receiver_account_id;

  INSERT INTO public.transactions (
    account_id,
    type,
    amount,
    description,
    balance_after,
    created_at
  ) VALUES (
    p_sender_account_id,
    'pix_out',
    -p_amount,
    COALESCE(p_description, 'Transferencia Pix Enviada') || ' para ' || v_receiver_name || COALESCE(' (Ref: ' || p_external_reference || ')', ''),
    (SELECT balance FROM public.accounts WHERE id = p_sender_account_id),
    now()
  ) RETURNING id INTO v_tx_out_id;

  INSERT INTO public.transactions (
    account_id,
    type,
    amount,
    description,
    balance_after,
    created_at
  ) VALUES (
    v_receiver_account_id,
    'pix_in',
    p_amount,
    COALESCE(p_description, 'Transferencia Pix Recebida') || ' de ' || v_sender_name || COALESCE(' (Ref: ' || p_external_reference || ')', ''),
    (SELECT balance FROM public.accounts WHERE id = v_receiver_account_id),
    now()
  ) RETURNING id INTO v_tx_in_id;

  -- 4. EVENTO DE OUTBOX E JOBS DE ENTREGA
  INSERT INTO public.webhook_events (
    account_id,
    event_type,
    resource_type,
    resource_id,
    idempotency_key,
    payload,
    occurred_at,
    created_at
  ) VALUES (
    v_receiver_account_id,
    'pix.paid',
    'transaction',
    v_tx_in_id::text,
    'pix_paid_' || v_tx_in_id::text,
    jsonb_build_object(
      'event', 'pix.paid',
      'transactionId', v_tx_in_id,
      'senderAccountId', p_sender_account_id,
      'receiverAccountId', v_receiver_account_id,
      'senderName', v_sender_name,
      'receiverName', v_receiver_name,
      'amount', p_amount,
      'orderId', p_external_reference,
      'externalReference', p_external_reference,
      'realMoney', false,
      'environment', 'sandbox',
      'occurredAt', now()
    ),
    now(),
    now()
  ) RETURNING id INTO v_event_id;

  FOR v_cfg IN
    SELECT id FROM public.webhooks_config
    WHERE account_id = v_receiver_account_id AND active = true
  LOOP
    INSERT INTO public.webhook_delivery_jobs (
      event_id,
      webhook_config_id,
      status,
      attempt_count,
      next_attempt_at
    ) VALUES (
      v_event_id,
      v_cfg.id,
      'pending',
      0,
      now()
    ) ON CONFLICT (event_id, webhook_config_id) DO NOTHING;
  END LOOP;

  -- 5. RESPOSTA CANÔNICA
  v_response_json := jsonb_build_object(
    'success', true,
    'message', 'Transferencia Pix concluida com sucesso!',
    'amount', p_amount,
    'sender_name', v_sender_name,
    'senderName', v_sender_name,
    'receiver_name', v_receiver_name,
    'receiverName', v_receiver_name,
    'sender_account_id', p_sender_account_id,
    'senderAccountId', p_sender_account_id,
    'receiver_account_id', v_receiver_account_id,
    'receiverAccountId', v_receiver_account_id,
    'transaction_out_id', v_tx_out_id,
    'transactionOutId', v_tx_out_id,
    'transaction_in_id', v_tx_in_id,
    'transactionInId', v_tx_in_id,
    'webhook_event_id', v_event_id,
    'webhookEventId', v_event_id,
    'external_reference', p_external_reference,
    'externalReference', p_external_reference,
    'created_at', now(),
    'real_money', false,
    'environment', 'sandbox'
  );

  -- 6. FINALIZAÇÃO DA IDEMPOTÊNCIA NA MESMA TRANSAÇÃO
  IF v_idemp_id IS NOT NULL THEN
    UPDATE public.api_idempotency_keys
    SET status = 'completed',
        response_status = 200,
        response_body = v_response_json,
        resource_type = 'transaction',
        resource_id = v_tx_in_id::text
    WHERE id = v_idemp_id;
  END IF;

  RETURN v_response_json;
END;
$$;

-- Privilégios explícitos para transfer_pix
REVOKE ALL ON FUNCTION public.transfer_pix(UUID, TEXT, NUMERIC, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transfer_pix(UUID, TEXT, NUMERIC, TEXT, TEXT, UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.transfer_pix(UUID, TEXT, NUMERIC, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;
