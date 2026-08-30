-- ==============================================================================
-- OPTMAPAY SANDBOX - ATRELAMENTO DE DEVOLUÇÃO PIX & SALDO REMANESCENTE
-- 1. Adiciona refunded_amount e related_transaction_id em public.transactions
-- 2. Atualiza refund_pix para calcular e descontar o saldo restante de estorno
-- ==============================================================================

-- 1. ADICIONA COLUNAS DE CONTROLE DE DEVOLUÇÃO SE NÃO EXISTIREM
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS refunded_amount DECIMAL(15, 2) DEFAULT 0.00 CHECK (refunded_amount >= 0.00),
  ADD COLUMN IF NOT EXISTS related_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;

-- 2. FUNÇÃO ATÔMICA: DEVOLUÇÃO PIX COM ATRELAMENTO E CONTROLE DE SALDO RESTANTE
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
  v_user_id UUID;
  v_refund_out_id UUID;
  v_refund_in_id UUID;
  v_ref TEXT;
  v_already_refunded DECIMAL(15, 2);
  v_remaining_refundable DECIMAL(15, 2);
BEGIN
  v_user_id := auth.uid();

  -- 1. Validação do valor solicitado
  IF p_refund_amount <= 0 THEN
    RAISE EXCEPTION 'O valor do reembolso deve ser maior que zero.';
  END IF;

  -- 2. Busca e bloqueia a transação original
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

  -- 3. Calcula saldo remanescente disponível para devolução
  v_already_refunded := COALESCE(v_orig_tx.refunded_amount, 0.00);
  v_remaining_refundable := v_orig_tx.amount - v_already_refunded;

  IF v_remaining_refundable <= 0 THEN
    RAISE EXCEPTION 'Este Pix já foi totalmente devolvido (Total recebido: R$ %, Total já estornado: R$ %).', v_orig_tx.amount, v_already_refunded;
  END IF;

  IF p_refund_amount > v_remaining_refundable THEN
    RAISE EXCEPTION 'O valor solicitado (R$ %) é maior que o saldo restante disponível para devolução (R$ %).', p_refund_amount, v_remaining_refundable;
  END IF;

  -- 4. Busca a conta que está devolvendo (quem recebeu o Pix)
  SELECT * INTO v_sender_account
  FROM public.accounts
  WHERE id = v_orig_tx.account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta recebedora original não encontrada.';
  END IF;

  IF v_user_id IS NOT NULL AND v_sender_account.user_id IS NOT NULL AND v_user_id <> v_sender_account.user_id THEN
    RAISE EXCEPTION 'Você não tem permissão para estornar fundos desta conta.';
  END IF;

  IF v_sender_account.balance < p_refund_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente para realizar a devolução Pix (Saldo: R$ %, Solicitado: R$ %).', v_sender_account.balance, p_refund_amount;
  END IF;

  -- 5. Busca a conta de destino da devolução (quem enviou o Pix originalmente)
  SELECT * INTO v_receiver_account
  FROM public.accounts
  WHERE id = v_orig_tx.counterparty_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta original do pagador não encontrada para devolução.';
  END IF;

  -- 6. Atualiza saldos bancários
  UPDATE public.accounts
  SET balance = balance - p_refund_amount, updated_at = now()
  WHERE id = v_sender_account.id;

  UPDATE public.accounts
  SET balance = balance + p_refund_amount, updated_at = now()
  WHERE id = v_receiver_account.id;

  -- 7. Atualiza a transação original com o novo valor acumulado de devolução
  UPDATE public.transactions
  SET refunded_amount = v_already_refunded + p_refund_amount,
      status = CASE 
        WHEN (v_already_refunded + p_refund_amount) >= v_orig_tx.amount THEN 'refunded'
        ELSE status
      END
  WHERE id = v_orig_tx.id;

  v_ref := 'DEV-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  -- 8. Registra as transações espelhadas de estorno com atrelamento à transação original
  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment,
    related_transaction_id
  ) VALUES (
    v_sender_account.user_id, v_sender_account.id, v_receiver_account.id, v_receiver_account.name,
    'pix', 'out', p_refund_amount, 'Devolução Pix: ' || p_reason, v_ref, 'completed', false, 'sandbox',
    v_orig_tx.id
  ) RETURNING id INTO v_refund_out_id;

  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment,
    related_transaction_id
  ) VALUES (
    v_receiver_account.user_id, v_receiver_account.id, v_sender_account.id, v_sender_account.name,
    'pix', 'in', p_refund_amount, 'Reembolso Pix Recebido: ' || p_reason, v_ref, 'completed', false, 'sandbox',
    v_orig_tx.id
  ) RETURNING id INTO v_refund_in_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Devolução Pix realizada com sucesso!',
    'refund_amount', p_refund_amount,
    'already_refunded_total', v_already_refunded + p_refund_amount,
    'remaining_refundable', v_orig_tx.amount - (v_already_refunded + p_refund_amount),
    'is_fully_refunded', (v_already_refunded + p_refund_amount) >= v_orig_tx.amount,
    'sender_name', v_sender_account.name,
    'receiver_name', v_receiver_account.name,
    'external_reference', v_ref
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refund_pix(UUID, DECIMAL, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_pix(UUID, DECIMAL, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.refund_pix(UUID, DECIMAL, TEXT) TO authenticated;
