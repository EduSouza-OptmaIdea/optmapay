-- ==============================================================================
-- OPTMAPAY SANDBOX - POLÍTICA DE RETENÇÃO DE DADOS & EXPIRAÇÃO (60 DIAS)
-- Projeto: OptmaPay Sandbox Dev Bank
-- Banco: PostgreSQL (Supabase)
-- ==============================================================================

-- 1. TABELA DE RASTREAMENTO DE AVISOS DE RETENÇÃO
CREATE TABLE IF NOT EXISTS public.data_retention_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
  warning_type TEXT NOT NULL CHECK (warning_type IN ('7_days', '2_days', '1_day', 'expired_deleted')),
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retention_logs_account ON public.data_retention_logs(account_id);

ALTER TABLE public.data_retention_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso Total Retention Logs" ON public.data_retention_logs FOR ALL USING (true) WITH CHECK (true);

-- 2. FUNÇÃO PARA IDENTIFICAR DADOS PRÓXIMOS À EXPIRAÇÃO (60 DIAS)
CREATE OR REPLACE FUNCTION public.check_data_retention_warnings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_retention_limit_days INT := 60;
  v_7_days_accounts JSONB;
  v_2_days_accounts JSONB;
  v_1_day_accounts JSONB;
BEGIN
  -- Contas criadas há 53 dias (faltam 7 dias para 60)
  SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'user_id', a.user_id, 'created_at', a.created_at))
  INTO v_7_days_accounts
  FROM public.accounts a
  WHERE a.created_at <= (now() - INTERVAL '53 days')
    AND a.created_at > (now() - INTERVAL '54 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.data_retention_logs l
      WHERE l.account_id = a.id AND l.warning_type = '7_days'
    );

  -- Contas criadas há 58 dias (faltam 2 dias para 60)
  SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'user_id', a.user_id, 'created_at', a.created_at))
  INTO v_2_days_accounts
  FROM public.accounts a
  WHERE a.created_at <= (now() - INTERVAL '58 days')
    AND a.created_at > (now() - INTERVAL '59 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.data_retention_logs l
      WHERE l.account_id = a.id AND l.warning_type = '2_days'
    );

  -- Contas criadas há 59 dias (falta 1 dia para 60)
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


-- 3. FUNÇÃO PARA PURGA AUTOMÁTICA DE DADOS EXPIRADOS (60 DIAS)
CREATE OR REPLACE FUNCTION public.cleanup_expired_sandbox_data(
  p_retention_days INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
    -- Realiza a exclusão atômica de cada conta expirada
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
