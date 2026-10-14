-- Authoritative card opening limits: PF/PJ defaults with customer exceptions.
BEGIN;
CREATE OR REPLACE FUNCTION public.enforce_optmapay_card_test_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp
AS $fn$
DECLARE v_owner uuid; v_policy jsonb;
BEGIN
 IF TG_OP='INSERT' THEN
   SELECT a.user_id INTO v_owner FROM public.accounts a WHERE a.id=NEW.account_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Conta do cartão inexistente'; END IF;
   IF auth.role()='authenticated' AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM v_owner) THEN
     RAISE EXCEPTION 'Cartão não pode ser emitido para conta de terceiros' USING ERRCODE='42501';
   END IF;
   IF EXISTS(SELECT 1 FROM public.platform_staff staff WHERE staff.user_id=v_owner AND staff.enabled) THEN
     RAISE EXCEPTION 'Operador administrativo não pode emitir cartão bancário' USING ERRCODE='42501';
   END IF;
   v_policy:=public.platform_effective_financial_policy_internal(NEW.account_id);
   NEW.credit_limit:=CASE WHEN NEW.tipo='credito' THEN (v_policy->>'card_credit_limit')::numeric ELSE 0 END;
 ELSIF TG_OP='UPDATE' AND auth.role()='authenticated' AND NEW.credit_limit IS DISTINCT FROM OLD.credit_limit THEN
   RAISE EXCEPTION 'Limite de crédito só pode ser ajustado por operação administrativa autorizada' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.enforce_optmapay_card_test_limit() FROM PUBLIC,anon,authenticated;
COMMIT;