-- ==============================================================================
-- OPTMAPAY SANDBOX - ADVISORS CLEANUP (REVOKE ANON FROM SECURITY DEFINER)
-- Remove permissão do perfil anônimo (anon) nas funções financeiras críticas
-- ==============================================================================

-- 1. Revoga acesso anônimo/público em refund_pix
REVOKE EXECUTE ON FUNCTION public.refund_pix(UUID, DECIMAL, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refund_pix(UUID, DECIMAL, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.refund_pix(UUID, DECIMAL, TEXT) TO authenticated;

-- 2. Revoga acesso anônimo/público em transfer_pix
REVOKE EXECUTE ON FUNCTION public.transfer_pix(UUID, TEXT, DECIMAL, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transfer_pix(UUID, TEXT, DECIMAL, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.transfer_pix(UUID, TEXT, DECIMAL, TEXT, TEXT) TO authenticated;
