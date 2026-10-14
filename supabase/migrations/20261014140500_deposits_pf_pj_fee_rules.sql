-- Enforce PF/PJ and per-account fee-free quotas and tariffs in atomic deposit RPCs.
BEGIN;
CREATE OR REPLACE FUNCTION public.sandbox_deposit_quote(p_account_id uuid,p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog, public, auth, pg_temp
AS $fn$
DECLARE
  v_settings public.platform_system_settings%ROWTYPE;
  v_policy jsonb;
  v_owner uuid;
  v_count bigint;
  v_fee numeric(15,2);
  v_start timestamptz;
  v_end timestamptz;
  v_month timestamp;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário entrar como correntista para depositar.' USING ERRCODE='42501';
  END IF;
  SELECT user_id INTO v_owner FROM public.accounts WHERE id=p_account_id;
  IF NOT FOUND OR v_owner IS DISTINCT FROM auth.uid()
    THEN RAISE EXCEPTION 'Conta não autorizada.' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT v_settings FROM public.platform_system_settings WHERE id=1;
  v_policy := public.platform_effective_financial_policy_internal(p_account_id);
  IF p_amount IS NULL OR (p_amount <> round(p_amount,2) OR mod(p_amount*100,5)<>0)
    OR p_amount < (v_policy->>'deposit_min')::numeric OR p_amount > (v_policy->>'deposit_max')::numeric
    THEN RAISE EXCEPTION 'Valor fora do limite permitido para depósito fictício.'; END IF;
  v_month := date_trunc('month',now() AT TIME ZONE v_settings.business_timezone);
  v_start := v_month AT TIME ZONE v_settings.business_timezone;
  v_end := (v_month + interval '1 month') AT TIME ZONE v_settings.business_timezone;
  SELECT count(*) INTO v_count
  FROM public.transactions t
  WHERE t.account_id=p_account_id AND t.type='deposit' AND t.direction='in'
    AND t.status='completed' AND t.real_money IS FALSE
    AND t.created_at >= v_start AND t.created_at < v_end;
  v_fee := CASE WHEN v_count >= (v_policy->>'deposit_free_monthly')::integer THEN (v_policy->>'deposit_excess_fee')::numeric ELSE 0 END;
  IF v_fee >= p_amount THEN RAISE EXCEPTION 'A tarifa não pode consumir todo o depósito; escolha um valor maior.'; END IF;
  RETURN jsonb_build_object(
    'account_id',p_account_id,'amount',p_amount,'fee_amount',v_fee,
    'net_amount',p_amount-v_fee,'deposits_this_month',v_count,
    'next_deposit_number',v_count+1,'free_monthly',(v_policy->>'deposit_free_monthly')::integer,
    'free_remaining',GREATEST((v_policy->>'deposit_free_monthly')::integer-v_count,0),
    'min_amount',(v_policy->>'deposit_min')::numeric,'max_amount',(v_policy->>'deposit_max')::numeric,
    'period',to_char(v_month,'YYYY-MM'),'timezone',v_settings.business_timezone,
    'environment','sandbox','real_money',false);
END
$fn$;

CREATE OR REPLACE FUNCTION public.sandbox_deposit_confirm(
  p_account_id uuid,
  p_amount numeric,
  p_description text,
  p_idempotency_key text,
  p_expected_fee numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog, public, auth, pg_temp
AS $fn$
DECLARE
  v_actor uuid;
  v_owner uuid;
  v_balance numeric(15,2);
  v_settings public.platform_system_settings%ROWTYPE;
  v_policy jsonb;
  v_month timestamp;
  v_start timestamptz;
  v_end timestamptz;
  v_count bigint;
  v_fee numeric(15,2);
  v_desc text;
  v_existing public.sandbox_deposit_operations%ROWTYPE;
  v_transaction_id uuid;
  v_fee_transaction_id uuid;
  v_operation_id uuid := gen_random_uuid();
  v_created_at timestamptz := now();
  v_receipt jsonb;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL OR auth.role() <> 'authenticated'
    THEN RAISE EXCEPTION 'Operação exige sessão de correntista autenticado.' USING ERRCODE='42501'; END IF;
  IF p_account_id IS NULL OR p_idempotency_key IS NULL
    OR length(p_idempotency_key) NOT BETWEEN 16 AND 128
    OR p_idempotency_key !~ '^[a-zA-Z0-9_-]+$'
    THEN RAISE EXCEPTION 'Identificador de operação inválido.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR (p_amount <> round(p_amount,2) OR mod(p_amount*100,5)<>0)
    THEN RAISE EXCEPTION 'Informe valor com até duas casas decimais.'; END IF;
  v_desc := COALESCE(NULLIF(trim(p_description),''),'Depósito fictício OptmaPay');
  IF length(v_desc)>160 THEN RAISE EXCEPTION 'Descrição deve ter no máximo 160 caracteres.'; END IF;

  -- Serializes all deposits for this account, including different idempotency keys.
  SELECT user_id,balance INTO v_owner,v_balance FROM public.accounts
  WHERE id=p_account_id FOR UPDATE;
  IF NOT FOUND OR v_owner IS DISTINCT FROM v_actor
    THEN RAISE EXCEPTION 'Conta não autorizada.' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_existing FROM public.sandbox_deposit_operations
  WHERE account_id=p_account_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.amount IS DISTINCT FROM p_amount OR v_existing.description IS DISTINCT FROM v_desc
      THEN RAISE EXCEPTION 'Chave de idempotência já utilizada com dados diferentes.'; END IF;
    RETURN v_existing.receipt || jsonb_build_object('replayed',true);
  END IF;

  SELECT * INTO STRICT v_settings FROM public.platform_system_settings WHERE id=1;
  v_policy := public.platform_effective_financial_policy_internal(p_account_id);
  IF p_amount < (v_policy->>'deposit_min')::numeric OR p_amount > (v_policy->>'deposit_max')::numeric
    THEN RAISE EXCEPTION 'Valor fora do limite permitido para depósito fictício.'; END IF;

  v_month := date_trunc('month',now() AT TIME ZONE v_settings.business_timezone);
  v_start := v_month AT TIME ZONE v_settings.business_timezone;
  v_end := (v_month + interval '1 month') AT TIME ZONE v_settings.business_timezone;
  SELECT count(*) INTO v_count FROM public.transactions t
  WHERE t.account_id=p_account_id AND t.type='deposit' AND t.direction='in'
    AND t.status='completed' AND t.real_money IS FALSE
    AND t.created_at >= v_start AND t.created_at < v_end;

  v_fee := CASE WHEN v_count >= (v_policy->>'deposit_free_monthly')::integer THEN (v_policy->>'deposit_excess_fee')::numeric ELSE 0 END;
  IF v_fee >= p_amount THEN RAISE EXCEPTION 'A tarifa é igual ou superior ao depósito.'; END IF;
  IF p_expected_fee IS NULL OR p_expected_fee <> v_fee
    THEN RAISE EXCEPTION 'A tarifa foi atualizada. Revise o valor antes de confirmar.' USING ERRCODE='P0001'; END IF;

  INSERT INTO public.transactions(
    user_id,account_id,type,direction,amount,description,
    external_reference,status,real_money,environment,created_at
  ) VALUES (
    v_owner,p_account_id,'deposit','in',p_amount,v_desc,
    'DEP-'||v_operation_id::text,'completed',false,'sandbox',v_created_at
  ) RETURNING id INTO v_transaction_id;

  IF v_fee > 0 THEN
    INSERT INTO public.transactions(
      user_id,account_id,type,direction,amount,description,
      external_reference,status,real_money,environment,created_at
    ) VALUES (
      v_owner,p_account_id,'withdraw','out',v_fee,
      'Tarifa de depósito fictício nº '||(v_count+1)::text,
      'DEP-FEE-'||v_operation_id::text,'completed',false,'sandbox',v_created_at + interval '1 millisecond'
    ) RETURNING id INTO v_fee_transaction_id;
  END IF;

  UPDATE public.accounts SET balance=balance+p_amount-v_fee,updated_at=now()
  WHERE id=p_account_id RETURNING balance INTO v_balance;

  v_receipt := jsonb_build_object(
    'receipt_label','Comprovante fictício OptmaPay '||substr(v_operation_id::text,1,13),
    'success',true,'operation_id',v_operation_id,'account_id',p_account_id,
    'transaction_id',v_transaction_id,'fee_transaction_id',v_fee_transaction_id,
    'idempotency_key',p_idempotency_key,'description',v_desc,
    'amount',p_amount,'fee_amount',v_fee,'net_amount',p_amount-v_fee,
    'new_balance',v_balance,'deposit_number',v_count+1,
    'free_monthly',(v_policy->>'deposit_free_monthly')::integer,
    'period',to_char(v_month,'YYYY-MM'),'timezone',v_settings.business_timezone,
    'created_at',v_created_at,'environment','sandbox','real_money',false,
    'message','Depósito fictício confirmado. Nenhum dinheiro real foi movimentado.',
    'replayed',false
  );

  INSERT INTO public.sandbox_deposit_operations(
    id,account_id,actor_user_id,idempotency_key,amount,description,fee,
    credited_amount,transaction_id,fee_transaction_id,receipt,created_at
  ) VALUES (
    v_operation_id,p_account_id,v_actor,p_idempotency_key,p_amount,v_desc,v_fee,
    p_amount-v_fee,v_transaction_id,v_fee_transaction_id,v_receipt,v_created_at
  );
  RETURN v_receipt;
END
$fn$;



COMMIT;