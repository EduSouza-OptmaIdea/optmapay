-- ==============================================================================
-- OPTMAPAY SANDBOX - SCRIPT SQL COMPLETO PARA SUPABASE (DDL & RPC)
-- Projeto: OptmaPay (optmapay-sandbox)
-- Supabase Target: https://wertmoquxdrucdbobuie.supabase.co
-- Regra de Ouro: "realMoney": false | "environment": "sandbox"
-- ==============================================================================

-- 1. TABELA DE CONTAS PARTICIPANTES (ACCOUNTS)
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('merchant', 'customer')),
  cpf_cnpj TEXT UNIQUE NOT NULL,
  phone TEXT,
  balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0.00),
  pix_key TEXT UNIQUE NOT NULL,
  agency TEXT NOT NULL DEFAULT '0001',
  account_number TEXT NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Alter Table em tabelas existentes para tornar user_id nulo se já foi criada
ALTER TABLE public.accounts ALTER COLUMN user_id DROP NOT NULL;

-- 2. TABELA DE TRANSAÇÕES FINANCEIRAS UNIFICADAS (TRANSACTIONS)
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  counterparty_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  counterparty_name TEXT,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw', 'transfer', 'pix', 'boleto_payment', 'card_payment')),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0.00),
  description TEXT,
  external_reference TEXT, -- ID do pedido / duplicata da aplicação de vendas
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  real_money BOOLEAN NOT NULL DEFAULT false,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.transactions ALTER COLUMN user_id DROP NOT NULL;

-- 3. TABELA DE COBRANÇAS POR BOLETO BANCÁRIO (BOLETOS)
CREATE TABLE IF NOT EXISTS public.boletos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0.00),
  due_date DATE NOT NULL,
  barcode TEXT UNIQUE NOT NULL,
  linha_digitavel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'canceled')),
  payer_name TEXT NOT NULL,
  payer_cpf TEXT NOT NULL,
  external_reference TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.boletos ALTER COLUMN user_id DROP NOT NULL;

-- 4. TABELA DE CARTÕES VIRTUAIS (CARTOES)
CREATE TABLE IF NOT EXISTS public.cartoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('debito', 'credito')),
  cardholder_name TEXT NOT NULL,
  masked_number TEXT NOT NULL,
  validade TEXT NOT NULL,
  cvv TEXT NOT NULL,
  credit_limit DECIMAL(15, 2) DEFAULT 5000.00,
  current_balance DECIMAL(15, 2) DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cartoes ALTER COLUMN user_id DROP NOT NULL;

-- 5. TABELA DE CONFIGURAÇÃO DE WEBHOOKS (WEBHOOKS_CONFIG)
CREATE TABLE IF NOT EXISTS public.webhooks_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY['pix.paid', 'boleto.paid', 'payment.settled', 'order.paid'],
  secret TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.webhooks_config ALTER COLUMN user_id DROP NOT NULL;

-- 6. TABELA DE LOGS E AUDITORIA DE WEBHOOKS (WEBHOOKS_LOG)
CREATE TABLE IF NOT EXISTS public.webhooks_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NULL,
  webhook_config_id UUID REFERENCES public.webhooks_config(id) ON DELETE CASCADE NOT NULL,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  attempt_count INTEGER DEFAULT 1,
  delivered_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.webhooks_log ALTER COLUMN user_id DROP NOT NULL;

-- 7. TABELA DE CHAVES DE API (API_KEYS)
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NULL,
  key_name TEXT NOT NULL DEFAULT 'Default Test Key',
  api_key TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.api_keys ALTER COLUMN user_id DROP NOT NULL;

-- ==============================================================================
-- ÍNDICES DE BANCO DE DADOS PARA ALTA PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON public.accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_pix_key ON public.accounts(pix_key);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON public.transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_external_ref ON public.transactions(external_reference);
CREATE INDEX IF NOT EXISTS idx_boletos_barcode ON public.boletos(barcode);
CREATE INDEX IF NOT EXISTS idx_webhooks_log_user_id ON public.webhooks_log(user_id);

