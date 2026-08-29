-- ==============================================================================
-- OPTMAPAY SANDBOX - RPC FUNCTIONS & BACKEND ATOMIC OPERATIONS
-- Projeto: OptmaPay Sandbox Dev Bank
-- Banco: PostgreSQL (Supabase)
-- ==============================================================================

-- 1. FUNÇÃO ATÔMICA RPC: TRANSFERÊNCIA PIX (transfer_pix)
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
AS $$
DECLARE
  v_receiver_account_id UUID;
  v_receiver_name TEXT;
  v_sender_name TEXT;
  v_sender_balance DECIMAL(15, 2);
  v_user_id UUID;
  v_out_tx_id UUID;
  v_in_tx_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- 1. Validação de valor
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor da transferência deve ser maior que zero.';
  END IF;

  -- 2. Bloqueia a conta pagadora e valida saldo
  SELECT balance, name INTO v_sender_balance, v_sender_name
  FROM public.accounts
  WHERE id = p_sender_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta pagadora não encontrada.';
  END IF;

  IF v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente para realizar a transferência Pix (Saldo: R$ %, Solicitado: R$ %).', v_sender_balance, p_amount;
  END IF;

  -- 3. Busca e bloqueia a conta recebedora pela chave Pix (ou CPF/CNPJ)
  SELECT id, name INTO v_receiver_account_id, v_receiver_name
  FROM public.accounts
  WHERE pix_key = TRIM(p_receiver_pix_key)
     OR pix_key ILIKE TRIM(p_receiver_pix_key)
     OR cpf_cnpj = TRIM(p_receiver_pix_key)
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chave Pix de destino "%" não encontrada no sistema de contas.', p_receiver_pix_key;
  END IF;

  IF p_sender_account_id = v_receiver_account_id THEN
    RAISE EXCEPTION 'A conta de origem e a conta de destino não podem ser iguais.';
  END IF;

  -- 4. Executa as baixas e créditos atômicos
  UPDATE public.accounts
  SET balance = balance - p_amount, updated_at = now()
  WHERE id = p_sender_account_id;

  UPDATE public.accounts
  SET balance = balance + p_amount, updated_at = now()
  WHERE id = v_receiver_account_id;

  -- 5. Registra os lançamentos espelhados no extrato
  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment
  ) VALUES (
    v_user_id, p_sender_account_id, v_receiver_account_id, v_receiver_name,
    'pix', 'out', p_amount, p_description, p_external_reference, 'completed', false, 'sandbox'
  ) RETURNING id INTO v_out_tx_id;

  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment
  ) VALUES (
    v_user_id, v_receiver_account_id, p_sender_account_id, v_sender_name,
    'pix', 'in', p_amount, p_description, p_external_reference, 'completed', false, 'sandbox'
  ) RETURNING id INTO v_in_tx_id;

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
    'realMoney', false,
    'environment', 'sandbox'
  );
END;
$$;


-- 2. FUNÇÃO ATÔMICA RPC: QUITAÇÃO DE BOLETO (settle_boleto)
CREATE OR REPLACE FUNCTION public.settle_boleto(
  p_boleto_id UUID,
  p_payer_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_boleto RECORD;
  v_payer_balance DECIMAL(15, 2);
  v_merchant_account_id UUID;
  v_merchant_name TEXT;
  v_payer_name TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_boleto FROM public.boletos WHERE id = p_boleto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Boleto bancário não encontrado.';
  END IF;

  IF v_boleto.status = 'paid' THEN
    RAISE EXCEPTION 'Este boleto já foi pago anteriormente.';
  END IF;

  SELECT balance, name INTO v_payer_balance, v_payer_name
  FROM public.accounts WHERE id = p_payer_account_id FOR UPDATE;

  IF v_payer_balance < v_boleto.amount THEN
    RAISE EXCEPTION 'Saldo insuficiente na conta do pagador.';
  END IF;

  SELECT id, name INTO v_merchant_account_id, v_merchant_name
  FROM public.accounts WHERE id = v_boleto.account_id FOR UPDATE;

  UPDATE public.accounts SET balance = balance - v_boleto.amount, updated_at = now() WHERE id = p_payer_account_id;
  UPDATE public.accounts SET balance = balance + v_boleto.amount, updated_at = now() WHERE id = v_merchant_account_id;

  UPDATE public.boletos SET status = 'paid', paid_at = now() WHERE id = p_boleto_id;

  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment
  ) VALUES
  (v_user_id, p_payer_account_id, v_merchant_account_id, v_merchant_name, 'boleto_payment', 'out', v_boleto.amount, 'Pagamento de Boleto', v_boleto.external_reference, 'completed', false, 'sandbox'),
  (v_user_id, v_merchant_account_id, p_payer_account_id, v_payer_name, 'boleto_payment', 'in', v_boleto.amount, 'Recebimento de Boleto', v_boleto.external_reference, 'completed', false, 'sandbox');

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Boleto quitado com sucesso!',
    'boleto_id', p_boleto_id,
    'amount', v_boleto.amount,
    'external_reference', v_boleto.external_reference,
    'realMoney', false,
    'environment', 'sandbox'
  );
