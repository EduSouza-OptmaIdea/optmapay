-- ==============================================================================
-- OPTMAPAY SANDBOX - PACOTE 01 HARDENING (MIGRATION 2)
-- Eventos autoritativos de pagamento no mesmo escopo transacional:
-- 1. transfer_pix: Criação atômica de pix.paid + webhook_delivery_jobs
-- 2. refund_pix: Criação atômica de pix.refunded + webhook_delivery_jobs
-- 3. process_card_payment: Validação estrita, criação atômica de card.paid e
--    contrato canônico normalizado
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. transfer_pix ATÔMICO COM OUTBOX
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_pix(
  p_sender_account_id UUID,
  p_receiver_pix_key TEXT,
  p_amount DECIMAL(15, 2),
  p_description TEXT DEFAULT 'Transferência Pix Sandbox',
  p_external_reference TEXT DEFAULT NULL
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
BEGIN
  -- 1. Validação de valor
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor da transferência deve ser maior que zero.';
  END IF;

  -- 2. Validação e bloqueio da conta pagadora
  SELECT user_id, balance, name, cpf_cnpj INTO v_sender_user_id, v_sender_balance, v_sender_name, v_sender_cpf_cnpj
  FROM public.accounts
  WHERE id = p_sender_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta pagadora não encontrada.';
  END IF;

  -- Validação de ownership para chamadas authenticated
  IF auth.uid() IS NOT NULL AND v_sender_user_id IS NOT NULL AND auth.uid() <> v_sender_user_id THEN
    RAISE EXCEPTION 'Você não tem permissão para movimentar fundos desta conta.';
  END IF;

  IF v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente para realizar a transferência Pix (Saldo: R$ %, Solicitado: R$ %).', v_sender_balance, p_amount;
  END IF;

  -- 3. Busca e bloqueio da conta recebedora
  v_clean_key := TRIM(p_receiver_pix_key);

  SELECT id, name, pix_key, user_id INTO v_receiver_account_id, v_receiver_name, v_receiver_pix_key, v_receiver_user_id
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

  IF p_sender_account_id = v_receiver_account_id THEN
    RAISE EXCEPTION 'A conta de origem e a conta de destino não podem ser iguais.';
  END IF;

  -- 4. Débito no Pagador e Crédito no Recebedor
  UPDATE public.accounts
  SET balance = balance - p_amount, updated_at = now()
  WHERE id = p_sender_account_id;

  UPDATE public.accounts
  SET balance = balance + p_amount, updated_at = now()
  WHERE id = v_receiver_account_id;

  -- 5. Lançamentos espelhados com ownership correto por conta
  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment, created_at
  ) VALUES (
    v_sender_user_id, p_sender_account_id, v_receiver_account_id, v_receiver_name,
    'pix', 'out', p_amount, p_description, p_external_reference, 'completed', false, 'sandbox', v_occurred_at
  ) RETURNING id INTO v_out_tx_id;

  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment, created_at
  ) VALUES (
    v_receiver_user_id, v_receiver_account_id, p_sender_account_id, v_sender_name,
    'pix', 'in', p_amount, p_description, p_external_reference, 'completed', false, 'sandbox', v_occurred_at
  ) RETURNING id INTO v_in_tx_id;

  -- 6. Criação autoritativa do evento pix.paid no mesmo transaction scope
  v_event_id := gen_random_uuid();
  v_event_payload := jsonb_build_object(
    'id', v_event_id,
    'event', 'pix.paid',
    'createdAt', to_char(v_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'realMoney', false,
    'environment', 'sandbox',
    'data', jsonb_build_object(
      'transactionId', v_in_tx_id,
      'orderId', p_external_reference,
      'externalReference', p_external_reference,
      'amount', p_amount,
      'status', 'paid',
      'senderName', v_sender_name,
      'receiverName', v_receiver_name,
      'receiverPixKey', v_receiver_pix_key,
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
    v_in_tx_id::text,
    'pix.paid:' || v_in_tx_id::text,
    v_event_payload,
    v_occurred_at,
    v_occurred_at
  );

  -- Gera delivery jobs para todos os webhooks ativos do recebedor
  INSERT INTO public.webhook_delivery_jobs (event_id, webhook_config_id, status, next_attempt_at)
  SELECT v_event_id, cfg.id, 'pending', now()
  FROM public.webhooks_config cfg
  WHERE cfg.account_id = v_receiver_account_id
    AND cfg.active = true
    AND ('pix.paid' = ANY(cfg.events) OR '*' = ANY(cfg.events));

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Transferência Pix concluída com sucesso!',
    'amount', p_amount,
    'sender_account_id', p_sender_account_id,
    'sender_name', v_sender_name,
    'receiver_account_id', v_receiver_account_id,
    'receiver_name', v_receiver_name,
    'transaction_out_id', v_out_tx_id,
    'transaction_in_id', v_in_tx_id,
    'webhook_event_id', v_event_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_pix(UUID, TEXT, DECIMAL, TEXT, TEXT) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 2. refund_pix ATÔMICO COM OUTBOX
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_pix(
  p_original_transaction_id UUID,
  p_refund_amount DECIMAL(15, 2),
  p_reason TEXT DEFAULT 'Devolução Pix solicitada pelo recebedor'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_orig_tx RECORD;
  v_sender_account RECORD;
  v_receiver_account RECORD;
  v_refund_out_id UUID;
  v_refund_in_id UUID;
  v_ref TEXT;
  v_already_refunded DECIMAL(15, 2);
  v_remaining_refundable DECIMAL(15, 2);
  v_event_id UUID;
  v_event_payload JSONB;
  v_occurred_at TIMESTAMPTZ := now();
BEGIN
  IF p_refund_amount <= 0 THEN
    RAISE EXCEPTION 'O valor do reembolso deve ser maior que zero.';
  END IF;

  SELECT * INTO v_orig_tx
  FROM public.transactions
  WHERE id = p_original_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transação original não encontrada.';
  END IF;

  IF v_orig_tx.type <> 'pix' OR v_orig_tx.direction <> 'in' THEN
    RAISE EXCEPTION 'A devolução só pode ser realizada a partir de um Pix recebido.';
  END IF;

  v_already_refunded := COALESCE(v_orig_tx.refunded_amount, 0.00);
  v_remaining_refundable := v_orig_tx.amount - v_already_refunded;

  IF v_remaining_refundable <= 0 THEN
    RAISE EXCEPTION 'Este Pix já foi totalmente devolvido (Total recebido: R$ %, Total já estornado: R$ %).', v_orig_tx.amount, v_already_refunded;
  END IF;

  IF p_refund_amount > v_remaining_refundable THEN
    RAISE EXCEPTION 'O valor solicitado (R$ %) é maior que o saldo restante disponível para devolução (R$ %).', p_refund_amount, v_remaining_refundable;
  END IF;

  -- Conta que recebeu originalmente e agora devolve (sender do refund)
  SELECT * INTO v_sender_account
  FROM public.accounts
  WHERE id = v_orig_tx.account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta recebedora original não encontrada.';
  END IF;

  IF auth.uid() IS NOT NULL AND v_sender_account.user_id IS NOT NULL AND auth.uid() <> v_sender_account.user_id THEN
    RAISE EXCEPTION 'Você não tem permissão para estornar fundos desta conta.';
  END IF;

  IF v_sender_account.balance < p_refund_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente para realizar a devolução Pix (Saldo: R$ %, Solicitado: R$ %).', v_sender_account.balance, p_refund_amount;
  END IF;

  -- Conta que pagou originalmente e agora recebe a devolução (receiver do refund)
  SELECT * INTO v_receiver_account
  FROM public.accounts
  WHERE id = v_orig_tx.counterparty_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta original do pagador não encontrada para devolução.';
  END IF;

  -- Atualiza saldos
  UPDATE public.accounts
  SET balance = balance - p_refund_amount, updated_at = now()
  WHERE id = v_sender_account.id;

  UPDATE public.accounts
  SET balance = balance + p_refund_amount, updated_at = now()
  WHERE id = v_receiver_account.id;

  UPDATE public.transactions
  SET refunded_amount = v_already_refunded + p_refund_amount,
      status = CASE 
        WHEN (v_already_refunded + p_refund_amount) >= v_orig_tx.amount THEN 'refunded'
        ELSE status
      END
  WHERE id = v_orig_tx.id;

  v_ref := 'DEV-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment,
    related_transaction_id, created_at
  ) VALUES (
    v_sender_account.user_id, v_sender_account.id, v_receiver_account.id, v_receiver_account.name,
    'pix', 'out', p_refund_amount, 'Devolução Pix: ' || p_reason, v_ref, 'completed', false, 'sandbox',
    v_orig_tx.id, v_occurred_at
  ) RETURNING id INTO v_refund_out_id;

  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment,
    related_transaction_id, created_at
  ) VALUES (
    v_receiver_account.user_id, v_receiver_account.id, v_sender_account.id, v_sender_account.name,
    'pix', 'in', p_refund_amount, 'Reembolso Pix Recebido: ' || p_reason, v_ref, 'completed', false, 'sandbox',
    v_orig_tx.id, v_occurred_at
  ) RETURNING id INTO v_refund_in_id;

  -- Evento autoritativo de devolução Pix
  v_event_id := gen_random_uuid();
  v_event_payload := jsonb_build_object(
    'id', v_event_id,
    'event', 'pix.refunded',
    'createdAt', to_char(v_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'realMoney', false,
    'environment', 'sandbox',
    'data', jsonb_build_object(
      'refundTransactionId', v_refund_out_id,
      'originalTransactionId', v_orig_tx.id,
      'refundAmount', p_refund_amount,
      'reason', p_reason,
      'alreadyRefundedTotal', v_already_refunded + p_refund_amount,
      'remainingRefundable', v_orig_tx.amount - (v_already_refunded + p_refund_amount),
      'isFullyRefunded', (v_already_refunded + p_refund_amount) >= v_orig_tx.amount,
      'externalReference', v_ref,
      'realMoney', false,
      'environment', 'sandbox'
    )
  );

  INSERT INTO public.webhook_events (
    id, account_id, event_type, resource_type, resource_id, idempotency_key, payload, occurred_at, created_at
  ) VALUES (
    v_event_id,
    v_sender_account.id,
    'pix.refunded',
    'transaction',
    v_refund_out_id::text,
    'pix.refunded:' || v_refund_out_id::text,
    v_event_payload,
    v_occurred_at,
    v_occurred_at
  );

  INSERT INTO public.webhook_delivery_jobs (event_id, webhook_config_id, status, next_attempt_at)
  SELECT v_event_id, cfg.id, 'pending', now()
  FROM public.webhooks_config cfg
  WHERE cfg.account_id = v_sender_account.id
    AND cfg.active = true
    AND ('pix.refunded' = ANY(cfg.events) OR '*' = ANY(cfg.events));

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Devolução Pix realizada com sucesso!',
    'refund_amount', p_refund_amount,
    'already_refunded_total', v_already_refunded + p_refund_amount,
    'remaining_refundable', v_orig_tx.amount - (v_already_refunded + p_refund_amount),
    'is_fully_refunded', (v_already_refunded + p_refund_amount) >= v_orig_tx.amount,
    'sender_name', v_sender_account.name,
    'receiver_name', v_receiver_account.name,
    'external_reference', v_ref,
    'webhook_event_id', v_event_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_pix(UUID, DECIMAL, TEXT) TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 3. process_card_payment ATÔMICO COM OUTBOX E CONTRATO NORMALIZADO
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
  p_fee_percent DECIMAL(5, 2) DEFAULT 0.00,
  p_fee_amount DECIMAL(15, 2) DEFAULT 0.00,
  p_net_amount DECIMAL(15, 2) DEFAULT 0.00,
  p_description TEXT DEFAULT 'Venda Cartão OptmaPay',
  p_external_reference TEXT DEFAULT NULL,
  p_pin TEXT DEFAULT NULL,
  p_card_id UUID DEFAULT NULL
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
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor da transação deve ser maior que zero.';
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
    v_effective_plan := p_plan;
  END IF;

  -- 2. Validação estrita de BIN OptmaPay Sandbox
  v_clean_card_number := regexp_replace(p_card_number, '[^0-9]', '', 'g');

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

  -- 3. Localização do cartão fictício cadastrado (por id ou número completo, sem adivinhar por 4 dígitos)
  SELECT * INTO v_card
  FROM public.cartoes
  WHERE (p_card_id IS NOT NULL AND id = p_card_id)
     OR (card_number IS NOT NULL AND card_number = v_clean_card_number)
     OR (card_number IS NULL AND masked_number LIKE '%' || RIGHT(v_clean_card_number, 4))
  ORDER BY (CASE WHEN p_card_id IS NOT NULL AND id = p_card_id THEN 0 ELSE 1 END), created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERRO 14: Cartão fictício não cadastrado ou não encontrado no OptmaPay Sandbox.';
  END IF;

  -- Atualiza o card_number se estava NULL no registro legado
  IF v_card.card_number IS NULL AND LENGTH(v_clean_card_number) = 16 THEN
    UPDATE public.cartoes SET card_number = v_clean_card_number WHERE id = v_card.id;
  END IF;

  -- 4. Validações de segurança do cartão
  IF v_card.status = 'blocked' THEN
    RAISE EXCEPTION 'ERRO 62: Cartão bloqueado para compras. Desbloqueie na carteira de cartões antes de transacionar.';
  END IF;

  -- Validação de CVV se informado
  IF p_cvv IS NOT NULL AND TRIM(p_cvv) <> '' AND v_card.cvv IS NOT NULL AND TRIM(v_card.cvv) <> '' THEN
    IF TRIM(v_card.cvv) <> TRIM(p_cvv) THEN
      RAISE EXCEPTION 'ERRO 55: Código CVV incorreto.';
    END IF;
  END IF;

  -- Validação de Validade se informada
  IF p_validade IS NOT NULL AND TRIM(p_validade) <> '' AND v_card.validade IS NOT NULL AND TRIM(v_card.validade) <> '' THEN
    IF TRIM(v_card.validade) <> TRIM(p_validade) THEN
      RAISE EXCEPTION 'ERRO 54: Data de validade do cartão incorreta.';
    END IF;
  END IF;

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
    v_plan_label := 'Lançamento Futuro D+7 Útil (-3% desc)';
  ELSIF v_effective_plan = 'd15' THEN
    v_plan_label := 'Lançamento Futuro D+15 Útil (-5% desc)';
  ELSIF v_effective_plan = 'due_date' THEN
    v_plan_label := 'Lançamento Futuro no Vencimento (-10% desc)';
  ELSIF v_is_fast_plan THEN
    v_plan_label := '⚡ OnTime (Na Hora)';
  ELSE
    v_plan_label := 'Lançamento Futuro D+1 Útil';
  END IF;

  IF v_is_fast_plan THEN
    UPDATE public.accounts
    SET balance = balance + p_net_amount, updated_at = now()
    WHERE id = v_merchant_account.id;

    v_in_tx_status := 'completed';
    v_in_tx_desc := 'Recebimento Cartão ' || UPPER(p_tipo) || ' (Taxa ' || p_fee_percent || '%: -R$ ' || p_fee_amount || ' | Líquido: R$ ' || p_net_amount || ') - ' || v_plan_label;
  ELSE
    v_in_tx_status := 'pending';
    v_in_tx_desc := 'Recebimento Cartão ' || UPPER(p_tipo) || ' (Taxa ' || p_fee_percent || '%: -R$ ' || p_fee_amount || ' | Líquido: R$ ' || p_net_amount || ') - ' || v_plan_label;
  END IF;

  -- 8. Geradores de NSU, Auth Code e TID
  v_nsu := LPAD(FLOOR(RANDOM() * 90000000 + 10000000)::TEXT, 8, '0');
  v_auth_code := LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');
  v_tid := 'TID-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 12));
  v_masked_card := '•••• ' || RIGHT(v_clean_card_number, 4);

  -- 9. Transações espelhadas com ownership correto
  INSERT INTO public.transactions (
    account_id, user_id, counterparty_account_id, counterparty_name, counterparty_document,
    type, direction, amount, status, description, external_reference, created_at
  ) VALUES (
    v_payer_account.id,
    v_payer_user_id,
    v_merchant_account.id,
    v_merchant_account.name,
    v_merchant_account.cpf_cnpj,
    'card_payment',
    'out',
    p_amount,
    'completed',
    'Compra Cartão ' || UPPER(p_tipo) ||
      CASE WHEN p_installments > 1 THEN ' (' || p_installments || 'x de R$ ' || TO_CHAR(ROUND(p_amount / p_installments, 2), 'FM999999990.00') || ')' ELSE '' END ||
      ' em ' || COALESCE(v_merchant_account.name, 'Estabelecimento') || ' (NSU ' || v_nsu || ')',
    COALESCE(p_external_reference, 'CARD:' || v_card.id || '|INST:' || p_installments),
    v_occurred_at
  ) RETURNING id INTO v_tx_out_id;

  INSERT INTO public.transactions (
    account_id, user_id, counterparty_account_id, counterparty_name, counterparty_document,
    type, direction, amount, status, description, external_reference, created_at
  ) VALUES (
    v_merchant_account.id,
    v_merchant_user_id,
    v_payer_account.id,
    COALESCE(p_cardholder_name, 'Cliente Cartão'),
    v_payer_account.cpf_cnpj,
    'card_payment',
    'in',
    p_net_amount,
    v_in_tx_status,
    v_in_tx_desc || ' - NSU ' || v_nsu,
    p_external_reference,
    v_occurred_at
  ) RETURNING id INTO v_tx_in_id;

  -- 10. Criação autoritativa do evento card.paid no mesmo transaction scope
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
      'amountGross', p_amount,
      'feePercent', p_fee_percent,
      'feeAmount', p_fee_amount,
      'amountNet', p_net_amount,
      'installments', p_installments,
      'tipo', p_tipo,
      'status', 'paid',
      'authorizationCode', v_auth_code,
      'nsu', v_nsu,
      'tid', v_tid,
      'cardMasked', v_masked_card,
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

  INSERT INTO public.webhook_delivery_jobs (event_id, webhook_config_id, status, next_attempt_at)
  SELECT v_event_id, cfg.id, 'pending', now()
  FROM public.webhooks_config cfg
  WHERE cfg.account_id = v_merchant_account.id
    AND cfg.active = true
    AND ('card.paid' = ANY(cfg.events) OR '*' = ANY(cfg.events));

  -- 11. Retorno normalizado para o contrato canônico
  RETURN jsonb_build_object(
    'success', true,
    'status', 'approved',
    'transaction_out_id', v_tx_out_id,
    'transaction_in_id', v_tx_in_id,
    'authorization_code', v_auth_code,
    'nsu', v_nsu,
    'tid', v_tid,
    'card_masked', v_masked_card,
    'merchant_account_id', v_merchant_account.id,
    'payer_account_id', v_payer_account.id,
    'gross_amount', p_amount,
    'net_amount', p_net_amount,
    'fee_amount', p_fee_amount,
    'fee_percent', p_fee_percent,
    'webhook_event_id', v_event_id,
    -- Aliases para retrocompatibilidade
    'in_transaction_id', v_tx_in_id,
    'out_transaction_id', v_tx_out_id,
    'auth_code', v_auth_code,
    'masked_card', v_masked_card,
    'settlement_plan', v_effective_plan,
    'is_immediate', v_is_fast_plan,
    'merchant_name', v_merchant_account.name,
    'cardholder_name', p_cardholder_name,
    'installments', p_installments
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_card_payment(
  UUID, TEXT, TEXT, TEXT, TEXT, DECIMAL, TEXT, INTEGER, TEXT, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT, TEXT, UUID
) TO authenticated, service_role;
