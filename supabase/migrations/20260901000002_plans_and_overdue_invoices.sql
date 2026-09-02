-- ==============================================================================
-- OPTMAPAY SANDBOX - PLANOS MDR (D+7, D+15, VENCIMENTO), SEGURANÇA PIN E ENCARGOS
-- Projeto: OptmaPay Sandbox Dev Bank
-- Banco: PostgreSQL (Supabase)
-- Regra de Ouro: "realMoney": false | "environment": "sandbox"
-- ==============================================================================

-- 1. FUNÇÃO ATÔMICA: BLOQUEIO DE CARTÃO POR 3 TENTATIVAS DE SENHA INCORRETA
CREATE OR REPLACE FUNCTION public.block_card_pin_attempts(
  p_card_id UUID DEFAULT NULL,
  p_card_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_card RECORD;
  v_clean TEXT;
BEGIN
  IF p_card_number IS NOT NULL THEN
    v_clean := regexp_replace(p_card_number, '[^0-9]', '', 'g');
  END IF;

  SELECT * INTO v_card
  FROM public.cartoes
  WHERE (p_card_id IS NOT NULL AND id = p_card_id)
     OR (v_clean IS NOT NULL AND card_number = v_clean)
     OR (v_clean IS NOT NULL AND masked_number LIKE '%' || RIGHT(v_clean, 4))
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cartão não encontrado para bloqueio.';
  END IF;

  UPDATE public.cartoes
  SET status = 'blocked'
  WHERE id = v_card.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Cartão bloqueado com sucesso por excesso de tentativas de senha incorreta.',
    'card_id', v_card.id,
    'status', 'blocked'
  );
END;
$$;

-- 2. FUNÇÃO ATÔMICA: BLOQUEIO DE CARTÃO POR INADIMPLÊNCIA / FATURA VENCIDA (> 7 DIAS)
CREATE OR REPLACE FUNCTION public.block_overdue_card(
  p_card_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_card RECORD;
BEGIN
  SELECT * INTO v_card
  FROM public.cartoes
  WHERE id = p_card_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cartão não encontrado.';
  END IF;

  UPDATE public.cartoes
  SET status = 'blocked'
  WHERE id = v_card.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Cartão bloqueado por atraso superior a 7 dias no pagamento da fatura.',
    'card_id', v_card.id,
    'status', 'blocked'
  );
END;
$$;

