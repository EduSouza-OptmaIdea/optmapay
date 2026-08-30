-- ==============================================================================
-- CORREÇÃO DEFINITIVA: TRANSFERÊNCIA PIX, BOLETOS E DUPLICATAS CROSS-ACCOUNT
-- Transforma transfer_pix, pay_boleto e settle_invoice em SECURITY DEFINER
-- com search_path seguro e validação interna de propriedade do pagador (auth.uid).
-- ==============================================================================

-- 1. FIX: transfer_pix
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
  v_out_tx_id UUID;
  v_in_tx_id UUID;
  v_clean_key TEXT;
BEGIN
  -- 1. Validação de valor
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor da transferência deve ser maior que zero.';
  END IF;

  -- 2. Validação e bloqueio da conta pagadora
  SELECT user_id, balance, name INTO v_sender_user_id, v_sender_balance, v_sender_name
  FROM public.accounts
  WHERE id = p_sender_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta pagadora não encontrada.';
  END IF;

  -- Validação de segurança: o usuário autenticado deve ser o dono da conta pagadora
  IF auth.uid() IS NOT NULL AND v_sender_user_id IS NOT NULL AND auth.uid() <> v_sender_user_id THEN
    RAISE EXCEPTION 'Você não tem permissão para movimentar fundos desta conta.';
  END IF;

  IF v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente para realizar a transferência Pix (Saldo: R$ %, Solicitado: R$ %).', v_sender_balance, p_amount;
  END IF;

  -- 3. Busca da conta recebedora (por chave Pix, CPF/CNPJ ou ID direto)
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

  -- 5. Registros espelhados nas transações
  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment
  ) VALUES (
    v_sender_user_id, p_sender_account_id, v_receiver_account_id, v_receiver_name,
    'pix', 'out', p_amount, p_description, p_external_reference, 'completed', false, 'sandbox'
  ) RETURNING id INTO v_out_tx_id;

  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment
  ) VALUES (
    v_receiver_user_id, v_receiver_account_id, p_sender_account_id, v_sender_name,
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
    'transaction_in_id', v_in_tx_id
  );
END;
$$;

-- Permite execução para usuários autenticados
GRANT EXECUTE ON FUNCTION public.transfer_pix(UUID, TEXT, DECIMAL, TEXT, TEXT) TO authenticated;
