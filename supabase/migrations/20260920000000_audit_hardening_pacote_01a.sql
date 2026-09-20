-- ==============================================================================
-- OPTMAPAY SANDBOX - PACOTE 01A: CORREÇÕES OBRIGATÓRIAS PÓS-AUDITORIA
-- 1. Fechamento definitivo da RLS de credenciais (sem escrita por authenticated)
-- 2. process_card_payment autoritativo: MDR calculado em banco, impossível net > gross,
--    sem busca por 4 dígitos, validação obrigatória de CVV e validade, idempotência em SQL
-- 3. transfer_pix com suporte a idempotência transacional em SQL
-- 4. claim atômico de jobs de webhook com FOR UPDATE SKIP LOCKED
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FECHAMENTO DE POLÍTICAS RLS E RPCS DE CREDENCIAIS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "api_keys_insert_policy" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_update_policy" ON public.api_keys;
DROP POLICY IF EXISTS "webhooks_config_insert_policy" ON public.webhooks_config;
DROP POLICY IF EXISTS "webhooks_config_update_policy" ON public.webhooks_config;

-- Revoga RPCs públicas que permitiam ao cliente injetar metadados criptográficos
DROP FUNCTION IF EXISTS public.create_sandbox_api_key(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]);
DROP FUNCTION IF EXISTS public.revoke_sandbox_api_key(UUID);

