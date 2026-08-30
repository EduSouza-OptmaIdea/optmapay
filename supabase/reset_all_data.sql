-- ==============================================================================
-- OPTMAPAY SANDBOX - SCRIPT PARA ZERAR TODOS OS DADOS DE TESTE
-- Execute este script no SQL Editor do Supabase para limpar todas as contas,
-- transações, boletos, cartões e chaves de API e começar do zero.
-- ==============================================================================

TRUNCATE TABLE public.webhooks_log CASCADE;
TRUNCATE TABLE public.webhooks_config CASCADE;
TRUNCATE TABLE public.cartoes CASCADE;
TRUNCATE TABLE public.boletos CASCADE;
TRUNCATE TABLE public.transactions CASCADE;
TRUNCATE TABLE public.api_keys CASCADE;
TRUNCATE TABLE public.data_retention_logs CASCADE;
TRUNCATE TABLE public.accounts CASCADE;