-- 3. ATUALIZAÇÃO DA RPC process_card_payment PARA SUPORTAR D+7, D+15 E VENCIMENTO
CREATE OR REPLACE FUNCTION public.process_card_payment(
  p_merchant_account_id UUID,
  p_card_number TEXT,
  p_cardholder_name TEXT,
  p_validade TEXT,
  p_cvv TEXT,
  p_amount DECIMAL(15, 2),
  p_tipo TEXT, -- 'debito' ou 'credito'
  p_installments INTEGER DEFAULT 1,
  p_plan TEXT DEFAULT 'standard', -- 'ontime', 'd1'/'standard', 'd7', 'd15', 'due_date'
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
BEGIN
  -- 1. Validação de Valor
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor da transação deve ser maior que zero.';
  END IF;

  v_clean_card_number := regexp_replace(p_card_number, '[^0-9]', '', 'g');

  -- 2. Validação Estrita de Prefixo BIN OptmaPay Sandbox (Regra 5899 / 5898)
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

  -- 3. Localização do Cartão no Banco (por ID exato, número completo ou final de 4 dígitos)
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

  -- Se o cartão ainda não tinha o card_number completo gravado, atualiza
  IF v_card.card_number IS NULL AND LENGTH(v_clean_card_number) = 16 THEN
    UPDATE public.cartoes SET card_number = v_clean_card_number WHERE id = v_card.id;
  END IF;

  IF v_card.status = 'blocked' THEN
    RAISE EXCEPTION 'ERRO 62: Cartão bloqueado pelo titular ou por segurança. Desbloqueie na carteira de cartões antes de transacionar.';
  END IF;

  -- Validação de tipo do cartão
  IF v_card.tipo <> p_tipo THEN
    RAISE EXCEPTION 'ERRO 57: Modalidade não permitida para este cartão. O cartão informado é do tipo %.', UPPER(v_card.tipo);
  END IF;

  -- Validação de CVV (apenas se fornecido e sem PIN de maquininha)
  IF p_pin IS NULL AND p_cvv IS NOT NULL AND TRIM(p_cvv) <> '' AND v_card.cvv IS NOT NULL AND TRIM(v_card.cvv) <> '' THEN
    IF TRIM(v_card.cvv) <> TRIM(p_cvv) THEN
      RAISE EXCEPTION 'ERRO 82: Código de segurança (CVV) inválido.';
    END IF;
  END IF;

  -- Validação de Senha / PIN (quando transacionando via maquininha)
  IF p_pin IS NOT NULL AND TRIM(p_pin) <> '' AND v_card.pin IS NOT NULL AND TRIM(v_card.pin) <> '' THEN
    IF TRIM(v_card.pin) <> TRIM(p_pin) THEN
      RAISE EXCEPTION 'ERRO 55: Senha do cartão incorreta.';
    END IF;
  END IF;

  -- 4. Busca da Conta do Pagador (titular do cartão)
  SELECT * INTO v_payer_account
  FROM public.accounts
  WHERE id = v_card.account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta vinculada ao cartão não encontrada.';
  END IF;

  v_payer_user_id := v_payer_account.user_id;

  -- 5. Busca da Conta do Estabelecimento (Merchant)
  SELECT * INTO v_merchant_account
  FROM public.accounts
  WHERE id = p_merchant_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta do estabelecimento recebedor não encontrada.';
  END IF;

  v_merchant_user_id := v_merchant_account.user_id;

  -- 6. Validação de Saldo / Limite e Débito no Pagador
  IF p_tipo = 'debito' THEN
    IF v_payer_account.balance < p_amount THEN
      RAISE EXCEPTION 'ERRO 51: Saldo insuficiente na conta para compra no débito (Disponível: R$ %, Necessário: R$ %).', v_payer_account.balance, p_amount;
    END IF;

    -- Deduz saldo da conta do pagador
    UPDATE public.accounts
    SET balance = balance - p_amount, updated_at = now()
    WHERE id = v_payer_account.id;

  ELSIF p_tipo = 'credito' THEN
    IF (v_card.current_balance + p_amount) > v_card.credit_limit THEN
      RAISE EXCEPTION 'ERRO 51: Limite de crédito excedido no cartão virtual (Limite: R$ %, Utilizado: R$ %, Compra: R$ %).', v_card.credit_limit, v_card.current_balance, p_amount;
    END IF;

    -- Atualiza fatura/saldo utilizado do cartão de crédito
    UPDATE public.cartoes
    SET current_balance = current_balance + p_amount
    WHERE id = v_card.id;
  END IF;

  -- 7. Identificação do Plano e Liquidação
  v_is_fast_plan := (p_plan = 'ontime' OR p_plan = 'nitro');

  IF p_plan = 'd7' THEN
    v_plan_label := 'Lançamento Futuro D+7 Útil (-3% desc)';
  ELSIF p_plan = 'd15' THEN
    v_plan_label := 'Lançamento Futuro D+15 Útil (-5% desc)';
  ELSIF p_plan = 'due_date' THEN
    v_plan_label := 'Lançamento Futuro no Vencimento (-10% desc)';
  ELSIF v_is_fast_plan THEN
    v_plan_label := '⚡ OnTime (Na Hora)';
  ELSE
    v_plan_label := 'Lançamento Futuro D+1 Útil';
  END IF;

  IF v_is_fast_plan THEN
    -- OnTime: Crédito imediato no saldo disponível
    UPDATE public.accounts
    SET balance = balance + p_net_amount, updated_at = now()
    WHERE id = v_merchant_account.id;

    v_in_tx_status := 'completed';
    v_in_tx_desc := 'Recebimento Cartão ' || UPPER(p_tipo) || ' (Taxa ' || p_fee_percent || '%: -R$ ' || p_fee_amount || ' | Líquido: R$ ' || p_net_amount || ') - ' || v_plan_label;
  ELSE
    -- D+1, D+7, D+15, Due Date: Lançamento Futuro pendente
    v_in_tx_status := 'pending';
    v_in_tx_desc := 'Recebimento Cartão ' || UPPER(p_tipo) || ' (Taxa ' || p_fee_percent || '%: -R$ ' || p_fee_amount || ' | Líquido: R$ ' || p_net_amount || ') - ' || v_plan_label;
  END IF;

  -- 8. Geração de Códigos de Autorização e NSU Bancários
  v_nsu := LPAD(FLOOR(RANDOM() * 90000000 + 10000000)::TEXT, 8, '0');
  v_auth_code := 'AUTH-' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');
  v_tid := 'TID-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');

  -- 9. Inserção das Transações Espelhadas
  -- Transação de Saída (Pagador / Cliente - valor nominal da compra)
  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment
  ) VALUES (
    v_payer_user_id, v_payer_account.id, v_merchant_account.id, v_merchant_account.name,
    'card_payment', 'out', p_amount,
    p_description || ' (' || UPPER(p_tipo) || CASE WHEN p_installments > 1 THEN ' ' || p_installments || 'x' ELSE '' END || ')',
    COALESCE(p_external_reference, v_tid), 'completed', false, 'sandbox'
  ) RETURNING id INTO v_tx_out_id;

  -- Transação de Entrada (Estabelecimento / Merchant com valor líquido)
  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment
  ) VALUES (
    v_merchant_user_id, v_merchant_account.id, v_payer_account.id, v_payer_account.name,
    'card_payment', 'in', p_net_amount,
    v_in_tx_desc || ' - NSU ' || v_nsu,
    COALESCE(p_external_reference, v_tid), v_in_tx_status, false, 'sandbox'
  ) RETURNING id INTO v_tx_in_id;

  -- 10. Retorno Estruturado JSON
  RETURN jsonb_build_object(
    'success', true,
    'status', CASE WHEN v_is_fast_plan THEN 'approved' ELSE 'scheduled' END,
    'settlement_status', v_in_tx_status,
    'message', CASE WHEN v_is_fast_plan THEN 'Transação aprovada e creditada na hora (⚡ OnTime)!' ELSE 'Transação aprovada! Saldo líquido agendado para liberação (' || v_plan_label || ').' END,
    'amount_gross', p_amount,
    'fee_percent', p_fee_percent,
    'fee_amount', p_fee_amount,
    'amount_net', p_net_amount,
    'installments', p_installments,
    'plan', p_plan,
    'plan_label', v_plan_label,
    'tipo', p_tipo,
    'card_id', v_card.id,
    'card_brand', v_card.brand,
    'card_masked', '5899 **** **** ' || RIGHT(v_clean_card_number, 4),
    'cardholder_name', v_card.cardholder_name,
    'payer_account_id', v_payer_account.id,
    'payer_name', v_payer_account.name,
    'merchant_account_id', v_merchant_account.id,
    'merchant_name', v_merchant_account.name,
    'nsu', v_nsu,
    'authorization_code', v_auth_code,
    'tid', v_tid,
    'transaction_out_id', v_tx_out_id,
    'transaction_in_id', v_tx_in_id,
    'real_money', false,
    'environment', 'sandbox',
    'created_at', now()
  );
END;
$$;

-- Permissões de Execução
GRANT EXECUTE ON FUNCTION public.block_card_pin_attempts(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_overdue_card(UUID) TO authenticated;
