-- ==============================================================================
-- OPTMAPAY SANDBOX - FATURAS DE CARTÃO, D+1 LANÇAMENTOS FUTUROS E LIQUIDAÇÃO
-- Projeto: OptmaPay Sandbox Dev Bank
-- Banco: PostgreSQL (Supabase)
-- Regra de Ouro: "realMoney": false | "environment": "sandbox"
-- ==============================================================================

-- 1. ADICIONA CAMPOS DE FATURA NA TABELA CARTOES
ALTER TABLE public.cartoes ADD COLUMN IF NOT EXISTS due_day INTEGER DEFAULT 10;
ALTER TABLE public.cartoes ADD COLUMN IF NOT EXISTS auto_debit BOOLEAN DEFAULT false;

-- 2. ATUALIZA A RPC process_card_payment COM REGRAS DE D+1 vs ONTIME
-- - Se o plano for 'standard' (D+1): Saldo não é creditado de imediato (status: 'pending' / Lançamento Futuro)
-- - Se o plano for 'ontime' ou 'nitro': Saldo líquido é creditado imediatamente (status: 'completed')
CREATE OR REPLACE FUNCTION public.process_card_payment(
  p_merchant_account_id UUID,
  p_card_number TEXT,
  p_cardholder_name TEXT,
  p_validade TEXT,
  p_cvv TEXT,
  p_amount DECIMAL(15, 2),
  p_tipo TEXT, -- 'debito' ou 'credito'
  p_installments INTEGER DEFAULT 1,
  p_plan TEXT DEFAULT 'standard', -- 'standard' (D+1) ou 'ontime'/'nitro' (Na Hora)
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
    RAISE EXCEPTION 'ERRO 62: Cartão bloqueado pelo titular. Desbloqueie na carteira de cartões antes de transacionar.';
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

  -- 7. Regra de Liquidação do Estabelecimento: D+1 (Lançamento Futuro) vs OnTime (Crédito Imediato)
  v_is_fast_plan := (p_plan = 'ontime' OR p_plan = 'nitro');

  IF v_is_fast_plan THEN
    -- OnTime: Crédito imediato no saldo disponível
    UPDATE public.accounts
    SET balance = balance + p_net_amount, updated_at = now()
    WHERE id = v_merchant_account.id;

    v_in_tx_status := 'completed';
    v_in_tx_desc := 'Recebimento Cartão ' || UPPER(p_tipo) || ' (Taxa ' || p_fee_percent || '%: -R$ ' || p_fee_amount || ' | Líquido: R$ ' || p_net_amount || ') - ⚡ OnTime';
  ELSE
    -- D+1: Lançamento Futuro (Não credita saldo imediatamente; status pending para liberação no próximo dia útil)
    v_in_tx_status := 'pending';
    v_in_tx_desc := 'Recebimento Cartão ' || UPPER(p_tipo) || ' (Taxa ' || p_fee_percent || '%: -R$ ' || p_fee_amount || ' | Líquido: R$ ' || p_net_amount || ') - Lançamento Futuro D+1';
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
    'status', CASE WHEN v_is_fast_plan THEN 'approved' ELSE 'scheduled_d1' END,
    'settlement_status', v_in_tx_status,
    'message', CASE WHEN v_is_fast_plan THEN 'Transação aprovada e creditada na hora (⚡ OnTime)!' ELSE 'Transação aprovada! Saldo líquido agendado para liberação em D+1.' END,
    'amount_gross', p_amount,
    'fee_percent', p_fee_percent,
    'fee_amount', p_fee_amount,
    'amount_net', p_net_amount,
    'installments', p_installments,
    'plan', p_plan,
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

-- 3. FUNÇÃO ATÔMICA: LIBERAÇÃO / ANTECIPAÇÃO DE LANÇAMENTO FUTURO D+1
CREATE OR REPLACE FUNCTION public.release_d1_settlement(
  p_transaction_id UUID,
  p_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tx RECORD;
  v_acc RECORD;
BEGIN
  -- 1. Busca e bloqueia a transação pendente
  SELECT * INTO v_tx
  FROM public.transactions
  WHERE id = p_transaction_id AND account_id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transação não encontrada ou não pertence a esta conta.';
  END IF;

  IF v_tx.type <> 'card_payment' OR v_tx.direction <> 'in' THEN
    RAISE EXCEPTION 'Apenas recebimentos de vendas com cartão podem ser liquidados.';
  END IF;

  IF v_tx.status <> 'pending' THEN
    RAISE EXCEPTION 'Esta transação já foi liquidada ou não está pendente (Status atual: %).', v_tx.status;
  END IF;

  -- 2. Credita saldo na conta do estabelecimento
  UPDATE public.accounts
  SET balance = balance + v_tx.amount, updated_at = now()
  WHERE id = p_account_id;

  -- 3. Atualiza o status da transação para completed
  UPDATE public.transactions
  SET status = 'completed',
      description = replace(v_tx.description, 'Lançamento Futuro D+1', 'Liquidado em D+1')
  WHERE id = v_tx.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Lançamento D+1 liquidado com sucesso!',
    'amount_credited', v_tx.amount,
    'transaction_id', v_tx.id
  );
END;
$$;

-- 4. FUNÇÃO ATÔMICA: PAGAMENTO DE FATURA DE CARTÃO DE CRÉDITO COM SALDO EM CONTA
CREATE OR REPLACE FUNCTION public.pay_credit_card_invoice(
  p_card_id UUID,
  p_amount DECIMAL(15, 2) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_card RECORD;
  v_acc RECORD;
  v_pay_amount DECIMAL(15, 2);
  v_tx_id UUID;
BEGIN
  -- 1. Busca e bloqueia o cartão de crédito
  SELECT * INTO v_card
  FROM public.cartoes
  WHERE id = p_card_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cartão de crédito não encontrado.';
  END IF;

  IF v_card.tipo <> 'credito' THEN
    RAISE EXCEPTION 'Apenas cartões de crédito possuem fatura para pagamento.';
  END IF;

  IF v_card.current_balance <= 0 THEN
    RAISE EXCEPTION 'Este cartão não possui fatura em aberto (Saldo devedor: R$ 0,00).';
  END IF;

  -- Valor a ser pago: total da fatura ou valor parcial informado
  v_pay_amount := COALESCE(p_amount, v_card.current_balance);

  IF v_pay_amount <= 0 THEN
    RAISE EXCEPTION 'O valor do pagamento deve ser maior que zero.';
  END IF;

  IF v_pay_amount > v_card.current_balance THEN
    v_pay_amount := v_card.current_balance;
  END IF;

  -- 2. Busca e valida saldo da conta vinculada
  SELECT * INTO v_acc
  FROM public.accounts
  WHERE id = v_card.account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta vinculada ao cartão não encontrada.';
  END IF;

  IF v_acc.balance < v_pay_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente na conta para quitar a fatura (Saldo em conta: R$ %, Fatura: R$ %).', v_acc.balance, v_pay_amount;
  END IF;

  -- 3. Débito no saldo da conta corrente
  UPDATE public.accounts
  SET balance = balance - v_pay_amount, updated_at = now()
  WHERE id = v_acc.id;

  -- 4. Reduz a fatura / saldo devedor do cartão (restabelece limite)
  UPDATE public.cartoes
  SET current_balance = current_balance - v_pay_amount
  WHERE id = v_card.id;

  -- 5. Registra o pagamento no extrato
  INSERT INTO public.transactions (
    user_id, account_id, type, direction, amount,
    description, external_reference, status, real_money, environment
  ) VALUES (
    v_acc.user_id, v_acc.id, 'card_payment', 'out', v_pay_amount,
    'Pagamento de Fatura de Cartão de Crédito (' || v_card.masked_number || ')',
    'FAT-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0'),
    'completed', false, 'sandbox'
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Fatura do cartão paga com sucesso!',
    'amount_paid', v_pay_amount,
    'remaining_invoice_balance', v_card.current_balance - v_pay_amount,
    'available_credit_limit', v_card.credit_limit - (v_card.current_balance - v_pay_amount),
    'transaction_id', v_tx_id
  );
END;
$$;

-- Permissões de Execução
GRANT EXECUTE ON FUNCTION public.process_card_payment(
  UUID, TEXT, TEXT, TEXT, TEXT, DECIMAL, TEXT, INTEGER, TEXT, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT, TEXT, UUID
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.release_d1_settlement(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_credit_card_invoice(UUID, DECIMAL) TO authenticated;
