-- ==============================================================================
-- OPTMAPAY SANDBOX - PACOTE 01C: CORREÇÕES OBRIGATÓRIAS PÓS-AUDITORIA
-- 1. Schema real restaurado: public.cartoes (current_balance), accounts (balance)
-- 2. Transações normalizadas: type='card_payment' e 'pix', direction='in'/'out',
--    amount sempre positivo (> 0), counterparty_*, real_money=false, environment='sandbox'
-- 3. Fechamento estrito de SECURITY DEFINER em transfer_pix e process_card_payment
-- 4. Centralização do claim de webhooks (claim_single_webhook_job não rouba lock ativo)
-- 5. Subscriptions de outbox filtradas por evento específico ou wildcard
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. GARANTIA DE COLUNAS DO SCHEMA REAL
-- ------------------------------------------------------------------------------

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS counterparty_document TEXT;
ALTER TABLE public.cartoes ADD COLUMN IF NOT EXISTS card_number TEXT;
ALTER TABLE public.cartoes ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT 'OptmaCard';
ALTER TABLE public.cartoes ADD COLUMN IF NOT EXISTS pin TEXT;
ALTER TABLE public.webhook_delivery_jobs ADD COLUMN IF NOT EXISTS locked_by TEXT;
ALTER TABLE public.api_idempotency_keys ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.api_idempotency_keys ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.api_idempotency_keys ALTER COLUMN api_key_id DROP NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. RPC: claim_single_webhook_job (Proteção contra roubo de locks vigentes)
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
        -- Se estiver em 'delivering', NUNCA pode ser roubado enquanto o lock estiver vigente (< 5 min).
        -- SÓ é elegível se o lock estiver expirado (> 5 min).
        (j.status = 'delivering' AND (j.locked_at IS NULL OR j.locked_at < (now() - INTERVAL '5 minutes')))
        -- Se NÃO estiver em 'delivering', pode ser capturado se for pending/retry,
        -- ou se for um retry manual explícito (p_force_retry = true) sobre jobs finalizados/mortos.
        OR (
          j.status <> 'delivering' AND (
            j.status IN ('pending', 'retry')
            OR (p_force_retry = true AND j.status IN ('delivered', 'dead', 'failed'))
          )
        )
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
-- 3. RPC: process_card_payment (Schema Real + Autorização Fechada)
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
  v_fee_percent NUMERIC(5, 4);
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
BEGIN
  -- 1. VALIDAÇÃO DE VALOR
  v_gross_amount := ROUND(COALESCE(p_amount, 0), 2);
  IF v_gross_amount <= 0 THEN
    RAISE EXCEPTION 'O valor da transação deve ser maior que zero.';
  END IF;

  -- 2. VALIDAÇÃO E BLOQUEIO DA CONTA MERCHANT
  SELECT id, user_id, name, cpf_cnpj, balance INTO v_merchant_account
  FROM public.accounts
  WHERE id = p_merchant_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta do estabelecimento (merchant) não encontrada.';
  END IF;

  v_merchant_user_id := v_merchant_account.user_id;

  -- 3. FECHAMENTO DE SEGURANÇA SECURITY DEFINER
  v_role := COALESCE(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.role(), ''),
    current_user
  );

  IF v_role = 'authenticated' THEN
    -- Chamada vinda de usuário logado (ex: POS virtual no Dashboard)
    IF auth.uid() IS NULL OR v_merchant_user_id IS NULL OR auth.uid() <> v_merchant_user_id THEN
      RAISE EXCEPTION 'Acesso negado: você não tem permissão para processar cobranças para esta conta merchant.';
    END IF;
  ELSIF v_role IN ('service_role', 'postgres', 'supabase_admin') THEN
    -- Chamada vinda da fachada API Node (/cards/charge)
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

  -- 4. CONTROLE ATÔMICO DE IDEMPOTÊNCIA NO POSTGRESQL (ON CONFLICT DO NOTHING)
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

    -- Se perdeu o conflito, a requisição já existe ou foi processada
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

        IF v_existing_idemp.status = 'in_progress' AND v_existing_idemp.created_at > (now() - INTERVAL '2 minutes') THEN
          RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS: Uma transação com esta Idempotency-Key já está sendo processada concorrentemente.';
        END IF;

        -- Lock expirado sem conclusão: assume o processamento
        v_idemp_id := v_existing_idemp.id;
        UPDATE public.api_idempotency_keys
        SET status = 'in_progress',
            request_hash = COALESCE(p_request_hash, request_hash),
            updated_at = now()
        WHERE id = v_idemp_id;
      END IF;
    END IF;
  END IF;

  -- 5. VALIDAÇÃO DE PLANO E MODALIDADE
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
    IF v_effective_plan NOT IN ('standard', 'd7', 'd15', 'due_date', 'ontime', 'nitro') THEN
      v_effective_plan := 'standard';
    END IF;
  END IF;

  -- 6. MATRIZ OFICIAL DE TAXAS MDR (Alinhada estritamente com cardRules.ts - Standard 1x crédito = 2.89%)
  IF p_tipo = 'debito' THEN
    IF v_effective_plan = 'ontime' THEN
      v_fee_percent := 0.0115; -- 1.15% OnTime Débito
    ELSIF v_effective_plan = 'd7' THEN
      v_fee_percent := 0.008245;
    ELSIF v_effective_plan = 'd15' THEN
      v_fee_percent := 0.008075;
    ELSIF v_effective_plan = 'due_date' THEN
      v_fee_percent := 0.00765;
    ELSE
      v_fee_percent := 0.0085; -- 0.85% Standard Débito
    END IF;
  ELSE
    -- Crédito: 0% de acréscimo comercial por parcelamento no OptmaPay
    IF v_effective_plan = 'standard' THEN
      v_fee_percent := CASE v_installments
        WHEN 1 THEN 0.0289  -- 2.89% Crédito 1x Standard
        WHEN 2 THEN 0.0422
        WHEN 3 THEN 0.0483
        WHEN 4 THEN 0.0544
        WHEN 5 THEN 0.0605
        WHEN 6 THEN 0.0664
        WHEN 7 THEN 0.0724
        WHEN 8 THEN 0.0782
        WHEN 9 THEN 0.0841
        WHEN 10 THEN 0.0898
        WHEN 11 THEN 0.0956
        ELSE 0.1012
      END;
    ELSIF v_effective_plan = 'd7' THEN
      v_fee_percent := CASE v_installments
        WHEN 1 THEN 0.028033
        WHEN 2 THEN 0.040934
        WHEN 3 THEN 0.046851
        WHEN 4 THEN 0.052768
        WHEN 5 THEN 0.058685
        WHEN 6 THEN 0.064408
        WHEN 7 THEN 0.070228
        WHEN 8 THEN 0.075854
        WHEN 9 THEN 0.081577
        WHEN 10 THEN 0.087106
        WHEN 11 THEN 0.092732
        ELSE 0.098164
      END;
    ELSIF v_effective_plan = 'd15' THEN
      v_fee_percent := CASE v_installments
        WHEN 1 THEN 0.027455
        WHEN 2 THEN 0.040090
        WHEN 3 THEN 0.045885
        WHEN 4 THEN 0.051680
        WHEN 5 THEN 0.057475
        WHEN 6 THEN 0.063080
        WHEN 7 THEN 0.068780
        WHEN 8 THEN 0.074290
        WHEN 9 THEN 0.079895
        WHEN 10 THEN 0.085310
        WHEN 11 THEN 0.090820
        ELSE 0.096140
      END;
    ELSIF v_effective_plan = 'due_date' THEN
      v_fee_percent := CASE v_installments
        WHEN 1 THEN 0.026010
        WHEN 2 THEN 0.037980
        WHEN 3 THEN 0.043470
        WHEN 4 THEN 0.048960
        WHEN 5 THEN 0.054450
        WHEN 6 THEN 0.059760
        WHEN 7 THEN 0.065160
        WHEN 8 THEN 0.070380
        WHEN 9 THEN 0.075690
        WHEN 10 THEN 0.080820
        WHEN 11 THEN 0.086040
        ELSE 0.091080
      END;
    ELSIF v_effective_plan = 'ontime' OR v_effective_plan = 'nitro' THEN
      v_fee_percent := CASE v_installments
        WHEN 1 THEN 0.0389
        WHEN 2 THEN 0.0522
        WHEN 3 THEN 0.0583
        WHEN 4 THEN 0.0644
        WHEN 5 THEN 0.0705
        WHEN 6 THEN 0.0764
        WHEN 7 THEN 0.0824
        WHEN 8 THEN 0.0882
        WHEN 9 THEN 0.0941
        WHEN 10 THEN 0.0998
        WHEN 11 THEN 0.1056
        ELSE 0.1112
      END;
    END IF;
  END IF;

  v_fee_amount := ROUND(v_gross_amount * v_fee_percent, 2);
  v_net_amount := v_gross_amount - v_fee_amount;

  -- 7. VALIDAÇÃO DE BANDEIRA E LOCALIZAÇÃO NO SCHEMA REAL (public.cartoes)
  IF p_card_number IS NOT NULL AND TRIM(p_card_number) <> '' THEN
    v_clean_card_number := regexp_replace(p_card_number, '[^0-9]', '', 'g');
  END IF;

  IF v_clean_card_number IS NOT NULL AND LENGTH(v_clean_card_number) >= 4 THEN
    IF NOT (v_clean_card_number LIKE '5899%' OR v_clean_card_number LIKE '5898%') THEN
      RAISE EXCEPTION 'ERRO 05: Cartão não permitido. O OptmaPay Sandbox aceita exclusivamente cartões fictícios (prefixos 5899 ou 5898).';
    END IF;
  END IF;

  SELECT * INTO v_card
  FROM public.cartoes
  WHERE (p_card_id IS NOT NULL AND id = p_card_id)
     OR (v_clean_card_number IS NOT NULL AND card_number = v_clean_card_number)
     OR (v_clean_card_number IS NOT NULL AND masked_number LIKE '%' || RIGHT(v_clean_card_number, 4))
  ORDER BY (CASE WHEN p_card_id IS NOT NULL AND id = p_card_id THEN 0 ELSE 1 END), created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERRO 14: Cartão fictício não encontrado no OptmaPay Sandbox.';
  END IF;

  IF v_card.status = 'blocked' THEN
    RAISE EXCEPTION 'ERRO 62: Cartão bloqueado para compras. Desbloqueie na carteira antes de transacionar.';
  END IF;

  -- Validações de CVV e Validade se informados
  IF p_cvv IS NOT NULL AND TRIM(p_cvv) <> '' AND v_card.cvv IS NOT NULL AND TRIM(v_card.cvv) <> '' THEN
    IF TRIM(v_card.cvv) <> TRIM(p_cvv) THEN
      RAISE EXCEPTION 'ERRO 55: Código CVV incorreto.';
    END IF;
  END IF;

  IF p_validade IS NOT NULL AND TRIM(p_validade) <> '' AND v_card.validade IS NOT NULL AND TRIM(v_card.validade) <> '' THEN
    IF TRIM(v_card.validade) <> TRIM(p_validade) THEN
      RAISE EXCEPTION 'ERRO 54: Data de validade do cartão incorreta.';
    END IF;
  END IF;

  -- 8. CONTA DO PAGADOR (TITULAR DO CARTÃO)
  SELECT id, user_id, name, cpf_cnpj, balance INTO v_payer_account
  FROM public.accounts
  WHERE id = v_card.account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta vinculada ao cartão pagador não encontrada.';
  END IF;

  -- 9. MOVIMENTAÇÃO DE SALDO E LIMITE (SCHEMA REAL: cartoes.current_balance & accounts.balance)
  IF p_tipo = 'debito' THEN
    IF v_payer_account.balance < v_gross_amount THEN
      RAISE EXCEPTION 'ERRO 51: Saldo insuficiente na conta para compra no débito (Disponível: R$ %, Necessário: R$ %).', v_payer_account.balance, v_gross_amount;
    END IF;

    UPDATE public.accounts
    SET balance = balance - v_gross_amount,
        updated_at = now()
    WHERE id = v_payer_account.id;
  ELSE
    -- Crédito: current_balance representa o saldo utilizado do cartão virtual
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
    v_in_tx_desc := 'Recebimento Cartão ' || UPPER(p_tipo) || ' (Taxa ' || TO_CHAR(v_fee_percent * 100, 'FM990.00') || '%: -R$ ' || TO_CHAR(v_fee_amount, 'FM999999990.00') || ' | Líquido: R$ ' || TO_CHAR(v_net_amount, 'FM999999990.00') || ') - OnTime';
  ELSE
    v_in_tx_status := 'pending';
    v_in_tx_desc := 'Recebimento Cartão ' || UPPER(p_tipo) || ' (Taxa ' || TO_CHAR(v_fee_percent * 100, 'FM990.00') || '%: -R$ ' || TO_CHAR(v_fee_amount, 'FM999999990.00') || ' | Líquido: R$ ' || TO_CHAR(v_net_amount, 'FM999999990.00') || ') - ' || v_effective_plan;
  END IF;

  -- 10. METADADOS BANCÁRIOS
  v_nsu := LPAD(FLOOR(RANDOM() * 90000000 + 10000000)::TEXT, 8, '0');
  v_auth_code := LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');
  v_tid := 'TID-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 12));

  -- 11. LANÇAMENTOS NO SCHEMA REAL (public.transactions: type='card_payment', direction='out' e 'in', amount > 0)
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

  -- 12. OUTBOX AUTORITATIVO: card.paid (Somente webhooks inscritos em 'card.paid' ou '*')
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
      'feePercent', ROUND(v_fee_percent * 100, 2),
      'feeAmount', v_fee_amount,
      'amountNet', v_net_amount,
      'installments', v_installments,
      'tipo', p_tipo,
      'status', 'paid',
      'authorizationCode', v_auth_code,
      'nsu', v_nsu,
      'tid', v_tid,
      'cardMasked', '•••• ' || RIGHT(COALESCE(v_clean_card_number, v_card.masked_number), 4),
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

  -- Gera delivery jobs filtrando estritamente pelas inscrições ativas em 'card.paid' ou wildcard '*'
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

  -- 13. CONTRATO CANÔNICO DA RESPOSTA
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
    'fee_percent', ROUND(v_fee_percent * 100, 2),
    'feePercent', ROUND(v_fee_percent * 100, 2),
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
    'card_masked', '•••• ' || RIGHT(COALESCE(v_clean_card_number, v_card.masked_number), 4),
    'cardMasked', '•••• ' || RIGHT(COALESCE(v_clean_card_number, v_card.masked_number), 4),
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

  -- 14. FINALIZAÇÃO DA IDEMPOTÊNCIA NA MESMA TRANSAÇÃO
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
-- 4. RPC: transfer_pix (Schema Real + Autorização Fechada)
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

  -- 3. FECHAMENTO DE SEGURANÇA SECURITY DEFINER
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
    -- Invocação via service_role (Edge Function pix-transfer após autenticar o JWT do usuário)
    IF p_actor_user_id IS NOT NULL AND v_sender_user_id IS NOT NULL AND p_actor_user_id <> v_sender_user_id THEN
      RAISE EXCEPTION 'Acesso negado: o usuário autenticado não é o proprietário da conta pagadora.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Acesso negado: privilégios insuficientes para executar transfer_pix.';
  END IF;

  -- 4. CONTROLE ATÔMICO DE IDEMPOTÊNCIA NO POSTGRESQL (ON CONFLICT DO NOTHING)
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

    -- Se perdeu o conflito, já existe uma tentativa registrada
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

        IF v_existing_idemp.status = 'in_progress' AND v_existing_idemp.created_at > (now() - INTERVAL '2 minutes') THEN
          RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS: Uma transferência com esta Idempotency-Key já está sendo processada concorrentemente.';
        END IF;

        -- Lock expirado: assume o processamento
        v_idemp_id := v_existing_idemp.id;
        UPDATE public.api_idempotency_keys
        SET status = 'in_progress',
            request_hash = COALESCE(p_request_hash, request_hash),
            updated_at = now()
        WHERE id = v_idemp_id;
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

  -- 8. LANÇAMENTOS NO SCHEMA REAL (public.transactions: type='pix', direction='out' e 'in', amount > 0)
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

  -- Gera delivery jobs filtrando estritamente pelas inscrições ativas em 'pix.paid' ou wildcard '*'
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