-- Garante que somente service_role pode escrever em api_keys e webhooks_config
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks_config ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. CLAIM ATÔMICO DE JOBS DE WEBHOOK (FOR UPDATE SKIP LOCKED)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_webhook_delivery_jobs(
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  event_id UUID,
  webhook_config_id UUID,
  attempt_count INTEGER,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH locked_jobs AS (
    SELECT j.id
    FROM public.webhook_delivery_jobs j
    WHERE j.status IN ('pending', 'retry')
      AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= now())
      AND (j.locked_at IS NULL OR j.locked_at < now() - INTERVAL '5 minutes')
    ORDER BY j.next_attempt_at ASC NULLS FIRST
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.webhook_delivery_jobs j
  SET status = 'delivering',
      locked_at = now(),
      updated_at = now()
  FROM locked_jobs
  WHERE j.id = locked_jobs.id
  RETURNING j.id, j.event_id, j.webhook_config_id, j.attempt_count, j.status;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. process_card_payment AUTORITATIVO E 100% TRANSACIONAL
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_card_payment(
  p_merchant_account_id UUID,
  p_card_number TEXT,
  p_cardholder_name TEXT,
  p_validade TEXT,
  p_cvv TEXT,
  p_amount DECIMAL(15, 2),
  p_tipo TEXT, -- 'debito' ou 'credito'
  p_installments INTEGER DEFAULT 1,
  p_plan TEXT DEFAULT 'standard',
  p_fee_percent DECIMAL(5, 2) DEFAULT NULL,   -- Ignorado; recalculado autoritativamente
  p_fee_amount DECIMAL(15, 2) DEFAULT NULL,    -- Ignorado; recalculado autoritativamente
  p_net_amount DECIMAL(15, 2) DEFAULT NULL,    -- Ignorado; recalculado autoritativamente
  p_description TEXT DEFAULT 'Venda Cartão OptmaPay',
  p_external_reference TEXT DEFAULT NULL,
  p_pin TEXT DEFAULT NULL,
  p_card_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_request_hash TEXT DEFAULT NULL,
  p_api_key_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_card RECORD;
  v_payer_account RECORD;
  v_merchant_account RECORD;
  v_nsu TEXT;
  v_auth_code TEXT;
  v_tid TEXT;
  v_clean_card_number TEXT;
  v_tx_out_id UUID;
  v_tx_in_id UUID;
  v_merchant_user_id UUID;
  v_payer_user_id UUID;
  v_is_fast_plan BOOLEAN;
  v_in_tx_status TEXT;
  v_in_tx_desc TEXT;
  v_plan_label TEXT;
  v_effective_plan TEXT;
  v_event_id UUID;
  v_event_payload JSONB;
  v_occurred_at TIMESTAMPTZ := now();
  v_masked_card TEXT;
  v_existing_idemp RECORD;
  v_result JSONB;

  -- Variáveis de cálculo autoritativo de taxas MDR
  v_calc_fee_percent DECIMAL(7, 4) := 0.0000;
  v_calc_fee_amount DECIMAL(15, 2) := 0.00;
  v_calc_net_amount DECIMAL(15, 2) := 0.00;
  v_exp_month INTEGER;
  v_exp_year INTEGER;
  v_current_month INTEGER;
  v_current_year INTEGER;
BEGIN
  -- ============================================================================
  -- A. IDEMPOTÊNCIA TRANSACIONAL (SE CHAVE FORNECIDA)
  -- ============================================================================
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    SELECT * INTO v_existing_idemp
    FROM public.api_idempotency_keys
    WHERE account_id = p_merchant_account_id
      AND operation = 'cards:charge'
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF p_request_hash IS NOT NULL AND v_existing_idemp.request_hash <> p_request_hash THEN
        RETURN jsonb_build_object(
          'success', false,
          'status', 'error',
          'status_code', 409,
          'error_code', 'IDEMPOTENCY_KEY_REUSED',
          'message', 'Esta Idempotency-Key já foi utilizada com parâmetros de requisição diferentes.'
        );
      END IF;

      IF v_existing_idemp.status = 'in_progress' THEN
        RETURN jsonb_build_object(
          'success', false,
          'status', 'error',
          'status_code', 409,
          'error_code', 'IDEMPOTENCY_IN_PROGRESS',
          'message', 'Uma requisição com esta Idempotency-Key ainda está em processamento.'
        );
      END IF;

      IF v_existing_idemp.status = 'completed' AND v_existing_idemp.response_body IS NOT NULL THEN
        RETURN v_existing_idemp.response_body;
      END IF;
    ELSE
      -- Registra claim da chave como in_progress
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
        COALESCE(p_api_key_id, '00000000-0000-0000-0000-000000000000'::uuid),
        'cards:charge',
        p_idempotency_key,
        COALESCE(p_request_hash, 'nohash'),
        'in_progress',
        now(),
        now() + INTERVAL '24 hours'
      );
    END IF;
  END IF;

  -- ============================================================================
  -- B. VALIDAÇÕES BÁSICAS
  -- ============================================================================
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor da transação deve ser maior que zero.';
  END IF;

  IF p_cvv IS NULL OR TRIM(p_cvv) = '' THEN
    RAISE EXCEPTION 'ERRO 55: O código CVV é obrigatório.';
  END IF;

  IF p_validade IS NULL OR TRIM(p_validade) = '' THEN
    RAISE EXCEPTION 'ERRO 54: A data de validade é obrigatória.';
  END IF;

  -- 1. Regra de Negócio: Débito opera estritamente sob D+1 ou OnTime e em 1 parcela
  IF p_tipo = 'debito' THEN
    IF p_installments > 1 THEN
      RAISE EXCEPTION 'Vendas a débito não permitem parcelamento (installments deve ser 1).';
    END IF;
    IF p_plan = 'ontime' OR p_plan = 'nitro' THEN
      v_effective_plan := 'ontime';
    ELSE
      v_effective_plan := 'standard';
    END IF;
  ELSE
    IF p_installments < 1 OR p_installments > 12 THEN
      RAISE EXCEPTION 'Número de parcelas inválido para crédito (deve ser entre 1 e 12).';
    END IF;
    v_effective_plan := COALESCE(p_plan, 'standard');
  END IF;

  -- 2. Validação estrita de BIN OptmaPay Sandbox
  v_clean_card_number := regexp_replace(COALESCE(p_card_number, ''), '[^0-9]', '', 'g');

  IF p_card_id IS NULL AND (v_clean_card_number IS NULL OR LENGTH(v_clean_card_number) < 16) THEN
    RAISE EXCEPTION 'Número de cartão inválido ou incompleto.';
  END IF;

  IF p_card_id IS NULL THEN
    IF NOT (v_clean_card_number LIKE '5899%' OR v_clean_card_number LIKE '5898%') THEN
      IF v_clean_card_number LIKE '4%' THEN
        RAISE EXCEPTION 'ERRO 05: Cartão de bandeira real (Visa) não permitido no Sandbox. Use apenas cartões fictícios OptmaPay com prefixo 5899.';
      ELSIF v_clean_card_number ~ '^(5[1-5]|2[2-7])' THEN
        RAISE EXCEPTION 'ERRO 05: Cartão de bandeira real (Mastercard) não permitido no Sandbox. Use apenas cartões fictícios OptmaPay com prefixo 5899.';
      ELSIF v_clean_card_number ~ '^(34|37)' THEN
        RAISE EXCEPTION 'ERRO 05: Cartão de bandeira real (American Express) não permitido no Sandbox. Use apenas cartões fictícios OptmaPay com prefixo 5899.';
      ELSE
        RAISE EXCEPTION 'ERRO 05: Cartão de operadora real não permitido. O Sandbox aceita exclusivamente cartões fictícios gerados no sistema (prefixo 5899 ou 5898).';
      END IF;
    END IF;

    IF p_tipo = 'debito' AND NOT v_clean_card_number LIKE '5898%' THEN
      RAISE EXCEPTION 'Incompatibilidade: Cartão informado não é da modalidade débito (prefixo 5898).';
    END IF;

    IF p_tipo = 'credito' AND NOT v_clean_card_number LIKE '5899%' THEN
      RAISE EXCEPTION 'Incompatibilidade: Cartão informado não é da modalidade crédito (prefixo 5899).';
    END IF;
  END IF;

  -- 3. Localização do cartão fictício EXCLUSIVAMENTE por card_id ou número completo exato
  SELECT * INTO v_card
  FROM public.cartoes
  WHERE (p_card_id IS NOT NULL AND id = p_card_id)
     OR (card_number IS NOT NULL AND card_number = v_clean_card_number)
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERRO 14: Cartão fictício não cadastrado ou número incorreto no OptmaPay Sandbox. Reemita o cartão se necessário.';
  END IF;

  -- 4. Validações de segurança do cartão
  IF v_card.status = 'blocked' THEN
    RAISE EXCEPTION 'ERRO 62: Cartão bloqueado para compras. Desbloqueie na carteira de cartões antes de transacionar.';
  END IF;

  -- Validação estrita de CVV (obrigatório bater exatamente)
  IF v_card.cvv IS NOT NULL AND TRIM(v_card.cvv) <> '' THEN
    IF TRIM(v_card.cvv) <> TRIM(p_cvv) THEN
      RAISE EXCEPTION 'ERRO 55: Código CVV incorreto.';
    END IF;
  END IF;

  -- Validação estrita de Validade (formato MM/AA ou MM/AAAA)
  IF v_card.validade IS NOT NULL AND TRIM(v_card.validade) <> '' THEN
    IF TRIM(v_card.validade) <> TRIM(p_validade) THEN
      RAISE EXCEPTION 'ERRO 54: Data de validade informada diverge do cartão.';
    END IF;
  END IF;

  -- Validação se o cartão está expirado
  BEGIN
    v_exp_month := SPLIT_PART(TRIM(p_validade), '/', 1)::INTEGER;
    v_exp_year := SPLIT_PART(TRIM(p_validade), '/', 2)::INTEGER;
    IF v_exp_year < 100 THEN
      v_exp_year := 2000 + v_exp_year;
    END IF;
    v_current_month := EXTRACT(MONTH FROM now())::INTEGER;
    v_current_year := EXTRACT(YEAR FROM now())::INTEGER;

    IF v_exp_year < v_current_year OR (v_exp_year = v_current_year AND v_exp_month < v_current_month) THEN
      RAISE EXCEPTION 'ERRO 54: Cartão vencido / expirado.';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Cartão vencido%' THEN
        RAISE;
      ELSE
        RAISE EXCEPTION 'ERRO 54: Formato de data de validade inválido. Use MM/AA.';
      END IF;
  END;

  -- Validação de PIN se informado
  IF p_pin IS NOT NULL AND TRIM(p_pin) <> '' AND v_card.pin IS NOT NULL AND TRIM(v_card.pin) <> '' THEN
    IF TRIM(v_card.pin) <> TRIM(p_pin) THEN
      RAISE EXCEPTION 'ERRO 55: Senha do cartão incorreta.';
    END IF;
  END IF;

  -- 5. Busca e bloqueio das contas envolvidas
  SELECT * INTO v_payer_account
  FROM public.accounts
  WHERE id = v_card.account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta vinculada ao cartão pagador não encontrada.';
  END IF;

  v_payer_user_id := v_payer_account.user_id;

  SELECT * INTO v_merchant_account
  FROM public.accounts
  WHERE id = p_merchant_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta do estabelecimento recebedor não encontrada.';
  END IF;

  v_merchant_user_id := v_merchant_account.user_id;

  -- Validação de ownership para chamadas authenticated
  IF auth.uid() IS NOT NULL AND v_merchant_user_id IS NOT NULL AND auth.uid() <> v_merchant_user_id THEN
    RAISE EXCEPTION 'Você não tem permissão para processar cobranças para esta conta merchant.';
  END IF;

  -- ============================================================================
  -- C. CÁLCULO AUTORITATIVO DE TAXA MDR EM SQL (SEM CONFIAR NO CLIENTE)
  -- ============================================================================
  IF p_tipo = 'debito' THEN
    IF v_effective_plan = 'ontime' OR v_effective_plan = 'nitro' THEN
      v_calc_fee_percent := 1.8400;
    ELSIF v_effective_plan = 'd7' THEN
      v_calc_fee_percent := 0.8245;
    ELSIF v_effective_plan = 'd15' THEN
      v_calc_fee_percent := 0.8075;
    ELSE
      v_calc_fee_percent := 0.8500;
    END IF;
  ELSE
    -- Crédito por número de parcelas
    CASE p_installments
      WHEN 1 THEN v_calc_fee_percent := 2.8900;
      WHEN 2 THEN v_calc_fee_percent := 4.2200;
      WHEN 3 THEN v_calc_fee_percent := 4.8300;
      WHEN 4 THEN v_calc_fee_percent := 5.4400;
      WHEN 5 THEN v_calc_fee_percent := 6.0500;
      WHEN 6 THEN v_calc_fee_percent := 6.6400;
      WHEN 7 THEN v_calc_fee_percent := 7.2400;
      WHEN 8 THEN v_calc_fee_percent := 7.8200;
      WHEN 9 THEN v_calc_fee_percent := 8.4100;
      WHEN 10 THEN v_calc_fee_percent := 8.9800;
      WHEN 11 THEN v_calc_fee_percent := 9.5600;
      WHEN 12 THEN v_calc_fee_percent := 10.1200;
      ELSE v_calc_fee_percent := 2.8900;
    END CASE;

    -- Ajustes por plano de liquidação
    IF v_effective_plan = 'ontime' OR v_effective_plan = 'nitro' THEN
      v_calc_fee_percent := ROUND(v_calc_fee_percent * 1.3500, 4); -- +35% de custo antecipação
    ELSIF v_effective_plan = 'd7' THEN
      v_calc_fee_percent := ROUND(v_calc_fee_percent * 0.9700, 4); -- 3% de desconto
    ELSIF v_effective_plan = 'd15' THEN
      v_calc_fee_percent := ROUND(v_calc_fee_percent * 0.9500, 4); -- 5% de desconto
    ELSIF v_effective_plan = 'due_date' THEN
      v_calc_fee_percent := ROUND(v_calc_fee_percent * 0.9000, 4); -- 10% de desconto
    END IF;
  END IF;

  v_calc_fee_amount := ROUND(p_amount * (v_calc_fee_percent / 100.0), 2);
  v_calc_net_amount := p_amount - v_calc_fee_amount;

  -- INVARIANTE MATEMÁTICA ESTRITA
  IF v_calc_net_amount > p_amount OR v_calc_fee_amount < 0.00 THEN
    RAISE EXCEPTION 'Invariante financeira violada: valor líquido (R$ %) não pode ser maior que o valor bruto (R$ %).', v_calc_net_amount, p_amount;
  END IF;

  -- 6. Verificação de saldo / limite
  IF p_tipo = 'debito' THEN
    IF v_payer_account.balance < p_amount THEN
      RAISE EXCEPTION 'ERRO 51: Saldo insuficiente na conta para compra no débito (Disponível: R$ %, Necessário: R$ %).', v_payer_account.balance, p_amount;
    END IF;

    UPDATE public.accounts
    SET balance = balance - p_amount, updated_at = now()
    WHERE id = v_payer_account.id;

  ELSIF p_tipo = 'credito' THEN
    IF (v_card.current_balance + p_amount) > v_card.credit_limit THEN
      RAISE EXCEPTION 'ERRO 51: Limite de crédito excedido no cartão virtual (Limite: R$ %, Utilizado: R$ %, Compra: R$ %).', v_card.credit_limit, v_card.current_balance, p_amount;
    END IF;

    UPDATE public.cartoes
    SET current_balance = current_balance + p_amount
    WHERE id = v_card.id;
  END IF;

  -- 7. Plano de Liquidação
  v_is_fast_plan := (v_effective_plan = 'ontime' OR v_effective_plan = 'nitro');

  IF v_effective_plan = 'd7' THEN
    v_plan_label := 'Lançamento Futuro D+7 Útil';
  ELSIF v_effective_plan = 'd15' THEN
    v_plan_label := 'Lançamento Futuro D+15 Útil';
  ELSIF v_effective_plan = 'due_date' THEN
    v_plan_label := 'Lançamento Futuro no Vencimento';
  ELSIF v_is_fast_plan THEN
    v_plan_label := '⚡ OnTime (Na Hora)';
  ELSE
    v_plan_label := 'Lançamento Futuro D+1 Útil';
  END IF;

  IF v_is_fast_plan THEN
    UPDATE public.accounts
    SET balance = balance + v_calc_net_amount, updated_at = now()
    WHERE id = v_merchant_account.id;

    v_in_tx_status := 'completed';
    v_in_tx_desc := 'Recebimento Cartão ' || UPPER(p_tipo) || ' (Taxa ' || v_calc_fee_percent || '%: -R$ ' || v_calc_fee_amount || ' | Líquido: R$ ' || v_calc_net_amount || ') - ' || v_plan_label;
  ELSE
    v_in_tx_status := 'pending';
    v_in_tx_desc := 'Recebimento Cartão ' || UPPER(p_tipo) || ' (Taxa ' || v_calc_fee_percent || '%: -R$ ' || v_calc_fee_amount || ' | Líquido: R$ ' || v_calc_net_amount || ') - ' || v_plan_label;
  END IF;

  -- 8. Geradores de NSU, Auth Code e TID
  v_nsu := LPAD(FLOOR(RANDOM() * 90000000 + 10000000)::TEXT, 8, '0');
  v_auth_code := LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');
  v_tid := 'TID-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || v_nsu;
  v_masked_card := '•••• ' || RIGHT(COALESCE(v_card.card_number, v_clean_card_number), 4);

  -- 9. Transação OUT (Débito da conta pagadora pertencente ao payer_user_id)
  INSERT INTO public.transactions (
    user_id,
    account_id,
    type,
    direction,
    amount,
    description,
    external_reference,
    status,
    real_money,
    environment,
    created_at
  ) VALUES (
    v_payer_user_id,
    v_payer_account.id,
    CASE WHEN p_tipo = 'debito' THEN 'card_debit' ELSE 'card_credit' END,
    'out',
    p_amount,
    COALESCE(p_description, 'Compra Cartão') || ' #' || v_nsu,
    COALESCE(p_external_reference, v_tid),
    'completed',
    false,
    'sandbox',
    v_occurred_at
  )
  RETURNING id INTO v_tx_out_id;

  -- 10. Transação IN (Crédito da conta recebedora pertencente ao merchant_user_id)
  INSERT INTO public.transactions (
    user_id,
    account_id,
    type,
    direction,
    amount,
    description,
    external_reference,
    status,
    real_money,
    environment,
    created_at
  ) VALUES (
    v_merchant_user_id,
    v_merchant_account.id,
    'card_payment',
    'in',
    v_calc_net_amount,
    v_in_tx_desc,
    COALESCE(p_external_reference, v_tid),
    v_in_tx_status,
    false,
    'sandbox',
    v_occurred_at
  )
  RETURNING id INTO v_tx_in_id;

  -- 11. OUTBOX DE WEBHOOK ATÔMICO (card.paid)
  v_event_id := gen_random_uuid();
  v_event_payload := jsonb_build_object(
    'id', v_event_id,
    'event', 'card.paid',
    'createdAt', TO_CHAR(v_occurred_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'realMoney', false,
    'environment', 'sandbox',
    'data', jsonb_build_object(
      'transactionId', v_tx_in_id,
      'amountGross', p_amount,
      'feePercent', v_calc_fee_percent,
      'feeAmount', v_calc_fee_amount,
      'amountNet', v_calc_net_amount,
      'installments', p_installments,
      'plan', v_effective_plan,
      'tipo', p_tipo,
      'cardBrand', COALESCE(v_card.brand, 'OptmaCard'),
      'cardMasked', v_masked_card,
      'merchantAccountId', v_merchant_account.id,
      'merchantName', v_merchant_account.name,
      'payerAccountId', v_payer_account.id,
      'payerName', v_payer_account.name,
      'nsu', v_nsu,
      'authorizationCode', v_auth_code,
      'tid', v_tid,
      'externalReference', COALESCE(p_external_reference, v_tid)
    )
  );

  INSERT INTO public.webhook_events (
    id,
    account_id,
    event_type,
    resource_type,
    resource_id,
    idempotency_key,
    payload,
    occurred_at,
    created_at
  ) VALUES (
    v_event_id,
    v_merchant_account.id,
    'card.paid',
    'transaction',
    v_tx_in_id::TEXT,
    'card.paid:' || v_tx_in_id::TEXT,
    v_event_payload,
    v_occurred_at,
    v_occurred_at
  );

  INSERT INTO public.webhook_delivery_jobs (
    id,
    event_id,
    webhook_config_id,
    status,
    attempt_count,
    next_attempt_at,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    v_event_id,
    cfg.id,
    'pending',
    0,
    v_occurred_at,
    v_occurred_at,
    v_occurred_at
  FROM public.webhooks_config cfg
  WHERE cfg.account_id = v_merchant_account.id
    AND cfg.active = true
    AND ('card.paid' = ANY(cfg.events) OR 'all' = ANY(cfg.events))
  ON CONFLICT (event_id, webhook_config_id) DO NOTHING;

  -- 12. Constrói o retorno canônico normalizado
  v_result := jsonb_build_object(
    'success', true,
    'status', 'approved',
    'message', 'Transação autorizada com sucesso.',
    'transaction_out_id', v_tx_out_id,
    'transaction_in_id', v_tx_in_id,
    'authorization_code', v_auth_code,
    'nsu', v_nsu,
    'tid', v_tid,
    'card_masked', v_masked_card,
    'merchant_account_id', v_merchant_account.id,
    'merchant_name', v_merchant_account.name,
    'payer_account_id', v_payer_account.id,
    'payer_name', v_payer_account.name,
    'gross_amount', p_amount,
    'net_amount', v_calc_net_amount,
    'fee_amount', v_calc_fee_amount,
    'fee_percent', v_calc_fee_percent,
    'installments', p_installments,
    'plan', v_effective_plan,
    'tipo', p_tipo,
    'webhook_event_id', v_event_id,
    'real_money', false,
    'environment', 'sandbox'
  );

  -- 13. Se houver chave de idempotência, conclui o registro atomicamente
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    UPDATE public.api_idempotency_keys
    SET status = 'completed',
        response_status = 200,
        response_body = v_result,
        resource_type = 'transaction',
        resource_id = v_tx_in_id::TEXT
    WHERE account_id = p_merchant_account_id
      AND operation = 'cards:charge'
      AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. transfer_pix COM IDEMPOTÊNCIA TRANSACIONAL EM SQL
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_pix(
  p_sender_account_id UUID,
  p_receiver_pix_key TEXT,
  p_amount DECIMAL(15, 2),
  p_description TEXT DEFAULT 'Transferência Pix Sandbox',
  p_external_reference TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_request_hash TEXT DEFAULT NULL,
  p_api_key_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_receiver_account_id UUID;
  v_receiver_name TEXT;
  v_receiver_pix_key TEXT;
  v_receiver_user_id UUID;
  v_sender_name TEXT;
  v_sender_balance DECIMAL(15, 2);
  v_sender_user_id UUID;
  v_sender_cpf_cnpj TEXT;
  v_out_tx_id UUID;
  v_in_tx_id UUID;
  v_clean_key TEXT;
  v_event_id UUID;
  v_event_payload JSONB;
  v_occurred_at TIMESTAMPTZ := now();
  v_existing_idemp RECORD;
  v_result JSONB;
BEGIN
  -- ============================================================================
  -- A. IDEMPOTÊNCIA TRANSACIONAL (SE CHAVE FORNECIDA)
  -- ============================================================================
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    SELECT * INTO v_existing_idemp
    FROM public.api_idempotency_keys
    WHERE account_id = p_sender_account_id
      AND operation = 'pix:transfer'
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF p_request_hash IS NOT NULL AND v_existing_idemp.request_hash <> p_request_hash THEN
        RETURN jsonb_build_object(
          'success', false,
          'status', 'error',
          'status_code', 409,
          'error_code', 'IDEMPOTENCY_KEY_REUSED',
          'message', 'Esta Idempotency-Key já foi utilizada com parâmetros de transferência diferentes.'
        );
      END IF;

      IF v_existing_idemp.status = 'in_progress' THEN
        RETURN jsonb_build_object(
          'success', false,
          'status', 'error',
          'status_code', 409,
          'error_code', 'IDEMPOTENCY_IN_PROGRESS',
          'message', 'Uma transferência com esta Idempotency-Key ainda está em processamento.'
        );
      END IF;

      IF v_existing_idemp.status = 'completed' AND v_existing_idemp.response_body IS NOT NULL THEN
        RETURN v_existing_idemp.response_body;
      END IF;
    ELSE
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
        p_sender_account_id,
        COALESCE(p_api_key_id, '00000000-0000-0000-0000-000000000000'::uuid),
        'pix:transfer',
        p_idempotency_key,
        COALESCE(p_request_hash, 'nohash'),
        'in_progress',
        now(),
        now() + INTERVAL '24 hours'
      );
    END IF;
  END IF;

  -- ============================================================================
  -- B. VALIDAÇÃO DE VALOR E CHAVE
  -- ============================================================================
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor da transferência Pix deve ser maior que zero.';
  END IF;

  IF p_receiver_pix_key IS NULL OR TRIM(p_receiver_pix_key) = '' THEN
    RAISE EXCEPTION 'A chave Pix de destino é obrigatória.';
  END IF;

  v_clean_key := TRIM(p_receiver_pix_key);

  -- 2. Busca e bloqueio da conta pagadora
  SELECT name, balance, user_id, cpf_cnpj
  INTO v_sender_name, v_sender_balance, v_sender_user_id, v_sender_cpf_cnpj
  FROM public.accounts
  WHERE id = p_sender_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta pagadora não encontrada.';
  END IF;

  IF auth.uid() IS NOT NULL AND v_sender_user_id IS NOT NULL AND auth.uid() <> v_sender_user_id THEN
    RAISE EXCEPTION 'Acesso negado: Você só pode transferir valores da sua própria conta.';
  END IF;

  IF v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponível: R$ % | Solicitado: R$ %',
      v_sender_balance, p_amount;
  END IF;

  -- 3. Localização da conta recebedora
  IF v_clean_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id, name, pix_key, user_id
    INTO v_receiver_account_id, v_receiver_name, v_receiver_pix_key, v_receiver_user_id
    FROM public.accounts
    WHERE id = v_clean_key::UUID;
  END IF;

  IF v_receiver_account_id IS NULL THEN
    SELECT id, name, pix_key, user_id
    INTO v_receiver_account_id, v_receiver_name, v_receiver_pix_key, v_receiver_user_id
    FROM public.accounts
    WHERE pix_key = v_clean_key
       OR pix_key ILIKE v_clean_key
       OR regexp_replace(cpf_cnpj, '[^0-9]', '', 'g') = regexp_replace(v_clean_key, '[^0-9]', '', 'g')
    LIMIT 1;
  END IF;

  IF v_receiver_account_id IS NULL THEN
    RAISE EXCEPTION 'Chave Pix de destino não encontrada no OptmaPay Sandbox.';
  END IF;

  IF p_sender_account_id = v_receiver_account_id THEN
    RAISE EXCEPTION 'Não é permitido realizar transferências Pix para a própria conta.';
  END IF;

  -- Bloqueio da conta recebedora
  PERFORM 1 FROM public.accounts WHERE id = v_receiver_account_id FOR UPDATE;

  -- 4. Débito e Crédito
  UPDATE public.accounts
  SET balance = balance - p_amount, updated_at = now()
  WHERE id = p_sender_account_id;

  UPDATE public.accounts
  SET balance = balance + p_amount, updated_at = now()
  WHERE id = v_receiver_account_id;

  -- 5. Lançamentos espelhados com titularidade correta
  INSERT INTO public.transactions (
    user_id,
    account_id,
    type,
    direction,
    amount,
    description,
    external_reference,
    status,
    real_money,
    environment,
    created_at
  ) VALUES (
    v_sender_user_id,
    p_sender_account_id,
    'pix',
    'out',
    p_amount,
    COALESCE(p_description, 'Transferência Pix enviada') || ' para ' || v_receiver_name,
    p_external_reference,
    'completed',
    false,
    'sandbox',
    v_occurred_at
  )
  RETURNING id INTO v_out_tx_id;

  INSERT INTO public.transactions (
    user_id,
    account_id,
    type,
    direction,
    amount,
    description,
    external_reference,
    status,
    real_money,
    environment,
    created_at
  ) VALUES (
    v_receiver_user_id,
    v_receiver_account_id,
    'pix',
    'in',
    p_amount,
    COALESCE(p_description, 'Transferência Pix recebida') || ' de ' || v_sender_name,
    p_external_reference,
    'completed',
    false,
    'sandbox',
    v_occurred_at
  )
  RETURNING id INTO v_in_tx_id;

  -- 6. OUTBOX DE WEBHOOK ATÔMICO (pix.paid)
  v_event_id := gen_random_uuid();
  v_event_payload := jsonb_build_object(
    'id', v_event_id,
    'event', 'pix.paid',
    'createdAt', TO_CHAR(v_occurred_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'realMoney', false,
    'environment', 'sandbox',
    'data', jsonb_build_object(
      'transactionId', v_in_tx_id,
      'amount', p_amount,
      'description', p_description,
      'senderAccountId', p_sender_account_id,
      'senderName', v_sender_name,
      'senderCpfCnpj', v_sender_cpf_cnpj,
      'receiverAccountId', v_receiver_account_id,
      'receiverName', v_receiver_name,
      'receiverPixKey', v_receiver_pix_key,
      'externalReference', p_external_reference
    )
  );

  INSERT INTO public.webhook_events (
    id,
    account_id,
    event_type,
    resource_type,
    resource_id,
    idempotency_key,
    payload,
    occurred_at,
    created_at
  ) VALUES (
    v_event_id,
    v_receiver_account_id,
    'pix.paid',
    'transaction',
    v_in_tx_id::TEXT,
    'pix.paid:' || v_in_tx_id::TEXT,
    v_event_payload,
    v_occurred_at,
    v_occurred_at
  );

  INSERT INTO public.webhook_delivery_jobs (
    id,
    event_id,
    webhook_config_id,
    status,
    attempt_count,
    next_attempt_at,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    v_event_id,
    cfg.id,
    'pending',
    0,
    v_occurred_at,
    v_occurred_at,
    v_occurred_at
  FROM public.webhooks_config cfg
  WHERE cfg.account_id = v_receiver_account_id
    AND cfg.active = true
    AND ('pix.paid' = ANY(cfg.events) OR 'all' = ANY(cfg.events))
  ON CONFLICT (event_id, webhook_config_id) DO NOTHING;

  -- 7. Resposta canônica
  v_result := jsonb_build_object(
    'success', true,
    'message', 'Transferência Pix de R$ ' || p_amount || ' enviada com sucesso para ' || v_receiver_name,
    'amount', p_amount,
    'sender_name', v_sender_name,
    'sender_account_id', p_sender_account_id,
    'sender_balance_after', v_sender_balance - p_amount,
    'receiver_name', v_receiver_name,
    'receiver_account_id', v_receiver_account_id,
    'receiver_pix_key', v_receiver_pix_key,
    'transaction_out_id', v_out_tx_id,
    'transaction_in_id', v_in_tx_id,
    'webhook_event_id', v_event_id,
    'occurred_at', v_occurred_at,
    'real_money', false,
    'environment', 'sandbox'
  );

  -- 8. Conclusão atômica da chave de idempotência
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    UPDATE public.api_idempotency_keys
    SET status = 'completed',
        response_status = 200,
        response_body = v_result,
        resource_type = 'transaction',
        resource_id = v_in_tx_id::TEXT
    WHERE account_id = p_sender_account_id
      AND operation = 'pix:transfer'
      AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN v_result;
END;
$$;
