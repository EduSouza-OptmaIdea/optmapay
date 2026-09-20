-- ==============================================================================
-- OPTMAPAY SANDBOX - PACOTE 01D: CORREÇÕES OBRIGATÓRIAS PÓS-AUDITORIA
-- 1. Helper SQL autoritativo de cálculo de taxa MDR (calculate_card_mdr_rate)
-- 2. Restauração estrita dos invariantes de cartão (eliminação definitiva do lookup por 4 dígitos)
-- 3. Validação de CVV obrigatório e correto, validade obrigatória, correta e não expirada
-- 4. Exigência estrita de tipo de cartão: p_tipo IN ('credito','debito') e v_card.tipo = p_tipo
-- 5. Eliminação definitiva do takeover não-atômico de idempotência (in_progress retorna sempre IDEMPOTENCY_IN_PROGRESS)
-- 6. Exigência obrigatória de p_actor_user_id na branch service_role em transfer_pix
-- 7. Helper RPC para seleção de webhooks elegíveis sem claim prévio pelo worker
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. LIMPEZA DE IDEMPOTÊNCIAS LEGADAS ABANDONADAS (Manutenção fora da RPC financeira)
-- ------------------------------------------------------------------------------

UPDATE public.api_idempotency_keys
SET status = 'failed',
    response_body = '{"error": "STALE_ABANDONED_REQUEST"}'::jsonb,
    updated_at = now()
WHERE status = 'in_progress'
  AND created_at < (now() - INTERVAL '1 hour');

-- ------------------------------------------------------------------------------
-- 2. HELPER AUTORITATIVO SQL: calculate_card_mdr_rate
-- Espelha 100% cardRules.ts para todas as combinações de plano, tipo e parcelas
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_card_mdr_rate(
  p_tipo TEXT,
  p_plan TEXT DEFAULT 'standard',
  p_installments INTEGER DEFAULT 1
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_plan TEXT := LOWER(COALESCE(p_plan, 'standard'));
  v_inst INTEGER := GREATEST(1, LEAST(12, COALESCE(p_installments, 1)));
BEGIN
  IF p_tipo = 'debito' THEN
    -- Regra de Negócio cardRules.ts: Débito opera em OnTime (1.99%) ou D+1 Standard (0.85%)
    IF v_plan IN ('ontime', 'nitro') THEN
      RETURN 1.99;
    ELSE
      RETURN 0.85;
    END IF;
  ELSIF p_tipo = 'credito' THEN
    IF v_plan = 'due_date' THEN
      -- DUE_DATE_FEE_PERCENT = 2.601 para todas as parcelas no crédito
      RETURN 2.601;
    ELSIF v_plan IN ('ontime', 'nitro') THEN
      -- ONTIME_FEE_RATES / NITRO_FEE_RATES
      RETURN CASE v_inst
        WHEN 1 THEN 5.99
        WHEN 2 THEN 11.39
        WHEN 3 THEN 12.49
        WHEN 4 THEN 13.09
        WHEN 5 THEN 13.79
        WHEN 6 THEN 14.49
        WHEN 7 THEN 15.49
        WHEN 8 THEN 16.09
        WHEN 9 THEN 16.69
        WHEN 10 THEN 17.39
        WHEN 11 THEN 18.39
        ELSE 18.79
      END;
    ELSIF v_plan = 'd7' THEN
      -- D7_FEE_RATES
      RETURN CASE v_inst
        WHEN 1 THEN 2.8033
        WHEN 2 THEN 4.0934
        WHEN 3 THEN 4.6851
        WHEN 4 THEN 5.2768
        WHEN 5 THEN 5.8685
        WHEN 6 THEN 6.4408
        WHEN 7 THEN 7.0228
        WHEN 8 THEN 7.5854
        WHEN 9 THEN 8.1577
        WHEN 10 THEN 8.7106
        WHEN 11 THEN 9.2732
        ELSE 9.8164
      END;
    ELSIF v_plan = 'd15' THEN
      -- D15_FEE_RATES
      RETURN CASE v_inst
        WHEN 1 THEN 2.7455
        WHEN 2 THEN 4.0090
        WHEN 3 THEN 4.5885
        WHEN 4 THEN 5.1680
        WHEN 5 THEN 5.7475
        WHEN 6 THEN 6.3080
        WHEN 7 THEN 6.8780
        WHEN 8 THEN 7.4290
        WHEN 9 THEN 7.9895
        WHEN 10 THEN 8.5310
        WHEN 11 THEN 9.0820
        ELSE 9.6140
      END;
    ELSE
      -- STANDARD_FEE_RATES (d1 / standard)
      RETURN CASE v_inst
        WHEN 1 THEN 2.89
        WHEN 2 THEN 4.22
        WHEN 3 THEN 4.83
        WHEN 4 THEN 5.44
        WHEN 5 THEN 6.05
        WHEN 6 THEN 6.64
        WHEN 7 THEN 7.24
        WHEN 8 THEN 7.82
        WHEN 9 THEN 8.41
        WHEN 10 THEN 8.98
        WHEN 11 THEN 9.56
        ELSE 10.12
      END;
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de cartão inválido: %', p_tipo;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_card_mdr_rate(TEXT, TEXT, INTEGER) TO PUBLIC, anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. HELPER: get_eligible_webhook_job_ids (Seleção sem claim prévio para o worker Edge)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_eligible_webhook_job_ids(
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT j.id
  FROM public.webhook_delivery_jobs j
  WHERE (
    -- Pending ou Retry vencidos
    (j.status IN ('pending', 'retry') AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= now()))
    OR
    -- Delivering com lock expirado (> 5 minutos)
    (j.status = 'delivering' AND (j.locked_at IS NULL OR j.locked_at < (now() - INTERVAL '5 minutes')))
  )
  ORDER BY j.created_at ASC
  LIMIT LEAST(COALESCE(p_limit, 50), 100);
