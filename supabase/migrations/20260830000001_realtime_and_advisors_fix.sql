-- ==============================================================================
-- OPTMAPAY SANDBOX - ADVISORS CLEANUP & REALTIME SYNCHRONIZATION FIX
-- 1. Corrige warning de RLS boletos_update_policy (restringe ao dono)
-- 2. Ativa REPLICA IDENTITY FULL em accounts, transactions e boletos para Realtime instantâneo em todas as contas
-- 3. Adiciona função de devolução / reembolso Pix (refund_pix)
-- ==============================================================================

-- 1. CORREÇÃO RLS BOLETOS (Elimina warning rls_policy_always_true)
DROP POLICY IF EXISTS "boletos_update_policy" ON public.boletos;

CREATE POLICY "boletos_update_policy" ON public.boletos
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id 
    OR account_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id 
    OR account_id IN (SELECT id FROM public.accounts WHERE user_id = auth.uid())
  );

-- 2. REALTIME FULL REPLICA (Garante disparo instantâneo no WebSocket para quem recebe pagamentos)
ALTER TABLE public.accounts REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.boletos REPLICA IDENTITY FULL;

-- Adiciona às publicações do Supabase Realtime se ainda não estiverem
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.accounts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.boletos;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 3. FUNÇÃO ATÔMICA: DEVOLUÇÃO PIX (REEMBOLSO PARCIAL OU TOTAL)
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
BEGIN
  v_user_id := auth.uid();

  -- 1. Validação de valor
  IF p_refund_amount <= 0 THEN
    RAISE EXCEPTION 'O valor do reembolso deve ser maior que zero.';
  END IF;

  -- 2. Busca a transação original
  SELECT * INTO v_orig_tx
  FROM public.transactions
  WHERE id = p_original_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transação original não encontrada.';
  END IF;

  IF v_orig_tx.type <> 'pix' THEN
    RAISE EXCEPTION 'Apenas transações do tipo Pix podem ser devolvidas.';
  END IF;

  -- A devolução deve ser iniciada por quem RECEBEU o Pix (direction = 'in')
  IF v_orig_tx.direction <> 'in' THEN
    RAISE EXCEPTION 'A devolução só pode ser realizada a partir de um Pix recebido.';
  END IF;

  IF p_refund_amount > v_orig_tx.amount THEN
    RAISE EXCEPTION 'O valor da devolução (R$ %) não pode ser maior que o valor original do Pix (R$ %).', p_refund_amount, v_orig_tx.amount;
  END IF;

  -- 3. Busca a conta que está devolvendo (quem recebeu o Pix)
  SELECT * INTO v_sender_account
  FROM public.accounts
  WHERE id = v_orig_tx.account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta recebedora original não encontrada.';
  END IF;

  -- Valida se o usuário autenticado é dono da conta que está estornando
  IF v_user_id IS NOT NULL AND v_sender_account.user_id IS NOT NULL AND v_user_id <> v_sender_account.user_id THEN
    RAISE EXCEPTION 'Você não tem permissão para estornar fundos desta conta.';
  END IF;

  IF v_sender_account.balance < p_refund_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente para realizar a devolução Pix (Saldo: R$ %, Solicitado: R$ %).', v_sender_account.balance, p_refund_amount;
  END IF;

  -- 4. Busca a conta de destino da devolução (quem enviou o Pix originalmente)
  SELECT * INTO v_receiver_account
  FROM public.accounts
  WHERE id = v_orig_tx.counterparty_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta original do pagador não encontrada para devolução.';
  END IF;

  -- 5. Executa os débitos e créditos
  UPDATE public.accounts
  SET balance = balance - p_refund_amount, updated_at = now()
  WHERE id = v_sender_account.id;

  UPDATE public.accounts
  SET balance = balance + p_refund_amount, updated_at = now()
  WHERE id = v_receiver_account.id;

  v_ref := 'DEV-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  -- 6. Grava os lançamentos espelhados de devolução
  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment
  ) VALUES (
    v_sender_account.user_id, v_sender_account.id, v_receiver_account.id, v_receiver_account.name,
    'pix', 'out', p_refund_amount, 'Devolução Pix: ' || p_reason, v_ref, 'completed', false, 'sandbox'
  ) RETURNING id INTO v_refund_out_id;

  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment
  ) VALUES (
    v_receiver_account.user_id, v_receiver_account.id, v_sender_account.id, v_sender_account.name,
    'pix', 'in', p_refund_amount, 'Reembolso Pix Recebido: ' || p_reason, v_ref, 'completed', false, 'sandbox'
  ) RETURNING id INTO v_refund_in_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Devolução Pix realizada com sucesso!',
    'refund_amount', p_refund_amount,
    'sender_name', v_sender_account.name,
    'receiver_name', v_receiver_account.name,
    'external_reference', v_ref
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_pix(UUID, DECIMAL, TEXT) TO authenticated;
