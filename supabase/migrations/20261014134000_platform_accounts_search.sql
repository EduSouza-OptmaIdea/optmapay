BEGIN;
CREATE OR REPLACE FUNCTION public.platform_accounts_search(p_query text DEFAULT '',p_limit integer DEFAULT 75)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth,pg_temp AS $f$
BEGIN
 IF NOT public.platform_staff_has_permission('limits.manage') THEN
   RAISE EXCEPTION 'Permissão limits.manage necessária' USING ERRCODE='42501';
 END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC)
  FROM (
   SELECT a.id,a.name,a.type,a.created_at,u.email::text AS email,a.user_id,
     EXISTS(SELECT 1 FROM public.platform_account_overrides o WHERE o.account_id=a.id) AS has_override
   FROM public.accounts a LEFT JOIN auth.users u ON u.id=a.user_id
   WHERE (coalesce(p_query,'')='' OR a.name ILIKE '%'||left(trim(p_query),100)||'%'
      OR u.email ILIKE '%'||left(trim(p_query),100)||'%'
      OR a.account_number ILIKE '%'||left(trim(p_query),100)||'%')
   ORDER BY a.created_at DESC
   LIMIT least(greatest(coalesce(p_limit,75),1),150)
  ) r),'[]'::jsonb);
END
$f$;
REVOKE ALL ON FUNCTION public.platform_accounts_search(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_accounts_search(text,integer) TO authenticated,service_role;
COMMIT;