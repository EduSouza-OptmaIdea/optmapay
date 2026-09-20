-- ==============================================================================
-- MIGRATION: 20260905000000_fix_debit_settlement_plan.sql
-- Regra de Negócio: Vendas a débito operam estritamente sob D+1 Útil ('standard') ou OnTime ('ontime'/'nitro').
-- Jamais permitir que débito seja registrado como 'due_date', 'd7' ou 'd15'.
-- ==============================================================================

-- 1. SANEAMENTO DE REGISTROS DE DÉBITO ANTERIORES QUE PORVENTURA POSSUAM LABEL INCORRETO
UPDATE public.transactions
SET description = replace(description, 'Lançamento Futuro no Vencimento (-10% desc)', 'Lançamento Futuro D+1 Útil')
WHERE description LIKE '%DEBITO%Lançamento Futuro no Vencimento%';

UPDATE public.transactions
SET description = replace(description, 'Lançamento Futuro D+7 Útil (-3% desc)', 'Lançamento Futuro D+1 Útil')
WHERE description LIKE '%DEBITO%Lançamento Futuro D+7%';

UPDATE public.transactions
SET description = replace(description, 'Lançamento Futuro D+15 Útil (-5% desc)', 'Lançamento Futuro D+1 Útil')
WHERE description LIKE '%DEBITO%Lançamento Futuro D+15%';

