-- Reconstituição segura dos comprovantes de contas Sandbox.
-- Mantém o recibo original de depósitos e dados persistidos do razão Pix.
-- Nunca disponibiliza comprovantes de contas de terceiros ou de operadores internos.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_optmapay_receipt_pix_account_date
ON public.transactions(account_id, created_at DESC, id DESC)
WHERE type = 'pix' AND status IN ('completed','refunded')
  AND environment = 'sandbox' AND real_money = false;

CREATE OR REPLACE FUNCTION public.bank_receipts_list(
  p_account_id uuid,
  p_kind text DEFAULT 'all',
  p_search text DEFAULT '',
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp AS $function$
DECLARE
  v_count integer;
  v_items jsonb;
  v_query text;
BEGIN
  IF auth.uid() IS NULL OR auth.role() <> 'authenticated'
    OR NOT EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = p_account_id AND a.user_id = auth.uid()
        AND NOT EXISTS(
          SELECT 1 FROM public.platform_staff s
          WHERE s.user_id = a.user_id AND s.enabled
        )
    )
  THEN
    RAISE EXCEPTION 'Acesso negado aos comprovantes desta conta'
      USING ERRCODE = '42501';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('all','deposit','pix_sent','pix_received','pix_refund')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 5000
    OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to)
    OR length(coalesce(p_search,'')) > 120
  THEN
    RAISE EXCEPTION 'Filtros de comprovantes inválidos'
      USING ERRCODE = '22023';
  END IF;

  v_query := trim(coalesce(p_search,''));

  WITH entries AS (
    SELECT o.id AS receipt_id, 'deposit'::text AS kind, 'in'::text AS direction,
      o.amount, o.created_at, o.description,
      'completed'::text AS status,
      NULL::text AS counterparty_name,
      o.id::text AS reference
    FROM public.sandbox_deposit_operations o
    WHERE o.account_id = p_account_id
      AND o.receipt->>'environment' = 'sandbox'
      AND o.receipt->>'real_money' = 'false'

    UNION ALL

    SELECT t.id AS receipt_id,
      CASE WHEN t.related_transaction_id IS NOT NULL THEN 'pix_refund'
           WHEN t.direction = 'out' THEN 'pix_sent'
           ELSE 'pix_received' END AS kind,
      t.direction, t.amount, t.created_at, t.description,
      t.status, t.counterparty_name,
      coalesce(t.external_reference, t.id::text) AS reference
    FROM public.transactions t
    WHERE t.account_id = p_account_id
      AND t.type = 'pix'
      AND t.status IN ('completed','refunded')
      AND t.environment = 'sandbox'
      AND t.real_money = false
  ),
  filtered AS (
    SELECT * FROM entries e
    WHERE (p_kind = 'all' OR e.kind = p_kind)
      AND (p_from IS NULL OR (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_from)
      AND (p_to IS NULL OR (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_to)
      AND (
        v_query = ''
        OR e.receipt_id::text ILIKE '%' || v_query || '%'
        OR e.reference ILIKE '%' || v_query || '%'
        OR e.description ILIKE '%' || v_query || '%'
        OR e.counterparty_name ILIKE '%' || v_query || '%'
      )
  )
  SELECT
    (SELECT count(*)::integer FROM filtered),
    coalesce(
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC, p.receipt_id DESC)
       FROM (
         SELECT receipt_id, kind, direction, amount, created_at,
           description, status, counterparty_name, reference
         FROM filtered
         ORDER BY created_at DESC, receipt_id DESC
         LIMIT p_limit OFFSET p_offset
       ) p),
      '[]'::jsonb
    )
  INTO v_count, v_items;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_count,
    'offset', p_offset,
    'has_more', p_offset + jsonb_array_length(v_items) < v_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bank_receipts_list(uuid,text,text,date,date,integer,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bank_receipts_list(uuid,text,text,date,date,integer,integer)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bank_receipt_get(
  p_account_id uuid,
  p_kind text,
  p_receipt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp AS $function$
DECLARE
  v_deposit public.sandbox_deposit_operations%ROWTYPE;
  v_account public.accounts%ROWTYPE;
  v_pix public.transactions%ROWTYPE;
  v_other public.accounts%ROWTYPE;
  v_kind text;
BEGIN
  SELECT * INTO v_account FROM public.accounts a
  WHERE a.id = p_account_id AND a.user_id = auth.uid()
    AND NOT EXISTS(
      SELECT 1 FROM public.platform_staff s WHERE s.user_id = a.user_id AND s.enabled
    );

  IF auth.uid() IS NULL OR auth.role() <> 'authenticated' OR NOT FOUND
  THEN
    RAISE EXCEPTION 'Acesso negado ao comprovante desta conta'
      USING ERRCODE = '42501';
  END IF;

  IF p_kind = 'deposit' THEN
    SELECT * INTO v_deposit FROM public.sandbox_deposit_operations
    WHERE id = p_receipt_id AND account_id = p_account_id
      AND receipt->>'environment' = 'sandbox'
      AND receipt->>'real_money' = 'false';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Comprovante de depósito não encontrado';
    END IF;

    RETURN (v_deposit.receipt - 'idempotency_key')
      || jsonb_build_object(
        'kind', 'deposit',
        'receipt_id', v_deposit.id,
        'account_name', v_account.name,
        'receipt_label', coalesce(
          v_deposit.receipt->>'receipt_label',
          'Comprovante fictício OptmaPay ' || substr(v_deposit.id::text,1,13)
        ),
        'created_at', v_deposit.created_at
      );
  END IF;

  IF p_kind NOT IN ('pix_sent','pix_received','pix_refund') THEN
    RAISE EXCEPTION 'Tipo de comprovante inválido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pix FROM public.transactions t
  WHERE t.id = p_receipt_id AND t.account_id = p_account_id
    AND t.type = 'pix' AND t.status IN ('completed','refunded')
    AND t.environment = 'sandbox' AND t.real_money = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comprovante Pix não encontrado';
  END IF;

  v_kind := CASE WHEN v_pix.related_transaction_id IS NOT NULL THEN 'pix_refund'
                 WHEN v_pix.direction = 'out' THEN 'pix_sent'
                 ELSE 'pix_received' END;
  IF v_kind <> p_kind THEN
    RAISE EXCEPTION 'Tipo de comprovante não corresponde ao lançamento' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_other FROM public.accounts WHERE id = v_pix.counterparty_account_id;

  RETURN jsonb_build_object(
    'kind', v_kind,
    'receipt_id', v_pix.id,
    'transaction_id', v_pix.id,
    'related_transaction_id', v_pix.related_transaction_id,
    'reference', coalesce(v_pix.external_reference, v_pix.id::text),
    'account_id', p_account_id,
    'amount', v_pix.amount,
    'created_at', v_pix.created_at,
    'description', v_pix.description,
    'direction', v_pix.direction,
    'status', v_pix.status,
    'refunded_amount', coalesce(v_pix.refunded_amount,0),
    'sender_name', CASE WHEN v_pix.direction = 'out' THEN v_account.name
      ELSE coalesce(v_pix.counterparty_name,v_other.name,'Não informado') END,
    'receiver_name', CASE WHEN v_pix.direction = 'in' THEN v_account.name
      ELSE coalesce(v_pix.counterparty_name,v_other.name,'Não informado') END,
    'sender_pix_key', CASE WHEN v_pix.direction = 'out' THEN v_account.pix_key
      ELSE v_other.pix_key END,
    'receiver_pix_key', CASE WHEN v_pix.direction = 'in' THEN v_account.pix_key
      ELSE v_other.pix_key END,
    'pix_keys_are_current', true,
    'environment', 'sandbox',
    'real_money', false,
    'receipt_label', 'Comprovante fictício OptmaPay ' || substr(v_pix.id::text,1,13)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bank_receipt_get(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bank_receipt_get(uuid,text,uuid) TO authenticated, service_role;

COMMIT;