END;
$$;


-- 3. FUNÇÃO ATÔMICA RPC: APORTE / DEPÓSITO SIMULADO (deposit_funds)
CREATE OR REPLACE FUNCTION public.deposit_funds(
  p_account_id UUID,
  p_amount DECIMAL(15, 2),
  p_description TEXT DEFAULT 'Aporte Fictício Sandbox'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_new_balance DECIMAL(15, 2);
  v_tx_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor do aporte deve ser maior que zero.';
  END IF;

  UPDATE public.accounts
  SET balance = balance + p_amount, updated_at = now()
  WHERE id = p_account_id
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta para aporte não encontrada.';
  END IF;

  INSERT INTO public.transactions (
    user_id, account_id, type, direction, amount, description, status, real_money, environment
  ) VALUES (
    v_user_id, p_account_id, 'deposit', 'in', p_amount, p_description, 'completed', false, 'sandbox'
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Aporte realizado com sucesso!',
    'account_id', p_account_id,
    'amount', p_amount,
    'new_balance', v_new_balance,
    'transaction_id', v_tx_id
  );
END;
$$;


-- 4. FUNÇÃO ATÔMICA RPC: EXCLUSÃO TOTAL DE CONTA E DADOS EM CASCATA (delete_sandbox_account)
CREATE OR REPLACE FUNCTION public.delete_sandbox_account(
  p_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_name TEXT;
  v_deleted_transactions_count INT;
  v_deleted_boletos_count INT;
  v_deleted_cartoes_count INT;
  v_deleted_webhooks_count INT;
BEGIN
  -- 1. Verifica se a conta existe
  SELECT name INTO v_account_name
  FROM public.accounts
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta com ID % não foi encontrada para exclusão.', p_account_id;
  END IF;

  -- 2. Exclusão em cascata de registros vinculados
  DELETE FROM public.transactions WHERE account_id = p_account_id OR counterparty_account_id = p_account_id;
  GET DIAGNOSTICS v_deleted_transactions_count = ROW_COUNT;

  DELETE FROM public.boletos WHERE account_id = p_account_id;
  GET DIAGNOSTICS v_deleted_boletos_count = ROW_COUNT;

  DELETE FROM public.cartoes WHERE account_id = p_account_id;
  GET DIAGNOSTICS v_deleted_cartoes_count = ROW_COUNT;

  DELETE FROM public.webhooks_log WHERE webhook_config_id IN (SELECT id FROM public.webhooks_config WHERE account_id = p_account_id);
  DELETE FROM public.webhooks_config WHERE account_id = p_account_id;
  GET DIAGNOSTICS v_deleted_webhooks_count = ROW_COUNT;

  -- 3. Exclui a conta principal
  DELETE FROM public.accounts WHERE id = p_account_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Conta "%s" e todos os seus dados foram permanentemente excluídos.', v_account_name),
    'deleted_account_id', p_account_id,
    'deleted_account_name', v_account_name,
    'deleted_transactions', v_deleted_transactions_count,
    'deleted_boletos', v_deleted_boletos_count,
    'deleted_cartoes', v_deleted_cartoes_count,
    'deleted_webhooks', v_deleted_webhooks_count
  );
END;
$$;


-- 5. FUNÇÃO RPC: EXPORTAÇÃO COMPLETA DE DADOS EM JSON (export_account_data_json)
CREATE OR REPLACE FUNCTION public.export_account_data_json(
  p_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account JSONB;
  v_transactions JSONB;
  v_boletos JSONB;
  v_cartoes JSONB;
  v_webhooks JSONB;
BEGIN
  SELECT to_jsonb(a.*) INTO v_account FROM public.accounts a WHERE a.id = p_account_id;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'Conta não encontrada para exportação.';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) INTO v_transactions
  FROM public.transactions t WHERE t.account_id = p_account_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(b.*)), '[]'::jsonb) INTO v_boletos
  FROM public.boletos b WHERE b.account_id = p_account_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(c.*)), '[]'::jsonb) INTO v_cartoes
  FROM public.cartoes c WHERE c.account_id = p_account_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(w.*)), '[]'::jsonb) INTO v_webhooks
  FROM public.webhooks_config w WHERE w.account_id = p_account_id;

  RETURN jsonb_build_object(
    'export_version', '1.0.0',
    'exported_at', now(),
    'environment', 'sandbox',
    'realMoney', false,
    'account', v_account,
    'transactions', v_transactions,
    'boletos', v_boletos,
    'cartoes', v_cartoes,
    'webhooks_config', v_webhooks
  );
END;
$$;