-- 2. ATUALIZAÇÃO DA RPC process_card_payment PARA FORÇAR STANDARD/ONTIME EM VENDAS A DÉBITO
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
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor da transação deve ser maior que zero.';
  END IF;

  -- Regra de Negócio: Débito só existe em 'standard' (D+1) ou 'ontime'/'nitro'
  IF p_tipo = 'debito' THEN
    IF p_plan = 'ontime' OR p_plan = 'nitro' THEN
      v_effective_plan := 'ontime';
    ELSE
      v_effective_plan := 'standard';
    END IF;
  ELSE
    v_effective_plan := p_plan;
  END IF;

  v_clean_card_number := regexp_replace(p_card_number, '[^0-9]', '', 'g');

  IF NOT (v_clean_card_number LIKE '5899%' OR v_clean_card_number LIKE '5898%') THEN
    IF v_clean_card_number LIKE '4%' THEN
      RAISE EXCEPTION 'ERRO 05: Cartão de bandeira real (Visa) não permitido no Sandbox. Use apenas cartões fictícios OptmaPay com prefixo 5899.';
    ELSIF v_clean_card_number ~ '^(5[1-5]|2[2-7])' THEN
      RAISE EXCEPTION 'ERRO 05: Cartão de bandeira real (Mastercard) não permitido no Sandbox. Use apenas cartões fictícios OptmaPay com prefixo 5899.';
    ELSIF v_clean_card_number ~ '^(34|37)' THEN
      RAISE EXCEPTION 'ERRO 05: Cartão de bandeira real (American Express) não permitido no Sandbox. Use apenas cartões fictícios OptmaPay com prefixo 5899.';
    ELSE
      RAISE EXCEPTION 'ERRO 05: Cartão de operadora real não permitido. O Sandbox aceita exclusivamente cartões fictícios gerados no sistema (prefixo 5899).';
    END IF;
  END IF;

  SELECT * INTO v_card
  FROM public.cartoes
  WHERE (p_card_id IS NOT NULL AND id = p_card_id)
     OR (card_number IS NOT NULL AND card_number = v_clean_card_number)
     OR (masked_number LIKE '%' || RIGHT(v_clean_card_number, 4))
  ORDER BY (CASE WHEN p_card_id IS NOT NULL AND id = p_card_id THEN 0 ELSE 1 END), created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERRO 14: Cartão fictício não cadastrado ou não encontrado no OptmaPay Sandbox.';
  END IF;

  IF v_card.card_number IS NULL AND LENGTH(v_clean_card_number) = 16 THEN
    UPDATE public.cartoes SET card_number = v_clean_card_number WHERE id = v_card.id;
  END IF;

  IF v_card.status = 'blocked' THEN
    RAISE EXCEPTION 'ERRO 62: Cartão bloqueado para compras. Desbloqueie na carteira de cartões antes de transacionar.';
  END IF;

  IF p_pin IS NOT NULL AND TRIM(p_pin) <> '' AND v_card.pin IS NOT NULL AND TRIM(v_card.pin) <> '' THEN
    IF TRIM(v_card.pin) <> TRIM(p_pin) THEN
      RAISE EXCEPTION 'ERRO 55: Senha do cartão incorreta.';
    END IF;
  END IF;

  SELECT * INTO v_payer_account
  FROM public.accounts
  WHERE id = v_card.account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta vinculada ao cartão não encontrada.';
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

  v_nsu := LPAD(FLOOR(RANDOM() * 90000000 + 10000000)::TEXT, 8, '0');
  v_auth_code := LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');
  v_tid := 'TID-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 12));

  INSERT INTO public.transactions (
    account_id,
    user_id,
    type,
    direction,
    amount,
    status,
    description,
    counterparty_name,
    counterparty_document,
    external_reference,
    created_at
  ) VALUES (
    v_payer_account.id,
    v_payer_user_id,
    'card_payment',
    'out',
    p_amount,
    'completed',
    'Compra Cartão ' || UPPER(p_tipo) ||
      CASE WHEN p_installments > 1 THEN ' (' || p_installments || 'x de R$ ' || TO_CHAR(ROUND(p_amount / p_installments, 2), 'FM999999990.00') || ')' ELSE '' END ||
      ' em ' || COALESCE(v_merchant_account.name, 'Estabelecimento') || ' (NSU ' || v_nsu || ')',
    v_merchant_account.name,
    v_merchant_account.cpf_cnpj,
    COALESCE(p_external_reference, 'CARD:' || v_card.id || '|INST:' || p_installments),
    now()
  ) RETURNING id INTO v_tx_out_id;

  INSERT INTO public.transactions (
    account_id,
    user_id,
    type,
    direction,
    amount,
    status,
    description,
    counterparty_name,
    counterparty_document,
    external_reference,
    created_at
  ) VALUES (
    v_merchant_account.id,
    v_merchant_user_id,
    'card_payment',
    'in',
    p_net_amount,
    v_in_tx_status,
    v_in_tx_desc || ' - NSU ' || v_nsu,
    COALESCE(p_cardholder_name, 'Cliente Cartão'),
    v_payer_account.cpf_cnpj,
    p_external_reference,
    now()
  ) RETURNING id INTO v_tx_in_id;

  RETURN jsonb_build_object(
    'status', 'approved',
    'nsu', v_nsu,
    'auth_code', v_auth_code,
    'tid', v_tid,
    'amount', p_amount,
    'net_amount', p_net_amount,
    'fee_amount', p_fee_amount,
    'fee_percent', p_fee_percent,
    'settlement_plan', v_effective_plan,
    'is_immediate', v_is_fast_plan,
    'out_transaction_id', v_tx_out_id,
    'in_transaction_id', v_tx_in_id,
    'merchant_name', v_merchant_account.name,
    'cardholder_name', p_cardholder_name,
    'masked_card', '•••• ' || RIGHT(v_clean_card_number, 4),
    'installments', p_installments
  );
END;
$$;

-- 3. SANEAMENTO DE COMPRAS A CRÉDITO ANTERIORES DE R$ 150,00 EM 3X
UPDATE public.transactions
SET description = replace(description, 'Compra Cartão CREDITO em', 'Compra Cartão CREDITO (3x de R$ 50.00) em')
WHERE description LIKE 'Compra Cartão CREDITO em%' AND amount = 150.00;

-- 4. GARANTIR QUE O CARTÃO CRÉDITO COM A COMPRA DE 150 POSSUA CURRENT_BALANCE = 150.00
UPDATE public.cartoes
SET current_balance = 150.00
WHERE (masked_number LIKE '%5011' OR card_number LIKE '%5011') AND tipo = 'credito';

