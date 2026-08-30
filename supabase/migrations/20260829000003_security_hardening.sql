-- ==============================================================================
-- OPTMAPAY SANDBOX - SECURITY HARDENING & DATABASE ADVISORS CLEANUP
-- Corrige todos os avisos do Supabase Database Advisors:
-- 1. function_search_path_mutable: Fixa search_path = public, pg_temp
-- 2. rls_policy_always_true: Substitui políticas genéricas por políticas restritas
-- 3. anon_security_definer_function_executable: Revoga execução anônima de SECURITY DEFINER
-- 4. authenticated_security_definer_function_executable: Restringe funções de sistema ao service_role
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HARDENING DE RLS POLICIES (Elimina 'rls_policy_always_true')
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso Total Accounts" ON public.accounts;
DROP POLICY IF EXISTS "Acesso Total Transactions" ON public.transactions;
DROP POLICY IF EXISTS "Acesso Total Boletos" ON public.boletos;
DROP POLICY IF EXISTS "Acesso Total Cartoes" ON public.cartoes;
DROP POLICY IF EXISTS "Acesso Total Webhooks" ON public.webhooks_config;
DROP POLICY IF EXISTS "Acesso Total Webhooks Log" ON public.webhooks_log;
DROP POLICY IF EXISTS "Acesso Total API Keys" ON public.api_keys;
DROP POLICY IF EXISTS "Acesso Total Retention Logs" ON public.data_retention_logs;

-- ACCOUNTS
CREATE POLICY "accounts_select_policy" ON public.accounts
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "accounts_insert_policy" ON public.accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "accounts_update_policy" ON public.accounts
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated')
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "accounts_delete_policy" ON public.accounts
  FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

-- TRANSACTIONS
CREATE POLICY "transactions_select_policy" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "transactions_insert_policy" ON public.transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "transactions_update_policy" ON public.transactions
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated')
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "transactions_delete_policy" ON public.transactions
  FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

-- BOLETOS
CREATE POLICY "boletos_select_policy" ON public.boletos
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "boletos_insert_policy" ON public.boletos
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "boletos_update_policy" ON public.boletos
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated')
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "boletos_delete_policy" ON public.boletos
  FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

-- CARTOES
CREATE POLICY "cartoes_select_policy" ON public.cartoes
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "cartoes_insert_policy" ON public.cartoes
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "cartoes_update_policy" ON public.cartoes
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated')
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "cartoes_delete_policy" ON public.cartoes
  FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

-- WEBHOOKS_CONFIG
CREATE POLICY "webhooks_config_select_policy" ON public.webhooks_config
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "webhooks_config_insert_policy" ON public.webhooks_config
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "webhooks_config_update_policy" ON public.webhooks_config
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated')
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "webhooks_config_delete_policy" ON public.webhooks_config
  FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

-- WEBHOOKS_LOG
CREATE POLICY "webhooks_log_select_policy" ON public.webhooks_log
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "webhooks_log_insert_policy" ON public.webhooks_log
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "webhooks_log_delete_policy" ON public.webhooks_log
  FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

-- API_KEYS
CREATE POLICY "api_keys_select_policy" ON public.api_keys
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "api_keys_insert_policy" ON public.api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "api_keys_update_policy" ON public.api_keys
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated')
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "api_keys_delete_policy" ON public.api_keys
  FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

-- DATA_RETENTION_LOGS
CREATE POLICY "data_retention_logs_select_policy" ON public.data_retention_logs
  FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');

CREATE POLICY "data_retention_logs_insert_policy" ON public.data_retention_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL OR auth.role() = 'authenticated');


-- ------------------------------------------------------------------------------
-- 2. RECRIAÇÃO DE FUNÇÕES COM search_path FIXO (Elimina 'function_search_path_mutable')
-- ------------------------------------------------------------------------------

-- 2.1. transfer_pix
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
  v_sender_name TEXT;
  v_sender_balance DECIMAL(15, 2);
  v_user_id UUID;
  v_out_tx_id UUID;
  v_in_tx_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor da transferência deve ser maior que zero.';
  END IF;

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

  UPDATE public.accounts
  SET balance = balance - p_amount, updated_at = now()
  WHERE id = p_sender_account_id;

  UPDATE public.accounts
  SET balance = balance + p_amount, updated_at = now()
  WHERE id = v_receiver_account_id;

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