-- ==============================================================================
-- FUNÇÃO ATÔMICA RPC: TRANSFERÊNCIA PIX (transfer_pix)
-- ==============================================================================
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

  -- 1. Bloqueia a conta pagadora e valida saldo
  SELECT balance, name INTO v_sender_balance, v_sender_name
  FROM public.accounts
  WHERE id = p_sender_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta pagadora não encontrada.';
  END IF;

  IF v_sender_balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente para realizar a transferência Pix.';
  END IF;

  -- 2. Busca e bloqueia a conta recebedora pela chave Pix
  SELECT id, name INTO v_receiver_account_id, v_receiver_name
  FROM public.accounts
  WHERE pix_key = p_receiver_pix_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chave Pix de destino não encontrada.';
  END IF;

  IF p_sender_account_id = v_receiver_account_id THEN
    RAISE EXCEPTION 'A conta de origem e destino não podem ser iguais.';
  END IF;

  -- 3. Executa as baixas e créditos atômicos
  UPDATE public.accounts
  SET balance = balance - p_amount, updated_at = now()
  WHERE id = p_sender_account_id;

  UPDATE public.accounts
  SET balance = balance + p_amount, updated_at = now()
  WHERE id = v_receiver_account_id;

  -- 4. Registra os lançamentos espelhados no extrato
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
    'message', 'Pix realizado com sucesso!',
    'amount', p_amount,
    'sender_account_id', p_sender_account_id,
    'receiver_account_id', v_receiver_account_id,
    'transaction_out_id', v_out_tx_id,
    'transaction_in_id', v_in_tx_id,
    'realMoney', false,
    'environment', 'sandbox'
  );
END;
$$;

-- ==============================================================================
-- FUNÇÃO ATÔMICA RPC: QUITAÇÃO DE BOLETO (settle_boleto)
-- ==============================================================================
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
    RAISE EXCEPTION 'Boleto não encontrado.';
  END IF;

  IF v_boleto.status = 'paid' THEN
    RAISE EXCEPTION 'Este boleto já foi pago anteriormente.';
  END IF;

  SELECT balance, name INTO v_payer_balance, v_payer_name
  FROM public.accounts WHERE id = p_payer_account_id FOR UPDATE;

  IF v_payer_balance < v_boleto.amount THEN
    RAISE EXCEPTION 'Saldo insuficiente na conta do pagador.';
  END IF;

  -- Conta de destino (Merchant dona do boleto)
  SELECT id, name INTO v_merchant_account_id, v_merchant_name
  FROM public.accounts WHERE id = v_boleto.account_id FOR UPDATE;

  -- Baixa de saldo e crédito
  UPDATE public.accounts SET balance = balance - v_boleto.amount WHERE id = p_payer_account_id;
  UPDATE public.accounts SET balance = balance + v_boleto.amount WHERE id = v_merchant_account_id;

  -- Marca boleto como pago
  UPDATE public.boletos SET status = 'paid', paid_at = now() WHERE id = p_boleto_id;

  -- Lançamentos de extrato
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

-- ==============================================================================
-- HABILITAR ROW LEVEL SECURITY (RLS) PARA SEGURANÇA E ACESSO LIVRE SANDBOX
-- ==============================================================================
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boletos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas para recriar de forma permissiva
DROP POLICY IF EXISTS "Acesso Total Accounts" ON public.accounts;
DROP POLICY IF EXISTS "Acesso Total Transactions" ON public.transactions;
DROP POLICY IF EXISTS "Acesso Total Boletos" ON public.boletos;
DROP POLICY IF EXISTS "Acesso Total Cartoes" ON public.cartoes;
DROP POLICY IF EXISTS "Acesso Total Webhooks" ON public.webhooks_config;
DROP POLICY IF EXISTS "Acesso Total Webhooks Log" ON public.webhooks_log;
DROP POLICY IF EXISTS "Acesso Total API Keys" ON public.api_keys;

CREATE POLICY "Acesso Total Accounts" ON public.accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso Total Transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso Total Boletos" ON public.boletos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso Total Cartoes" ON public.cartoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso Total Webhooks" ON public.webhooks_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso Total Webhooks Log" ON public.webhooks_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso Total API Keys" ON public.api_keys FOR ALL USING (true) WITH CHECK (true);