$$;

REVOKE ALL ON FUNCTION public.get_eligible_webhook_job_ids(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_eligible_webhook_job_ids(INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_eligible_webhook_job_ids(INTEGER) TO service_role;

-- ------------------------------------------------------------------------------
-- 4. RPC: process_card_payment (01D Hardened)
-- Invariantes estritos de cartão, sem lookup por 4 dígitos, sem takeover de idempotência,
-- MDR via calculate_card_mdr_rate.
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
  p_description TEXT DEFAULT NULL,
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
  v_card RECORD;
  v_payer_account RECORD;
  v_merchant_account RECORD;
  v_merchant_user_id UUID;
  v_clean_card_number TEXT;
  v_nsu TEXT;
  v_auth_code TEXT;
  v_tid TEXT;
  v_tx_out_id UUID;
  v_tx_in_id UUID;
  v_effective_plan TEXT;
  v_fee_rate NUMERIC;
  v_fee_amount NUMERIC(15, 2);
  v_gross_amount NUMERIC(15, 2);
  v_net_amount NUMERIC(15, 2);
  v_is_instant BOOLEAN;
  v_in_tx_status TEXT;
  v_in_tx_desc TEXT;
  v_installments INTEGER := GREATEST(1, LEAST(12, COALESCE(p_installments, 1)));
  v_event_id UUID;
  v_event_payload JSONB;
  v_response_json JSONB;
  v_idemp_id UUID;
  v_existing_idemp RECORD;
  v_cfg RECORD;
  v_role TEXT;
  v_occurred_at TIMESTAMPTZ := now();

  -- Variáveis de validação de expiração
  v_val_parts TEXT[];
  v_val_month INTEGER;
  v_val_year INTEGER;
  v_cur_month INTEGER := EXTRACT(MONTH FROM now())::INTEGER;
  v_cur_year INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
BEGIN
  -- 1. VALIDAÇÃO DE MODALIDADE (TIPO)
  IF p_tipo IS NULL OR p_tipo NOT IN ('credito', 'debito') THEN
    RAISE EXCEPTION 'ERRO 03: Tipo de pagamento inválido. Deve ser "credito" ou "debito".';
  END IF;

  -- 2. VALIDAÇÃO DE VALOR
  v_gross_amount := ROUND(COALESCE(p_amount, 0), 2);
  IF v_gross_amount <= 0 THEN
    RAISE EXCEPTION 'O valor da transação deve ser maior que zero.';
  END IF;

  -- 3. VALIDAÇÃO E BLOQUEIO DA CONTA MERCHANT
  SELECT id, user_id, name, cpf_cnpj, balance INTO v_merchant_account
  FROM public.accounts
  WHERE id = p_merchant_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta do estabelecimento (merchant) não encontrada.';
  END IF;

  v_merchant_user_id := v_merchant_account.user_id;

  -- 4. FECHAMENTO DE SEGURANÇA SECURITY DEFINER
  v_role := COALESCE(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.role(), ''),
    current_user
  );

  IF v_role = 'authenticated' THEN
    IF auth.uid() IS NULL OR v_merchant_user_id IS NULL OR auth.uid() <> v_merchant_user_id THEN
      RAISE EXCEPTION 'Acesso negado: você não tem permissão para processar cobranças para esta conta merchant.';
    END IF;
  ELSIF v_role IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF p_api_key_id IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: p_api_key_id é obrigatório para chamadas de sistema.';
    END IF;
    PERFORM 1 FROM public.api_keys
    WHERE id = p_api_key_id
      AND account_id = p_merchant_account_id
      AND active = true
      AND revoked_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Acesso negado: chave de API inválida, revogada ou não vinculada à conta merchant.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Acesso negado: privilégios insuficientes para executar process_card_payment.';
  END IF;

  -- 5. CONTROLE ATÔMICO DE IDEMPOTÊNCIA NO POSTGRESQL (Sem takeover arbitrário)
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    INSERT INTO public.api_idempotency_keys (
      account_id,
      operation,
      idempotency_key,
      request_hash,
      status,
      api_key_id,
      created_at,
      updated_at
    ) VALUES (
      p_merchant_account_id,
      'cards:charge',
      p_idempotency_key,
      p_request_hash,
      'in_progress',
      p_api_key_id,
      now(),
      now()
    )
    ON CONFLICT (account_id, operation, idempotency_key) DO NOTHING
    RETURNING id INTO v_idemp_id;

    -- Se perdeu o conflito, a requisição já existe ou está sendo processada
    IF v_idemp_id IS NULL THEN
      SELECT * INTO v_existing_idemp
      FROM public.api_idempotency_keys
      WHERE account_id = p_merchant_account_id
        AND operation = 'cards:charge'
        AND idempotency_key = p_idempotency_key;

      IF FOUND THEN
        IF p_request_hash IS NOT NULL AND v_existing_idemp.request_hash IS NOT NULL AND v_existing_idemp.request_hash <> p_request_hash THEN
          RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED: Esta Idempotency-Key já foi utilizada com parâmetros de requisição diferentes.';
        END IF;

        IF v_existing_idemp.status = 'completed' AND v_existing_idemp.response_body IS NOT NULL THEN
          RETURN jsonb_set(v_existing_idemp.response_body, '{from_cache}', 'true'::jsonb);
        END IF;

        -- Qualquer status in_progress retorna IDEMPOTENCY_IN_PROGRESS sem takeover não atômico
        IF v_existing_idemp.status = 'in_progress' THEN
          RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS: Uma transação com esta Idempotency-Key já está sendo processada concorrentemente.';
        END IF;

        IF v_existing_idemp.status = 'failed' THEN
          RAISE EXCEPTION 'IDEMPOTENCY_FAILED: Transação anterior com esta Idempotency-Key falhou e não pode ser reutilizada.';
        END IF;
      END IF;
    END IF;
  END IF;

  -- 6. VALIDAÇÃO DE PLANO E MODALIDADE
  IF p_tipo = 'debito' THEN
    IF v_installments > 1 THEN
      RAISE EXCEPTION 'Vendas na modalidade débito não aceitam parcelamento (installments deve ser 1).';
    END IF;
    IF p_plan = 'ontime' OR p_plan = 'nitro' THEN
      v_effective_plan := 'ontime';
    ELSE
      v_effective_plan := 'standard';
    END IF;
  ELSE
    v_effective_plan := LOWER(COALESCE(p_plan, 'standard'));
    IF v_effective_plan NOT IN ('standard', 'd1', 'd7', 'd15', 'due_date', 'ontime', 'nitro') THEN
      v_effective_plan := 'standard';
    END IF;
  END IF;

  -- 7. CÁLCULO AUTORITATIVO DE TAXA MDR VIA HELPER SQL
  v_fee_rate := public.calculate_card_mdr_rate(p_tipo, v_effective_plan, v_installments);
  v_fee_amount := ROUND(v_gross_amount * (v_fee_rate / 100.0), 2);
  v_net_amount := v_gross_amount - v_fee_amount;

  -- 8. LOCALIZAÇÃO E INVARIANTES ESTRITOS DE CARTÃO
  IF p_card_number IS NOT NULL AND TRIM(p_card_number) <> '' THEN
    v_clean_card_number := regexp_replace(p_card_number, '[^0-9]', '', 'g');
  END IF;

  -- Validação de prefixo BIN
  IF v_clean_card_number IS NOT NULL AND LENGTH(v_clean_card_number) >= 4 THEN
    IF NOT (v_clean_card_number LIKE '5899%' OR v_clean_card_number LIKE '5898%') THEN
      RAISE EXCEPTION 'ERRO 05: Cartão não permitido. O OptmaPay Sandbox aceita exclusivamente cartões fictícios (prefixos 5899 ou 5898).';
    END IF;
  END IF;

  -- Localização autoritativa do cartão (DEFINITIVAMENTE SEM LIKE % ULTIMOS 4 DIGITOS)
  IF p_card_id IS NOT NULL THEN
    SELECT * INTO v_card
    FROM public.cartoes
    WHERE id = p_card_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERRO 14: Cartão fictício não encontrado no OptmaPay Sandbox.';
    END IF;

    -- Se também houver número informado, deve pertencer exatamente ao mesmo cartão
    IF v_clean_card_number IS NOT NULL AND v_clean_card_number <> '' THEN
      IF v_card.card_number IS NOT NULL AND v_card.card_number <> '' AND v_card.card_number <> v_clean_card_number THEN
        RAISE EXCEPTION 'ERRO 15: O número de cartão informado não corresponde ao cartão fornecido.';
      END IF;
    END IF;
  ELSE
    -- Sem p_card_id: localizar estritamente pelo número completo e exato
    IF v_clean_card_number IS NULL OR v_clean_card_number = '' THEN
      RAISE EXCEPTION 'ERRO 16: É obrigatório informar o identificador do cartão ou o número completo.';
    END IF;

    SELECT * INTO v_card
    FROM public.cartoes
    WHERE card_number = v_clean_card_number
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERRO 14: Cartão fictício não encontrado no OptmaPay Sandbox.';
    END IF;
  END IF;

  -- Validação de status de bloqueio
  IF v_card.status = 'blocked' THEN
    RAISE EXCEPTION 'ERRO 62: Cartão bloqueado para compras. Desbloqueie na carteira antes de transacionar.';
  END IF;

  -- Exigência estrita: v_card.tipo = p_tipo
  IF v_card.tipo <> p_tipo THEN
    RAISE EXCEPTION 'ERRO 57: Tipo de cartão incompatível com a operação solicitada (Cartão é %, solicitado %).', v_card.tipo, p_tipo;
  END IF;

  -- CVV obrigatório e correto
  IF p_cvv IS NULL OR TRIM(p_cvv) = '' THEN
    RAISE EXCEPTION 'ERRO 55: Código de segurança CVV é obrigatório.';
  END IF;

  IF v_card.cvv IS NULL OR TRIM(v_card.cvv) = '' OR TRIM(v_card.cvv) <> TRIM(p_cvv) THEN
    RAISE EXCEPTION 'ERRO 55: Código CVV incorreto.';
  END IF;

  -- Validade obrigatória e correta
  IF p_validade IS NULL OR TRIM(p_validade) = '' THEN
    RAISE EXCEPTION 'ERRO 54: Data de validade do cartão é obrigatória.';
  END IF;

  IF v_card.validade IS NULL OR TRIM(v_card.validade) = '' OR TRIM(v_card.validade) <> TRIM(p_validade) THEN
    RAISE EXCEPTION 'ERRO 54: Data de validade do cartão incorreta.';
  END IF;

  -- Validação de expiração do cartão
  v_val_parts := regexp_split_to_array(TRIM(v_card.validade), '[/-]');
  IF array_length(v_val_parts, 1) <> 2 THEN
    RAISE EXCEPTION 'ERRO 54: Formato de validade inválido. Use MM/AA ou MM/AAAA.';
  END IF;

  v_val_month := v_val_parts[1]::INTEGER;
  v_val_year := v_val_parts[2]::INTEGER;

  IF v_val_month < 1 OR v_val_month > 12 THEN
    RAISE EXCEPTION 'ERRO 54: Mês de validade inválido.';
  END IF;

  IF v_val_year < 100 THEN
    v_val_year := 2000 + v_val_year;
  END IF;

  IF v_val_year < v_cur_year OR (v_val_year = v_cur_year AND v_val_month < v_cur_month) THEN
    RAISE EXCEPTION 'ERRO 54: Cartão expirado.';
  END IF;

  -- 9. CONTA DO PAGADOR (TITULAR DO CARTÃO)
  SELECT id, user_id, name, cpf_cnpj, balance INTO v_payer_account
  FROM public.accounts
  WHERE id = v_card.account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta vinculada ao cartão pagador não encontrada.';
  END IF;

  -- 10. MOVIMENTAÇÃO DE SALDO E LIMITE (SCHEMA REAL: cartoes.current_balance & accounts.balance)
  IF p_tipo = 'debito' THEN
    IF v_payer_account.balance < v_gross_amount THEN
      RAISE EXCEPTION 'ERRO 51: Saldo insuficiente na conta para compra no débito (Disponível: R$ %, Necessário: R$ %).', v_payer_account.balance, v_gross_amount;
    END IF;

    UPDATE public.accounts
    SET balance = balance - v_gross_amount,
        updated_at = now()
    WHERE id = v_payer_account.id;
  ELSE
    -- Crédito: current_balance representa o saldo utilizado da fatura do cartão virtual
    IF (COALESCE(v_card.current_balance, 0) + v_gross_amount) > COALESCE(v_card.credit_limit, 5000) THEN
      RAISE EXCEPTION 'ERRO 51: Limite de crédito excedido no cartão (Limite: R$ %, Utilizado: R$ %, Tentativa: R$ %).', v_card.credit_limit, v_card.current_balance, v_gross_amount;
    END IF;

    UPDATE public.cartoes
    SET current_balance = COALESCE(current_balance, 0) + v_gross_amount
    WHERE id = v_card.id;
  END IF;

  -- Crédito no Merchant (OnTime liquida imediatamente; outros ficam pendentes para conciliação)
  v_is_instant := (v_effective_plan = 'ontime' OR v_effective_plan = 'nitro');
  IF v_is_instant THEN
    UPDATE public.accounts
    SET balance = balance + v_net_amount,
        updated_at = now()
    WHERE id = v_merchant_account.id;

    v_in_tx_status := 'completed';
    v_in_tx_desc := 'Recebimento Cartão ' || UPPER(p_tipo) || ' (Taxa ' || TO_CHAR(v_fee_rate, 'FM990.00') || '%: -R$ ' || TO_CHAR(v_fee_amount, 'FM999999990.00') || ' | Líquido: R$ ' || TO_CHAR(v_net_amount, 'FM999999990.00') || ') - OnTime';
  ELSE
    v_in_tx_status := 'pending';
    v_in_tx_desc := 'Recebimento Cartão ' || UPPER(p_tipo) || ' (Taxa ' || TO_CHAR(v_fee_rate, 'FM990.00') || '%: -R$ ' || TO_CHAR(v_fee_amount, 'FM999999990.00') || ' | Líquido: R$ ' || TO_CHAR(v_net_amount, 'FM999999990.00') || ') - ' || v_effective_plan;
  END IF;

  -- 11. METADADOS BANCÁRIOS
  v_nsu := LPAD(FLOOR(RANDOM() * 90000000 + 10000000)::TEXT, 8, '0');
  v_auth_code := LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');
  v_tid := 'TID-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 12));

  -- 12. LANÇAMENTOS NO SCHEMA REAL (public.transactions)
  INSERT INTO public.transactions (
    account_id,
    user_id,
    counterparty_account_id,
    counterparty_name,
    counterparty_document,
    type,
    direction,
    amount,
    status,
    description,
    external_reference,
    real_money,
    environment,
    created_at
  ) VALUES (
    v_payer_account.id,
    v_payer_account.user_id,
    v_merchant_account.id,
    v_merchant_account.name,
    v_merchant_account.cpf_cnpj,
    'card_payment',
    'out',
    v_gross_amount,
    'completed',
    'Compra Cartão ' || UPPER(p_tipo) ||
      CASE WHEN v_installments > 1 THEN ' (' || v_installments || 'x de R$ ' || TO_CHAR(ROUND(v_gross_amount / v_installments, 2), 'FM999999990.00') || ')' ELSE '' END ||
      ' em ' || COALESCE(v_merchant_account.name, 'Estabelecimento') || ' (NSU ' || v_nsu || ')',
    COALESCE(p_external_reference, 'CARD:' || v_card.id || '|INST:' || v_installments),
    false,
    'sandbox',
    v_occurred_at
  ) RETURNING id INTO v_tx_out_id;

  INSERT INTO public.transactions (
    account_id,
    user_id,
    counterparty_account_id,
    counterparty_name,
    counterparty_document,
    type,
    direction,
    amount,
    status,
    description,
    external_reference,
    real_money,
    environment,
    created_at
  ) VALUES (
    v_merchant_account.id,
    v_merchant_account.user_id,
    v_payer_account.id,
    COALESCE(p_cardholder_name, 'Cliente Cartão'),
    v_payer_account.cpf_cnpj,
    'card_payment',
    'in',
    v_net_amount,
    v_in_tx_status,
    v_in_tx_desc || ' - NSU ' || v_nsu,
    p_external_reference,
    false,
    'sandbox',
    v_occurred_at
  ) RETURNING id INTO v_tx_in_id;

  -- 13. OUTBOX AUTORITATIVO: card.paid (Somente webhooks inscritos em 'card.paid' ou '*')
  v_event_id := gen_random_uuid();
  v_event_payload := jsonb_build_object(
    'id', v_event_id,
    'event', 'card.paid',
    'createdAt', to_char(v_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'realMoney', false,
    'environment', 'sandbox',
    'data', jsonb_build_object(
      'transactionId', v_tx_in_id,
      'orderId', p_external_reference,
      'externalReference', p_external_reference,
      'amountGross', v_gross_amount,
      'feePercent', v_fee_rate,
      'feeAmount', v_fee_amount,
      'amountNet', v_net_amount,
      'installments', v_installments,
      'tipo', p_tipo,
      'status', 'paid',
      'authorizationCode', v_auth_code,
      'nsu', v_nsu,
      'tid', v_tid,
      'cardMasked', '•••• ' || RIGHT(COALESCE(v_clean_card_number, v_card.card_number, v_card.masked_number), 4),
      'cardBrand', COALESCE(v_card.brand, 'OptmaCard'),
      'cardholderName', COALESCE(p_cardholder_name, 'CLIENTE SANDBOX'),
      'merchantAccountId', v_merchant_account.id,
      'merchantName', v_merchant_account.name,
      'realMoney', false,
      'environment', 'sandbox',
      'paidAt', to_char(v_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );

  INSERT INTO public.webhook_events (
    id, account_id, event_type, resource_type, resource_id, idempotency_key, payload, occurred_at, created_at
  ) VALUES (
    v_event_id,
    v_merchant_account.id,
    'card.paid',
    'transaction',
    v_tx_in_id::text,
    'card.paid:' || v_tx_in_id::text,
    v_event_payload,
    v_occurred_at,
    v_occurred_at
  );

  FOR v_cfg IN
    SELECT id FROM public.webhooks_config
    WHERE account_id = p_merchant_account_id
      AND active = true
      AND ('card.paid' = ANY(events) OR '*' = ANY(events))
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

  -- 14. CONTRATO CANÔNICO DA RESPOSTA
  v_response_json := jsonb_build_object(
    'success', true,
    'status', 'approved',
    'message', 'Transação autorizada com sucesso no OptmaPay Sandbox!',
    'transaction_out_id', v_tx_out_id,
    'transactionOutId', v_tx_out_id,
    'transaction_in_id', v_tx_in_id,
    'transactionInId', v_tx_in_id,
    'transactionId', v_tx_in_id,
    'amount_gross', v_gross_amount,
    'gross_amount', v_gross_amount,
    'amountGross', v_gross_amount,
    'grossAmount', v_gross_amount,
    'fee_percent', v_fee_rate,
    'feePercent', v_fee_rate,
    'fee_amount', v_fee_amount,
    'feeAmount', v_fee_amount,
    'amount_net', v_net_amount,
    'net_amount', v_net_amount,
    'amountNet', v_net_amount,
    'netAmount', v_net_amount,
    'installments', v_installments,
    'tipo', p_tipo,
    'settlement_plan', v_effective_plan,
    'plan', v_effective_plan,
    'settlementPlan', v_effective_plan,
    'card_masked', '•••• ' || RIGHT(COALESCE(v_clean_card_number, v_card.card_number, v_card.masked_number), 4),
    'cardMasked', '•••• ' || RIGHT(COALESCE(v_clean_card_number, v_card.card_number, v_card.masked_number), 4),
    'card_brand', COALESCE(v_card.brand, 'OptmaCard'),
    'cardBrand', COALESCE(v_card.brand, 'OptmaCard'),
    'cardholder_name', COALESCE(p_cardholder_name, 'CLIENTE SANDBOX'),
    'cardholderName', COALESCE(p_cardholder_name, 'CLIENTE SANDBOX'),
    'authorization_code', v_auth_code,
    'authorizationCode', v_auth_code,
    'nsu', v_nsu,
    'tid', v_tid,
    'webhook_event_id', v_event_id,
    'webhookEventId', v_event_id,
    'order_id', p_external_reference,
    'orderId', p_external_reference,
    'external_reference', p_external_reference,
    'created_at', to_char(v_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'real_money', false,
    'environment', 'sandbox'
  );

  -- 15. FINALIZAÇÃO DA IDEMPOTÊNCIA NA MESMA TRANSAÇÃO
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
-- 5. RPC: transfer_pix (01D Hardened)
-- Exige ator obrigatório no service_role: p_actor_user_id IS NOT NULL e igual ao owner da conta.
-- Sem takeover de idempotência (in_progress retorna IDEMPOTENCY_IN_PROGRESS).
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transfer_pix(
  p_sender_account_id UUID,
  p_receiver_pix_key TEXT,
  p_amount NUMERIC,
  p_description TEXT DEFAULT 'Transferência Pix Sandbox',
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
  v_sender_account RECORD;
  v_receiver_account RECORD;
  v_sender_user_id UUID;
  v_receiver_user_id UUID;
  v_receiver_account_id UUID;
  v_receiver_name TEXT;
  v_sender_name TEXT;
  v_sender_cpf_cnpj TEXT;
  v_clean_key TEXT;
  v_tx_out_id UUID;
  v_tx_in_id UUID;
  v_event_id UUID;
  v_event_payload JSONB;
  v_response_json JSONB;
  v_idemp_id UUID;
  v_existing_idemp RECORD;
  v_cfg RECORD;
  v_role TEXT;
  v_occurred_at TIMESTAMPTZ := now();
BEGIN
  -- 1. VALIDAÇÃO DE VALOR
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor da transferência Pix deve ser maior que zero.';
  END IF;

  -- 2. VALIDAÇÃO E BLOQUEIO DA CONTA PAGADORA
  SELECT id, user_id, balance, name, cpf_cnpj INTO v_sender_account
  FROM public.accounts
  WHERE id = p_sender_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta pagadora não encontrada.';
  END IF;

  v_sender_user_id := v_sender_account.user_id;
  v_sender_name := v_sender_account.name;
  v_sender_cpf_cnpj := v_sender_account.cpf_cnpj;

  -- 3. FECHAMENTO DE SEGURANÇA SECURITY DEFINER COM EXIGÊNCIA ESTRITA DE ATOR
  v_role := COALESCE(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.role(), ''),
    current_user
  );

  IF v_role = 'authenticated' THEN
    -- Invocação por usuário logado (ex: Dashboard Pix)
    IF auth.uid() IS NULL OR v_sender_user_id IS NULL OR auth.uid() <> v_sender_user_id THEN
      RAISE EXCEPTION 'Acesso negado: você não tem permissão para movimentar fundos desta conta.';
    END IF;
    IF p_actor_user_id IS NOT NULL AND p_actor_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Acesso negado: o ator informado não corresponde ao usuário autenticado.';
    END IF;
  ELSIF v_role IN ('service_role', 'postgres', 'supabase_admin') THEN
    -- Invocação via service_role: p_actor_user_id É OBRIGATÓRIO e deve ser igual ao dono da conta pagadora
    IF p_actor_user_id IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: p_actor_user_id é obrigatório para transferências Pix via service_role.';
    END IF;
    IF v_sender_user_id IS NULL OR p_actor_user_id <> v_sender_user_id THEN
      RAISE EXCEPTION 'Acesso negado: o usuário autenticado não é o proprietário da conta pagadora.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Acesso negado: privilégios insuficientes para executar transfer_pix.';
  END IF;

  -- 4. CONTROLE ATÔMICO DE IDEMPOTÊNCIA NO POSTGRESQL (Sem takeover arbitrário)
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    INSERT INTO public.api_idempotency_keys (
      account_id,
      operation,
      idempotency_key,
      request_hash,
      status,
      actor_user_id,
      created_at,
      updated_at
    ) VALUES (
      p_sender_account_id,
      'pix:transfer',
      p_idempotency_key,
      p_request_hash,
      'in_progress',
      COALESCE(p_actor_user_id, v_sender_user_id),
      now(),
      now()
    )
    ON CONFLICT (account_id, operation, idempotency_key) DO NOTHING
    RETURNING id INTO v_idemp_id;

    IF v_idemp_id IS NULL THEN
      SELECT * INTO v_existing_idemp
      FROM public.api_idempotency_keys
      WHERE account_id = p_sender_account_id
        AND operation = 'pix:transfer'
        AND idempotency_key = p_idempotency_key;

      IF FOUND THEN
        IF p_request_hash IS NOT NULL AND v_existing_idemp.request_hash IS NOT NULL AND v_existing_idemp.request_hash <> p_request_hash THEN
          RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED: Esta Idempotency-Key já foi utilizada com parâmetros de requisição diferentes.';
        END IF;

        IF v_existing_idemp.status = 'completed' AND v_existing_idemp.response_body IS NOT NULL THEN
          RETURN jsonb_set(v_existing_idemp.response_body, '{from_cache}', 'true'::jsonb);
        END IF;

        -- Qualquer status in_progress retorna IDEMPOTENCY_IN_PROGRESS sem takeover não atômico
        IF v_existing_idemp.status = 'in_progress' THEN
          RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS: Uma transferência com esta Idempotency-Key já está sendo processada concorrentemente.';
        END IF;

        IF v_existing_idemp.status = 'failed' THEN
          RAISE EXCEPTION 'IDEMPOTENCY_FAILED: Transferência anterior com esta Idempotency-Key falhou e não pode ser reutilizada.';
        END IF;
      END IF;
    END IF;
  END IF;

  -- 5. VERIFICAÇÃO DE SALDO DISPONÍVEL
  IF v_sender_account.balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente para realizar a transferência Pix (Saldo: R$ %, Solicitado: R$ %).', v_sender_account.balance, p_amount;
  END IF;

  -- 6. BUSCA E BLOQUEIO DA CONTA RECEBEDORA
  v_clean_key := TRIM(p_receiver_pix_key);

  SELECT id, user_id, name, cpf_cnpj, balance INTO v_receiver_account
  FROM public.accounts
  WHERE pix_key = v_clean_key
     OR pix_key ILIKE v_clean_key
     OR cpf_cnpj = v_clean_key
     OR cpf_cnpj = regexp_replace(v_clean_key, '[^0-9]', '', 'g')
     OR (v_clean_key ~ '^[0-9a-fA-F-]{36}$' AND id = v_clean_key::uuid)
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chave Pix de destino "%" não encontrada no sistema de contas.', p_receiver_pix_key;
  END IF;

  v_receiver_account_id := v_receiver_account.id;
  v_receiver_name := v_receiver_account.name;
  v_receiver_user_id := v_receiver_account.user_id;

  IF p_sender_account_id = v_receiver_account_id THEN
    RAISE EXCEPTION 'A conta de origem e a conta de destino não podem ser iguais.';
  END IF;

  -- 7. ATUALIZAÇÃO ATÔMICA DOS SALDOS REAIS
  UPDATE public.accounts
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE id = p_sender_account_id;

  UPDATE public.accounts
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE id = v_receiver_account_id;

  -- 8. LANÇAMENTOS NO SCHEMA REAL (public.transactions)
  INSERT INTO public.transactions (
    account_id,
    user_id,
    counterparty_account_id,
    counterparty_name,
    counterparty_document,
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
    p_sender_account_id,
    v_sender_user_id,
    v_receiver_account_id,
    v_receiver_name,
    v_receiver_account.cpf_cnpj,
    'pix',
    'out',
    p_amount,
    p_description,
    p_external_reference,
    'completed',
    false,
    'sandbox',
    v_occurred_at
  ) RETURNING id INTO v_tx_out_id;

  INSERT INTO public.transactions (
    account_id,
    user_id,
    counterparty_account_id,
    counterparty_name,
    counterparty_document,
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
    v_receiver_account_id,
    v_receiver_user_id,
    p_sender_account_id,
    v_sender_name,
    v_sender_cpf_cnpj,
    'pix',
    'in',
    p_amount,
    p_description,
    p_external_reference,
    'completed',
    false,
    'sandbox',
    v_occurred_at
  ) RETURNING id INTO v_tx_in_id;

  -- 9. OUTBOX AUTORITATIVO: pix.paid (Somente webhooks inscritos em 'pix.paid' ou '*')
  v_event_id := gen_random_uuid();
  v_event_payload := jsonb_build_object(
    'id', v_event_id,
    'event', 'pix.paid',
    'createdAt', to_char(v_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'realMoney', false,
    'environment', 'sandbox',
    'data', jsonb_build_object(
      'transactionId', v_tx_in_id,
      'orderId', p_external_reference,
      'externalReference', p_external_reference,
      'amount', p_amount,
      'status', 'paid',
      'senderName', v_sender_name,
      'receiverName', v_receiver_name,
      'senderAccountId', p_sender_account_id,
      'receiverAccountId', v_receiver_account_id,
      'realMoney', false,
      'environment', 'sandbox',
      'paidAt', to_char(v_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );

  INSERT INTO public.webhook_events (
    id, account_id, event_type, resource_type, resource_id, idempotency_key, payload, occurred_at, created_at
  ) VALUES (
    v_event_id,
    v_receiver_account_id,
    'pix.paid',
    'transaction',
    v_tx_in_id::text,
    'pix.paid:' || v_tx_in_id::text,
    v_event_payload,
    v_occurred_at,
    v_occurred_at
  );

  FOR v_cfg IN
    SELECT id FROM public.webhooks_config
    WHERE account_id = v_receiver_account_id
      AND active = true
      AND ('pix.paid' = ANY(events) OR '*' = ANY(events))
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

  -- 10. CONTRATO CANÔNICO DA RESPOSTA
  v_response_json := jsonb_build_object(
    'success', true,
    'message', 'Transferência Pix concluída com sucesso!',
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
    'created_at', to_char(v_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'real_money', false,
    'environment', 'sandbox'
  );

  -- 11. FINALIZAÇÃO DA IDEMPOTÊNCIA NA MESMA TRANSAÇÃO
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