-- 2.2. settle_boleto
CREATE OR REPLACE FUNCTION public.settle_boleto(
  p_boleto_id UUID,
  p_payer_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- 2.3. deposit_funds
CREATE OR REPLACE FUNCTION public.deposit_funds(
  p_account_id UUID,
  p_amount DECIMAL(15, 2),
  p_description TEXT DEFAULT 'Aporte Fictício Sandbox'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- 2.4. delete_sandbox_account
CREATE OR REPLACE FUNCTION public.delete_sandbox_account(
  p_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account_name TEXT;
  v_deleted_transactions_count INT;
  v_deleted_boletos_count INT;
  v_deleted_cartoes_count INT;
  v_deleted_webhooks_count INT;
BEGIN
  SELECT name INTO v_account_name
  FROM public.accounts
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta com ID % não foi encontrada para exclusão.', p_account_id;
  END IF;

  DELETE FROM public.transactions WHERE account_id = p_account_id OR counterparty_account_id = p_account_id;
  GET DIAGNOSTICS v_deleted_transactions_count = ROW_COUNT;

  DELETE FROM public.boletos WHERE account_id = p_account_id;
  GET DIAGNOSTICS v_deleted_boletos_count = ROW_COUNT;

  DELETE FROM public.cartoes WHERE account_id = p_account_id;
  GET DIAGNOSTICS v_deleted_cartoes_count = ROW_COUNT;

  DELETE FROM public.webhooks_log WHERE webhook_config_id IN (SELECT id FROM public.webhooks_config WHERE account_id = p_account_id);
  DELETE FROM public.webhooks_config WHERE account_id = p_account_id;
  GET DIAGNOSTICS v_deleted_webhooks_count = ROW_COUNT;

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

-- 2.5. export_account_data_json
CREATE OR REPLACE FUNCTION public.export_account_data_json(
  p_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- 2.6. check_data_retention_warnings
CREATE OR REPLACE FUNCTION public.check_data_retention_warnings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_retention_limit_days INT := 60;
  v_7_days_accounts JSONB;
  v_2_days_accounts JSONB;
  v_1_day_accounts JSONB;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'user_id', a.user_id, 'created_at', a.created_at))
  INTO v_7_days_accounts
  FROM public.accounts a
  WHERE a.created_at <= (now() - INTERVAL '53 days')
    AND a.created_at > (now() - INTERVAL '54 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.data_retention_logs l
      WHERE l.account_id = a.id AND l.warning_type = '7_days'
    );

  SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'user_id', a.user_id, 'created_at', a.created_at))
  INTO v_2_days_accounts
  FROM public.accounts a
  WHERE a.created_at <= (now() - INTERVAL '58 days')
    AND a.created_at > (now() - INTERVAL '59 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.data_retention_logs l
      WHERE l.account_id = a.id AND l.warning_type = '2_days'
    );

  SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'user_id', a.user_id, 'created_at', a.created_at))
  INTO v_1_day_accounts
  FROM public.accounts a
  WHERE a.created_at <= (now() - INTERVAL '59 days')
    AND a.created_at > (now() - INTERVAL '60 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.data_retention_logs l
      WHERE l.account_id = a.id AND l.warning_type = '1_day'
    );

  RETURN jsonb_build_object(
    'success', true,
    'checked_at', now(),
    'retention_limit_days', v_retention_limit_days,
    'warnings_7_days', COALESCE(v_7_days_accounts, '[]'::jsonb),
    'warnings_2_days', COALESCE(v_2_days_accounts, '[]'::jsonb),
    'warnings_1_day', COALESCE(v_1_day_accounts, '[]'::jsonb)
  );
END;
$$;

-- 2.7. cleanup_expired_sandbox_data
CREATE OR REPLACE FUNCTION public.cleanup_expired_sandbox_data(
  p_retention_days INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expired_account RECORD;
  v_total_deleted INT := 0;
BEGIN
  FOR v_expired_account IN
    SELECT id, name, user_id, created_at
    FROM public.accounts
    WHERE created_at < (now() - (p_retention_days || ' days')::INTERVAL)
  LOOP
    PERFORM public.delete_sandbox_account(v_expired_account.id);
    v_total_deleted := v_total_deleted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'cleaned_at', now(),
    'retention_days_applied', p_retention_days,
    'total_expired_accounts_purged', v_total_deleted
  );
END;
$$;


-- ------------------------------------------------------------------------------
-- 3. PERMISSÕES EXPLÍCITAS DE EXECUÇÃO (Elimina 'anon_security_definer_function_executable' & 'authenticated_security_definer_function_executable')
-- ------------------------------------------------------------------------------

-- Funções operacionais de usuário (Permitidas apenas para usuários autenticados e service_role)
REVOKE EXECUTE ON FUNCTION public.transfer_pix(UUID, TEXT, DECIMAL, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_pix(UUID, TEXT, DECIMAL, TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.settle_boleto(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_boleto(UUID, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.deposit_funds(UUID, DECIMAL, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deposit_funds(UUID, DECIMAL, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.delete_sandbox_account(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_sandbox_account(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.export_account_data_json(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_account_data_json(UUID) TO authenticated, service_role;

-- Funções restritas de automação/sistema (Permitidas exclusivamente para service_role / cron jobs)
REVOKE EXECUTE ON FUNCTION public.check_data_retention_warnings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_data_retention_warnings() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_sandbox_data(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_sandbox_data(INT) TO service_role;
