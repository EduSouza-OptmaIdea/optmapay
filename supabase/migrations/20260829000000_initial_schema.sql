-- ==============================================================================
-- OPTMAPAY SANDBOX - SCHEMA INICIAL COMPLETO (DDL, ÍNDICES & RLS)
-- Projeto: OptmaPay Sandbox Dev Bank
-- Banco: PostgreSQL (Supabase)
-- Regra de Ouro: "realMoney": false | "environment": "sandbox"
-- ==============================================================================

-- 1. EXTENSÕES POSTGRESQL NECESSÁRIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABELA DE CONTAS PARTICIPANTES (ACCOUNTS)
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

-- Garantir que user_id seja nulo se criado por anônimo/operador direto
ALTER TABLE public.accounts ALTER COLUMN user_id DROP NOT NULL;

-- 3. TABELA DE TRANSAÇÕES FINANCEIRAS UNIFICADAS (TRANSACTIONS)
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
  external_reference TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  real_money BOOLEAN NOT NULL DEFAULT false,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.transactions ALTER COLUMN user_id DROP NOT NULL;

-- 4. TABELA DE COBRANÇAS POR BOLETO BANCÁRIO (BOLETOS)
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

-- 5. TABELA DE CARTÕES VIRTUAIS (CARTOES)
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

-- 6. TABELA DE CONFIGURAÇÃO DE WEBHOOKS (WEBHOOKS_CONFIG)
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

-- 7. TABELA DE AUDITORIA E LOGS DE WEBHOOKS (WEBHOOKS_LOG)
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

-- 8. TABELA DE CHAVES DE API (API_KEYS)
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NULL,
  key_name TEXT NOT NULL DEFAULT 'Default Sandbox Key',
  api_key TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.api_keys ALTER COLUMN user_id DROP NOT NULL;

-- ==============================================================================
-- ÍNDICES PARA ALTA PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON public.accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_pix_key ON public.accounts(pix_key);
CREATE INDEX IF NOT EXISTS idx_accounts_cpf_cnpj ON public.accounts(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON public.transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_external_ref ON public.transactions(external_reference);
CREATE INDEX IF NOT EXISTS idx_boletos_account_id ON public.boletos(account_id);
CREATE INDEX IF NOT EXISTS idx_boletos_barcode ON public.boletos(barcode);
CREATE INDEX IF NOT EXISTS idx_cartoes_account_id ON public.cartoes(account_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_config_account_id ON public.webhooks_config(account_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_log_user_id ON public.webhooks_log(user_id);

-- ==============================================================================
-- POLÍTICAS ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boletos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

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
