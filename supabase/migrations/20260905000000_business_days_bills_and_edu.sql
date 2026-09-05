-- ==============================================================================
-- OPTMAPAY SANDBOX - LIQUIDAÇÃO D+1/D+N, ANTECIPAÇÃO PRO RATA E ECOSSISTEMA EDU
-- Projeto: OptmaPay Sandbox Dev & Edu Bank
-- Banco: PostgreSQL (Supabase)
-- Regra de Ouro: "realMoney": false | "environment": "sandbox"
-- ==============================================================================

-- 1. TABELA DE CONTAS A PAGAR (BILL PAY / EDUCAÇÃO FINANCEIRA)
CREATE TABLE IF NOT EXISTS public.contas_pagar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('energia', 'agua', 'internet', 'moradia', 'educacao', 'outros')),
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0.00),
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'canceled')),
  barcode TEXT NOT NULL,
  linha_digitavel TEXT NOT NULL,
  late_fee_percent DECIMAL(5, 2) DEFAULT 2.00,
  daily_interest_rate DECIMAL(6, 4) DEFAULT 0.0333,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_account_status ON public.contas_pagar(account_id, status);

-- 2. TABELA DE COFRINHOS E POUPANÇA (METAS DE INVESTIMENTO)
CREATE TABLE IF NOT EXISTS public.cofrinhos_poupanca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'Objetivo Pessoal',
  target_amount DECIMAL(15, 2) NOT NULL CHECK (target_amount > 0.00),
  current_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 CHECK (current_amount >= 0.00),
  icon TEXT DEFAULT '🎯',
  monthly_yield_percent DECIMAL(5, 2) DEFAULT 0.60,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABELA DE EMPRÉSTIMOS EDUCATIVOS CONSCIENTES
CREATE TABLE IF NOT EXISTS public.emprestimos_edu (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  purpose TEXT,
  principal_amount DECIMAL(15, 2) NOT NULL CHECK (principal_amount > 0.00),
  total_with_interest DECIMAL(15, 2) NOT NULL,
  installments_total INTEGER NOT NULL CHECK (installments_total > 0),
  installments_paid INTEGER NOT NULL DEFAULT 0,
  installment_amount DECIMAL(15, 2) NOT NULL,
  monthly_interest_rate DECIMAL(5, 2) NOT NULL,
  next_due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid', 'overdue')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. HABILITAÇÃO DE RLS (ROW LEVEL SECURITY)
ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cofrinhos_poupanca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emprestimos_edu ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso
CREATE POLICY "Permitir leitura de contas a pagar pelo titular" ON public.contas_pagar
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() IS NULL);

CREATE POLICY "Permitir inserção e atualização de contas a pagar" ON public.contas_pagar
  FOR ALL USING (auth.uid() = user_id OR auth.uid() IS NULL);

CREATE POLICY "Permitir gestão de cofrinhos pelo titular" ON public.cofrinhos_poupanca
  FOR ALL USING (auth.uid() = user_id OR auth.uid() IS NULL);

CREATE POLICY "Permitir gestão de empréstimos pelo titular" ON public.emprestimos_edu
  FOR ALL USING (auth.uid() = user_id OR auth.uid() IS NULL);

-- Permissões para authenticated
GRANT ALL ON public.contas_pagar TO authenticated;
GRANT ALL ON public.cofrinhos_poupanca TO authenticated;
GRANT ALL ON public.emprestimos_edu TO authenticated;
