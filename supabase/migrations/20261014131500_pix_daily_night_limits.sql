-- Enforce Pix daily and nighttime limits inside the existing atomic transfer_pix ledger.
-- transfer_pix locks sender account FOR UPDATE before inserting outbound transaction.
BEGIN;
CREATE OR REPLACE FUNCTION public.platform_pix_is_night(
  p_instant timestamptz,p_timezone text,p_start integer,p_end integer
) RETURNS boolean LANGUAGE sql STABLE
SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT CASE WHEN p_start>p_end
 THEN extract(hour from p_instant AT TIME ZONE p_timezone)::integer>=p_start
      OR extract(hour from p_instant AT TIME ZONE p_timezone)::integer<p_end
 ELSE extract(hour from p_instant AT TIME ZONE p_timezone)::integer>=p_start
      AND extract(hour from p_instant AT TIME ZONE p_timezone)::integer<p_end
 END;
$f$;

CREATE OR REPLACE FUNCTION public.platform_pix_limit_snapshot(p_account_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
DECLARE v_policy jsonb; v_today date; v_used numeric; v_night_used numeric; v_timezone text; v_start int; v_end int; v_night boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account_id AND user_id=auth.uid())
   AND NOT public.platform_staff_has_permission('accounts.read')
   AND NOT public.platform_staff_has_permission('limits.manage')
 THEN RAISE EXCEPTION 'Não autorizado a consultar os limites Pix desta conta' USING ERRCODE='42501'; END IF;
 v_policy := public.platform_effective_policy_internal(p_account_id);
 v_timezone := v_policy->>'timezone';
 v_start := (v_policy->>'pix_night_start_hour')::int;
 v_end := (v_policy->>'pix_night_end_hour')::int;
 v_today := (now() AT TIME ZONE v_timezone)::date;
 v_night := public.platform_pix_is_night(now(),v_timezone,v_start,v_end);
 SELECT coalesce(sum(t.amount),0),coalesce(sum(t.amount) FILTER(
   WHERE public.platform_pix_is_night(t.created_at,v_timezone,v_start,v_end)),0)
 INTO v_used,v_night_used
 FROM public.transactions t WHERE t.account_id=p_account_id AND t.type='pix'
   AND t.direction='out' AND t.status='completed' AND t.related_transaction_id IS NULL
   AND (t.created_at AT TIME ZONE v_timezone)::date=v_today;
 RETURN v_policy || jsonb_build_object(
   'date',v_today,'is_night',v_night,'used_daily',v_used,'used_night',v_night_used,
   'remaining_daily',greatest(0,(v_policy->>'pix_daily_limit')::numeric-v_used),
   'remaining_night',greatest(0,(v_policy->>'pix_night_limit')::numeric-v_night_used),
   'active_remaining',least(greatest(0,(v_policy->>'pix_daily_limit')::numeric-v_used),
     CASE WHEN v_night THEN greatest(0,(v_policy->>'pix_night_limit')::numeric-v_night_used)
     ELSE (v_policy->>'pix_daily_limit')::numeric END)
 );
END;
$f$;

CREATE OR REPLACE FUNCTION public.platform_enforce_pix_outbound_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
DECLARE v_policy jsonb; v_zone text; v_start int; v_end int; v_today date; v_total numeric; v_night_total numeric; v_at_night boolean;
BEGIN
 IF NEW.type<>'pix' OR NEW.direction<>'out' OR NEW.status<>'completed'
    OR NEW.related_transaction_id IS NOT NULL THEN RETURN NEW; END IF;
 IF current_setting('role',true) IN ('authenticated','anon') OR current_user IN ('authenticated','anon') THEN
   RAISE EXCEPTION 'Transferências Pix exigem motor transacional autorizado' USING ERRCODE='42501';
 END IF;
 IF NEW.amount IS NULL OR NEW.amount<=0 OR NEW.amount<>round(NEW.amount,2)
    THEN RAISE EXCEPTION 'Valor Pix inválido'; END IF;
 v_policy:=public.platform_effective_policy_internal(NEW.account_id);
 v_zone:=v_policy->>'timezone';
 v_start:=(v_policy->>'pix_night_start_hour')::int;
 v_end:=(v_policy->>'pix_night_end_hour')::int;
 v_today:=(NEW.created_at AT TIME ZONE v_zone)::date;
 v_at_night:=public.platform_pix_is_night(NEW.created_at,v_zone,v_start,v_end);
 SELECT coalesce(sum(t.amount),0),coalesce(sum(t.amount) FILTER(
   WHERE public.platform_pix_is_night(t.created_at,v_zone,v_start,v_end)),0)
 INTO v_total,v_night_total
 FROM public.transactions t WHERE t.account_id=NEW.account_id
 AND t.type='pix' AND t.direction='out' AND t.status='completed'
 AND t.related_transaction_id IS NULL
 AND (t.created_at AT TIME ZONE v_zone)::date=v_today;
 IF v_total+NEW.amount > (v_policy->>'pix_daily_limit')::numeric THEN
   RAISE EXCEPTION 'Limite Pix diário excedido. Utilizado R$ %, limite R$ %. Solicite aumento ao administrador.',
   to_char(v_total,'FM999999990D00'),to_char((v_policy->>'pix_daily_limit')::numeric,'FM999999990D00')
   USING ERRCODE='P0001';
 END IF;
 IF v_at_night AND v_night_total+NEW.amount > (v_policy->>'pix_night_limit')::numeric THEN
   RAISE EXCEPTION 'Limite Pix noturno excedido. Utilizado R$ %, limite R$ %. Solicite aumento ao administrador.',
   to_char(v_night_total,'FM999999990D00'),to_char((v_policy->>'pix_night_limit')::numeric,'FM999999990D00')
   USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS trg_platform_enforce_pix_outbound_limit ON public.transactions;
CREATE TRIGGER trg_platform_enforce_pix_outbound_limit
BEFORE INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.platform_enforce_pix_outbound_limit();
REVOKE ALL ON FUNCTION public.platform_pix_limit_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_pix_limit_snapshot(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.platform_enforce_pix_outbound_limit() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.platform_pix_is_night(timestamptz,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_pix_is_night(timestamptz,text,integer,integer) TO authenticated,service_role;
COMMIT;