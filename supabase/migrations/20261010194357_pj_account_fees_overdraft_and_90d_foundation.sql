
create table if not exists public.account_charge_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  charge_code text not null,
  reference_date date not null,
  amount numeric(15,2) not null default 0 check (amount >= 0),
  base_amount numeric(15,2),
  rate_percent numeric(12,6),
  transaction_id uuid references public.transactions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(account_id,charge_code,reference_date)
);

alter table public.account_charge_ledger enable row level security;
revoke all on table public.account_charge_ledger from public, anon, authenticated;
grant select,insert,update,delete on table public.account_charge_ledger to service_role;

create or replace function public.optmapay_overdraft_limit(p_account_id uuid)
returns numeric
language sql
stable
security definer
set search_path=public,pg_temp
as $fn$
  select greatest(0,coalesce((a.config->>'overdraft_limit')::numeric,0))
  from public.accounts a
  where a.id=p_account_id
$fn$;

revoke all on function public.optmapay_overdraft_limit(uuid) from public,anon;
grant execute on function public.optmapay_overdraft_limit(uuid) to authenticated,service_role;

create or replace function public.apply_optmapay_account_charge(
  p_account_id uuid,
  p_charge_code text,
  p_reference_date date,
  p_amount numeric,
  p_description text,
  p_base_amount numeric default null,
  p_rate_percent numeric default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $fn$
declare
  v_role text;
  v_acc public.accounts%rowtype;
  v_amount numeric(15,2);
  v_tx uuid;
  v_existing public.account_charge_ledger%rowtype;
begin
  v_role:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(auth.role(),''),current_user);
  if v_role not in ('service_role','postgres','supabase_admin') then
    raise exception 'Acesso negado: cobrança automática é restrita ao backend.';
  end if;

  if p_account_id is null or p_reference_date is null or nullif(trim(coalesce(p_charge_code,'')),'') is null then
    raise exception 'Parâmetros obrigatórios ausentes.';
  end if;

  v_amount:=round(coalesce(p_amount,0),2);
  if v_amount <= 0 then
    return jsonb_build_object('success',true,'skipped',true,'reason','zero_amount');
  end if;

  select * into v_existing
  from public.account_charge_ledger
  where account_id=p_account_id and charge_code=p_charge_code and reference_date=p_reference_date
  for update;

  if found then
    return jsonb_build_object(
      'success',true,'duplicate',true,'ledger_id',v_existing.id,
      'transaction_id',v_existing.transaction_id,'amount',v_existing.amount
    );
  end if;

  select * into v_acc
  from public.accounts
  where id=p_account_id
  for update;

  if not found then raise exception 'Conta não encontrada.'; end if;

  if v_acc.balance - v_amount < -greatest(0,coalesce((v_acc.config->>'overdraft_limit')::numeric,0)) then
    raise exception 'Limite insuficiente para cobrança automática: saldo %, limite %, cobrança %.',
      v_acc.balance,
      greatest(0,coalesce((v_acc.config->>'overdraft_limit')::numeric,0)),
      v_amount;
  end if;

  update public.accounts
  set balance=balance-v_amount,updated_at=now()
  where id=p_account_id;

  insert into public.transactions(
    user_id,account_id,type,direction,amount,description,external_reference,status,
    real_money,environment,created_at
  ) values (
    v_acc.user_id,p_account_id,'withdraw','out',v_amount,
    coalesce(nullif(trim(p_description),''),'Tarifa OptmaPay Sandbox'),
    'ACCOUNT-CHARGE:'||p_charge_code||':'||p_reference_date::text,
    'completed',false,'sandbox',
    (p_reference_date::timestamp + time '00:05') at time zone 'America/Sao_Paulo'
  )
  returning id into v_tx;

  insert into public.account_charge_ledger(
    account_id,charge_code,reference_date,amount,base_amount,rate_percent,
    transaction_id,metadata,created_at
  ) values (
    p_account_id,p_charge_code,p_reference_date,v_amount,p_base_amount,p_rate_percent,
    v_tx,coalesce(p_metadata,'{}'::jsonb),
    (p_reference_date::timestamp + time '00:05') at time zone 'America/Sao_Paulo'
  );

  return jsonb_build_object(
    'success',true,'duplicate',false,'transaction_id',v_tx,'amount',v_amount,
    'new_balance',(select balance from public.accounts where id=p_account_id)
  );
end;
$fn$;

revoke all on function public.apply_optmapay_account_charge(uuid,text,date,numeric,text,numeric,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.apply_optmapay_account_charge(uuid,text,date,numeric,text,numeric,numeric,jsonb) to service_role;

create or replace function public.run_optmapay_daily_account_charges(p_run_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $fn$
declare
  v_role text;
  v_acc public.accounts%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_maintenance numeric;
  v_monthly_rate numeric;
  v_daily_iof numeric;
  v_additional_iof numeric;
  v_principal numeric;
  v_interest numeric;
  v_iof numeric;
  v_extra_iof numeric;
  v_cycle_started text;
  v_item jsonb;
begin
  v_role:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(auth.role(),''),current_user);
  if v_role not in ('service_role','postgres','supabase_admin') then
    raise exception 'Acesso negado: rotina diária é restrita ao backend.';
  end if;

  for v_acc in
    select *
    from public.accounts
    where coalesce((config->>'banking_fees_enabled')::boolean,false)=true
    order by id
    for update
  loop
    v_maintenance:=coalesce((v_acc.config->>'pj_monthly_maintenance_fee')::numeric,12.99);
    v_monthly_rate:=coalesce((v_acc.config->>'overdraft_interest_monthly_pct')::numeric,13.45);
    v_daily_iof:=coalesce((v_acc.config->>'overdraft_iof_daily_pct')::numeric,0.0082);
    v_additional_iof:=coalesce((v_acc.config->>'overdraft_iof_additional_pct')::numeric,0.38);

    if extract(day from p_run_date)=1 and p_run_date>=date_trunc('month',v_acc.created_at at time zone 'America/Sao_Paulo')::date then
      v_item:=public.apply_optmapay_account_charge(
        v_acc.id,'pj_monthly_maintenance',p_run_date,v_maintenance,
        'Tarifa mensal de manutenção da conta PJ',v_maintenance,null,
        jsonb_build_object('sandbox_simulation',true,'category','account_maintenance')
      );
      v_results:=v_results||jsonb_build_array(v_item);
      select * into v_acc from public.accounts where id=v_acc.id for update;
    end if;

    v_principal:=greatest(0,-v_acc.balance);
    v_cycle_started:=nullif(v_acc.config->>'overdraft_cycle_started_on','');

    if v_principal > 0 then
      if v_cycle_started is null then
        v_extra_iof:=round(v_principal*(v_additional_iof/100.0),2);
        if v_extra_iof>0 then
          v_item:=public.apply_optmapay_account_charge(
            v_acc.id,'overdraft_iof_additional',p_run_date,v_extra_iof,
            'IOF adicional sobre uso do limite de conta',v_principal,v_additional_iof,
            jsonb_build_object('sandbox_simulation',true,'category','overdraft_iof_additional')
          );
          v_results:=v_results||jsonb_build_array(v_item);
          update public.accounts
          set config=coalesce(config,'{}'::jsonb)||jsonb_build_object('overdraft_cycle_started_on',p_run_date::text),
              updated_at=now()
          where id=v_acc.id;
          select * into v_acc from public.accounts where id=v_acc.id for update;
          v_principal:=greatest(0,-v_acc.balance);
        end if;
      end if;

      v_interest:=round(v_principal*((v_monthly_rate/30.0)/100.0),2);
      if v_interest>0 then
        v_item:=public.apply_optmapay_account_charge(
          v_acc.id,'overdraft_interest_daily',p_run_date,v_interest,
          'Juros sobre uso do limite de conta',v_principal,v_monthly_rate/30.0,
          jsonb_build_object(
            'sandbox_simulation',true,'category','overdraft_interest',
            'monthly_reference_rate_pct',v_monthly_rate
          )
        );
        v_results:=v_results||jsonb_build_array(v_item);
        select * into v_acc from public.accounts where id=v_acc.id for update;
        v_principal:=greatest(0,-v_acc.balance);
      end if;

      v_iof:=round(v_principal*(v_daily_iof/100.0),2);
      if v_iof>0 then
        v_item:=public.apply_optmapay_account_charge(
          v_acc.id,'overdraft_iof_daily',p_run_date,v_iof,
          'IOF diário sobre saldo devedor',v_principal,v_daily_iof,
          jsonb_build_object('sandbox_simulation',true,'category','overdraft_iof_daily')
        );
        v_results:=v_results||jsonb_build_array(v_item);
      end if;
    elsif v_cycle_started is not null then
      update public.accounts
      set config=coalesce(config,'{}'::jsonb)-'overdraft_cycle_started_on',updated_at=now()
      where id=v_acc.id;
    end if;
  end loop;

  return jsonb_build_object('success',true,'run_date',p_run_date,'results',v_results);
end;
$fn$;

revoke all on function public.run_optmapay_daily_account_charges(date) from public,anon,authenticated;
grant execute on function public.run_optmapay_daily_account_charges(date) to service_role;

update public.accounts
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
  'overdraft_limit',5000.00,
  'overdraft_interest_monthly_pct',13.45,
  'overdraft_interest_reference','BCB_SGS_25446_AUG_2026',
  'overdraft_iof_daily_pct',0.0082,
  'overdraft_iof_additional_pct',0.38,
  'pj_monthly_maintenance_fee',12.99,
  'pj_monthly_maintenance_day',1,
  'banking_fees_enabled',true,
  'banking_fee_policy','sandbox_simulation',
  'banking_fee_policy_updated_at',now()
),
updated_at=now()
where id='afce3a88-8309-4feb-8fa7-8b07d9f22150'::uuid;

select public.apply_optmapay_account_charge(
  'afce3a88-8309-4feb-8fa7-8b07d9f22150'::uuid,
  'pj_monthly_maintenance',
  '2026-09-01'::date,
  12.99,
  'Tarifa mensal de manutenção da conta PJ',
  12.99,null,
  jsonb_build_object('sandbox_simulation',true,'category','account_maintenance','backfill',true)
);

select public.apply_optmapay_account_charge(
  'afce3a88-8309-4feb-8fa7-8b07d9f22150'::uuid,
  'pj_monthly_maintenance',
  '2026-10-01'::date,
  12.99,
  'Tarifa mensal de manutenção da conta PJ',
  12.99,null,
  jsonb_build_object('sandbox_simulation',true,'category','account_maintenance','backfill',true)
);

do $job$
declare v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname='optmapay-daily-account-charges'
  limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$job$;

select cron.schedule(
  'optmapay-daily-account-charges',
  '10 3 * * *',
  'select public.run_optmapay_daily_account_charges((now() at time zone ''America/Sao_Paulo'')::date);'
);

CREATE OR REPLACE FUNCTION public.transfer_pix(p_sender_account_id uuid, p_receiver_pix_key text, p_amount numeric, p_description text DEFAULT 'Transferência Pix Sandbox'::text, p_external_reference text DEFAULT NULL::text, p_actor_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_request_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sender_account RECORD;
  v_receiver_account RECORD;
  v_sender_user_id UUID;
  v_receiver_user_id UUID;
  v_receiver_account_id UUID;
  v_receiver_name TEXT;
  v_sender_name TEXT;
  v_sender_cpf_cnpj TEXT;
  v_clean_key TEXT;
  v_tx_out_id UUID;
  v_tx_in_id UUID;
  v_event_id UUID;
  v_event_payload JSONB;
  v_response_json JSONB;
  v_idemp_id UUID;
  v_existing_idemp RECORD;
  v_cfg RECORD;
  v_role TEXT;
  v_occurred_at TIMESTAMPTZ := now();
BEGIN
  -- 1. VALIDAÇÃO DE VALOR
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor da transferência Pix deve ser maior que zero.';
  END IF;

  -- 2. VALIDAÇÃO E BLOQUEIO DA CONTA PAGADORA
  SELECT id, user_id, balance, name, cpf_cnpj, config INTO v_sender_account
  FROM public.accounts
  WHERE id = p_sender_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta pagadora não encontrada.';
  END IF;

  v_sender_user_id := v_sender_account.user_id;
  v_sender_name := v_sender_account.name;
  v_sender_cpf_cnpj := v_sender_account.cpf_cnpj;

  -- 3. FECHAMENTO DE SEGURANÇA SECURITY DEFINER COM EXIGÊNCIA ESTRITA DE ATOR
  v_role := COALESCE(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.role(), ''),
    current_user
  );

  IF v_role = 'authenticated' THEN
    -- Invocação por usuário logado (ex: Dashboard Pix)
    IF auth.uid() IS NULL OR v_sender_user_id IS NULL OR auth.uid() <> v_sender_user_id THEN
      RAISE EXCEPTION 'Acesso negado: você não tem permissão para movimentar fundos desta conta.';
    END IF;
    IF p_actor_user_id IS NOT NULL AND p_actor_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Acesso negado: o ator informado não corresponde ao usuário autenticado.';
    END IF;
  ELSIF v_role IN ('service_role', 'postgres', 'supabase_admin') THEN
    -- Invocação via service_role: p_actor_user_id É OBRIGATÓRIO e deve ser igual ao dono da conta pagadora
    IF p_actor_user_id IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: p_actor_user_id é obrigatório para transferências Pix via service_role.';
    END IF;
    IF v_sender_user_id IS NULL OR p_actor_user_id <> v_sender_user_id THEN
      RAISE EXCEPTION 'Acesso negado: o usuário autenticado não é o proprietário da conta pagadora.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Acesso negado: privilégios insuficientes para executar transfer_pix.';
  END IF;

  -- 4. CONTROLE ATÔMICO DE IDEMPOTÊNCIA NO POSTGRESQL (Sem takeover arbitrário)
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) <> '' THEN
    INSERT INTO public.api_idempotency_keys (
      account_id,
      operation,
      idempotency_key,
      request_hash,
      status,
      actor_user_id,
      created_at,
      updated_at
    ) VALUES (
      p_sender_account_id,
      'pix:transfer',
      p_idempotency_key,
      p_request_hash,
      'in_progress',
      COALESCE(p_actor_user_id, v_sender_user_id),
      now(),
      now()
    )
    ON CONFLICT (account_id, operation, idempotency_key) DO NOTHING
    RETURNING id INTO v_idemp_id;

    IF v_idemp_id IS NULL THEN
      SELECT * INTO v_existing_idemp
      FROM public.api_idempotency_keys
      WHERE account_id = p_sender_account_id
        AND operation = 'pix:transfer'
        AND idempotency_key = p_idempotency_key;

      IF FOUND THEN
        IF p_request_hash IS NOT NULL AND v_existing_idemp.request_hash IS NOT NULL AND v_existing_idemp.request_hash <> p_request_hash THEN
          RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED: Esta Idempotency-Key já foi utilizada com parâmetros de requisição diferentes.';
        END IF;

        IF v_existing_idemp.status = 'completed' AND v_existing_idemp.response_body IS NOT NULL THEN
          RETURN jsonb_set(v_existing_idemp.response_body, '{from_cache}', 'true'::jsonb);
        END IF;

        -- Qualquer status in_progress retorna IDEMPOTENCY_IN_PROGRESS sem takeover não atômico
        IF v_existing_idemp.status = 'in_progress' THEN
          RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS: Uma transferência com esta Idempotency-Key já está sendo processada concorrentemente.';
        END IF;

        IF v_existing_idemp.status = 'failed' THEN
          RAISE EXCEPTION 'IDEMPOTENCY_FAILED: Transferência anterior com esta Idempotency-Key falhou e não pode ser reutilizada.';
        END IF;
      END IF;
    END IF;
  END IF;

  -- 5. VERIFICAÇÃO DE SALDO DISPONÍVEL
  IF (v_sender_account.balance + greatest(0,coalesce((v_sender_account.config->>'overdraft_limit')::numeric,0))) < p_amount THEN
    RAISE EXCEPTION 'Saldo e limite insuficientes para realizar a transferência Pix (Saldo: R$ %, Limite: R$ %, Solicitado: R$ %).',
      v_sender_account.balance,
      greatest(0,coalesce((v_sender_account.config->>'overdraft_limit')::numeric,0)),
      p_amount;
  END IF;

  -- 6. BUSCA E BLOQUEIO DA CONTA RECEBEDORA
  v_clean_key := TRIM(p_receiver_pix_key);

  SELECT id, user_id, name, cpf_cnpj, balance INTO v_receiver_account
  FROM public.accounts
  WHERE pix_key = v_clean_key
     OR pix_key ILIKE v_clean_key
     OR cpf_cnpj = v_clean_key
     OR cpf_cnpj = regexp_replace(v_clean_key, '[^0-9]', '', 'g')
     OR (v_clean_key ~ '^[0-9a-fA-F-]{36}$' AND id = v_clean_key::uuid)
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chave Pix de destino "%" não encontrada no sistema de contas.', p_receiver_pix_key;
  END IF;

  v_receiver_account_id := v_receiver_account.id;
  v_receiver_name := v_receiver_account.name;
  v_receiver_user_id := v_receiver_account.user_id;

  IF p_sender_account_id = v_receiver_account_id THEN
    RAISE EXCEPTION 'A conta de origem e a conta de destino não podem ser iguais.';
  END IF;

  -- 7. ATUALIZAÇÃO ATÔMICA DOS SALDOS REAIS
  UPDATE public.accounts
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE id = p_sender_account_id;

  UPDATE public.accounts
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE id = v_receiver_account_id;

  -- 8. LANÇAMENTOS NO SCHEMA REAL (public.transactions)
  INSERT INTO public.transactions (
    account_id,
    user_id,
    counterparty_account_id,
    counterparty_name,
    counterparty_document,
    type,
    direction,
    amount,
    description,
    external_reference,
    status,
    real_money,
    environment,
    created_at
  ) VALUES (
    p_sender_account_id,
    v_sender_user_id,
    v_receiver_account_id,
    v_receiver_name,
    v_receiver_account.cpf_cnpj,
    'pix',
    'out',
    p_amount,
    p_description,
    p_external_reference,
    'completed',
    false,
    'sandbox',
    v_occurred_at
  ) RETURNING id INTO v_tx_out_id;

  INSERT INTO public.transactions (
    account_id,
    user_id,
    counterparty_account_id,
    counterparty_name,
    counterparty_document,
    type,
    direction,
    amount,
    description,
    external_reference,
    status,
    real_money,
    environment,
    created_at
  ) VALUES (
    v_receiver_account_id,
    v_receiver_user_id,
    p_sender_account_id,
    v_sender_name,
    v_sender_cpf_cnpj,
    'pix',
    'in',
    p_amount,
    p_description,
    p_external_reference,
    'completed',
    false,
    'sandbox',
    v_occurred_at
  ) RETURNING id INTO v_tx_in_id;

  -- 9. OUTBOX AUTORITATIVO: pix.paid (Somente webhooks inscritos em 'pix.paid' ou '*')
  v_event_id := gen_random_uuid();
  v_event_payload := jsonb_build_object(
    'id', v_event_id,
    'event', 'pix.paid',
    'createdAt', to_char(v_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'realMoney', false,
    'environment', 'sandbox',
    'data', jsonb_build_object(
      'transactionId', v_tx_in_id,
      'orderId', p_external_reference,
      'externalReference', p_external_reference,
      'amount', p_amount,
      'status', 'paid',
      'senderName', v_sender_name,
      'receiverName', v_receiver_name,
      'senderAccountId', p_sender_account_id,
      'receiverAccountId', v_receiver_account_id,
      'realMoney', false,
      'environment', 'sandbox',
      'paidAt', to_char(v_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );

  INSERT INTO public.webhook_events (
    id, account_id, event_type, resource_type, resource_id, idempotency_key, payload, occurred_at, created_at
  ) VALUES (
    v_event_id,
    v_receiver_account_id,
    'pix.paid',
    'transaction',
    v_tx_in_id::text,
    'pix.paid:' || v_tx_in_id::text,
    v_event_payload,
    v_occurred_at,
    v_occurred_at
  );

  FOR v_cfg IN
    SELECT id FROM public.webhooks_config
    WHERE account_id = v_receiver_account_id
      AND active = true
      AND ('pix.paid' = ANY(events) OR '*' = ANY(events))
  LOOP
    INSERT INTO public.webhook_delivery_jobs (
      event_id,
      webhook_config_id,
      status,
      attempt_count,
      next_attempt_at
    ) VALUES (
      v_event_id,
      v_cfg.id,
      'pending',
      0,
      now()
    ) ON CONFLICT (event_id, webhook_config_id) DO NOTHING;
  END LOOP;

  -- 10. CONTRATO CANÔNICO DA RESPOSTA
  v_response_json := jsonb_build_object(
    'success', true,
    'message', 'Transferência Pix concluída com sucesso!',
    'amount', p_amount,
    'sender_name', v_sender_name,
    'senderName', v_sender_name,
    'receiver_name', v_receiver_name,
    'receiverName', v_receiver_name,
    'sender_account_id', p_sender_account_id,
    'senderAccountId', p_sender_account_id,
    'receiver_account_id', v_receiver_account_id,
    'receiverAccountId', v_receiver_account_id,
    'transaction_out_id', v_tx_out_id,
    'transactionOutId', v_tx_out_id,
    'transaction_in_id', v_tx_in_id,
    'transactionInId', v_tx_in_id,
    'webhook_event_id', v_event_id,
    'webhookEventId', v_event_id,
    'external_reference', p_external_reference,
    'externalReference', p_external_reference,
    'created_at', to_char(v_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'real_money', false,
    'environment', 'sandbox'
  );

  -- 11. FINALIZAÇÃO DA IDEMPOTÊNCIA NA MESMA TRANSAÇÃO
  IF v_idemp_id IS NOT NULL THEN
    UPDATE public.api_idempotency_keys
    SET status = 'completed',
        response_status = 200,
        response_body = v_response_json,
        resource_type = 'transaction',
        resource_id = v_tx_in_id::text
    WHERE id = v_idemp_id;
  END IF;

  RETURN v_response_json;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_card_payment(p_merchant_account_id uuid, p_card_id uuid DEFAULT NULL::uuid, p_card_number text DEFAULT NULL::text, p_cardholder_name text DEFAULT 'CLIENTE SANDBOX'::text, p_validade text DEFAULT NULL::text, p_cvv text DEFAULT NULL::text, p_amount numeric DEFAULT 0, p_tipo text DEFAULT 'credito'::text, p_installments integer DEFAULT 1, p_plan text DEFAULT 'standard'::text, p_description text DEFAULT NULL::text, p_external_reference text DEFAULT NULL::text, p_api_key_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_request_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_card record;
  v_payer_account record;
  v_merchant_account record;
  v_merchant_user_id uuid;
  v_clean_card_number text;
  v_nsu text;
  v_auth_code text;
  v_tid text;
  v_tx_out_id uuid;
  v_tx_in_id uuid;
  v_effective_plan text;
  v_fee_rate numeric;
  v_fee_amount numeric(15,2);
  v_gross_amount numeric(15,2);
  v_net_amount numeric(15,2);
  v_is_instant boolean;
  v_in_tx_status text;
  v_in_tx_desc text;
  v_installments integer := greatest(1, least(12, coalesce(p_installments,1)));
  v_event_id uuid;
  v_event_payload jsonb;
  v_response_json jsonb;
  v_idemp_id uuid;
  v_existing_idemp record;
  v_cfg record;
  v_role text;
  v_occurred_at timestamptz := now();
  v_val_parts text[];
  v_val_month integer;
  v_val_year integer;
  v_cur_month integer := extract(month from now())::integer;
  v_cur_year integer := extract(year from now())::integer;
  v_expected_settlement_at timestamptz;
  v_receivable_id uuid;
  v_due_date date;
  v_invoice_id uuid;
  v_installment_amount numeric(15,2);
  v_remaining numeric(15,2);
  v_i integer;
begin
  if p_tipo is null or p_tipo not in ('credito','debito') then
    raise exception 'ERRO 03: Tipo de pagamento inválido. Deve ser "credito" ou "debito".';
  end if;

  v_gross_amount := round(coalesce(p_amount,0),2);
  if v_gross_amount <= 0 then
    raise exception 'O valor da transação deve ser maior que zero.';
  end if;

  select id,user_id,name,cpf_cnpj,balance into v_merchant_account
  from public.accounts
  where id = p_merchant_account_id
  for update;
  if not found then
    raise exception 'Conta do estabelecimento (merchant) não encontrada.';
  end if;
  v_merchant_user_id := v_merchant_account.user_id;

  v_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true),''),
    nullif(auth.role(),''),
    current_user
  );

  if v_role = 'authenticated' then
    if auth.uid() is null or v_merchant_user_id is null or auth.uid() <> v_merchant_user_id then
      raise exception 'Acesso negado: você não tem permissão para processar cobranças para esta conta merchant.';
    end if;
  elsif v_role in ('service_role','postgres','supabase_admin') then
    if p_api_key_id is null then
      raise exception 'Acesso negado: p_api_key_id é obrigatório para chamadas de sistema.';
    end if;
    perform 1 from public.api_keys
    where id = p_api_key_id
      and account_id = p_merchant_account_id
      and active = true
      and revoked_at is null
      and (expires_at is null or expires_at > now())
      and ('cards:charge' = any(coalesce(scopes, array[]::text[])));
    if not found then
      raise exception 'Acesso negado: chave de API inválida, expirada, revogada, sem escopo cards:charge ou não vinculada à conta merchant.';
    end if;
  else
    raise exception 'Acesso negado: privilégios insuficientes para executar process_card_payment.';
  end if;

  if p_idempotency_key is not null and trim(p_idempotency_key) <> '' then
    if p_request_hash is null or trim(p_request_hash) = '' then
      raise exception 'IDEMPOTENCY_REQUEST_HASH_REQUIRED: request hash é obrigatório quando Idempotency-Key é informada.';
    end if;

    insert into public.api_idempotency_keys(
      account_id,operation,idempotency_key,request_hash,status,api_key_id,created_at,updated_at
    ) values (
      p_merchant_account_id,'cards:charge',p_idempotency_key,p_request_hash,'in_progress',p_api_key_id,now(),now()
    )
    on conflict (account_id,operation,idempotency_key) do nothing
    returning id into v_idemp_id;

    if v_idemp_id is null then
      select * into v_existing_idemp
      from public.api_idempotency_keys
      where account_id = p_merchant_account_id
        and operation = 'cards:charge'
        and idempotency_key = p_idempotency_key;

      if found then
        if v_existing_idemp.request_hash <> p_request_hash then
          raise exception 'IDEMPOTENCY_KEY_REUSED: Esta Idempotency-Key já foi utilizada com parâmetros de requisição diferentes.';
        end if;
        if v_existing_idemp.status = 'completed' and v_existing_idemp.response_body is not null then
          return jsonb_set(v_existing_idemp.response_body,'{from_cache}','true'::jsonb);
        end if;
        if v_existing_idemp.status = 'in_progress' then
          raise exception 'IDEMPOTENCY_IN_PROGRESS: Uma transação com esta Idempotency-Key já está sendo processada concorrentemente.';
        end if;
        if v_existing_idemp.status = 'failed' then
          raise exception 'IDEMPOTENCY_FAILED: Transação anterior com esta Idempotency-Key falhou e não pode ser reutilizada.';
        end if;
      end if;
    end if;
  end if;

  if p_tipo = 'debito' then
    if v_installments <> 1 then
      raise exception 'Vendas na modalidade débito não aceitam parcelamento (installments deve ser 1).';
    end if;
    if lower(coalesce(p_plan,'standard')) in ('ontime','nitro') then
      v_effective_plan := 'ontime';
    else
      v_effective_plan := 'standard';
    end if;
  else
    v_effective_plan := lower(coalesce(p_plan,'standard'));
    if v_effective_plan not in ('standard','d1','d7','d15','due_date','ontime','nitro') then
      v_effective_plan := 'standard';
    end if;
  end if;

  v_fee_rate := public.calculate_card_mdr_rate(p_tipo,v_effective_plan,v_installments);
  v_fee_amount := round(v_gross_amount * (v_fee_rate / 100.0),2);
  v_net_amount := v_gross_amount - v_fee_amount;
  if v_net_amount <= 0 then
    raise exception 'Valor líquido inválido após aplicação da taxa.';
  end if;

  if p_card_number is not null and trim(p_card_number) <> '' then
    v_clean_card_number := regexp_replace(p_card_number,'[^0-9]','','g');
  end if;
  if v_clean_card_number is not null and length(v_clean_card_number) >= 4
     and not (v_clean_card_number like '5899%' or v_clean_card_number like '5898%') then
    raise exception 'ERRO 05: Cartão não permitido. O OptmaPay Sandbox aceita exclusivamente cartões fictícios (prefixos 5899 ou 5898).';
  end if;

  if p_card_id is not null then
    select * into v_card from public.cartoes where id = p_card_id for update;
    if not found then raise exception 'ERRO 14: Cartão fictício não encontrado no OptmaPay Sandbox.'; end if;
    if v_clean_card_number is not null and v_clean_card_number <> ''
       and coalesce(v_card.card_number,'') <> ''
       and v_card.card_number <> v_clean_card_number then
      raise exception 'ERRO 15: O número de cartão informado não corresponde ao cartão fornecido.';
    end if;
  else
    if v_clean_card_number is null or v_clean_card_number = '' then
      raise exception 'ERRO 16: É obrigatório informar o identificador do cartão ou o número completo.';
    end if;
    select * into v_card
    from public.cartoes
    where card_number = v_clean_card_number
    order by created_at desc
    limit 1
    for update;
    if not found then raise exception 'ERRO 14: Cartão fictício não encontrado no OptmaPay Sandbox.'; end if;
  end if;

  if v_card.status = 'blocked' then
    raise exception 'ERRO 62: Cartão bloqueado para compras. Desbloqueie na carteira antes de transacionar.';
  end if;
  if v_card.tipo <> p_tipo then
    raise exception 'ERRO 57: Tipo de cartão incompatível com a operação solicitada (Cartão é %, solicitado %).',v_card.tipo,p_tipo;
  end if;
  if p_cvv is null or trim(p_cvv) = '' or coalesce(trim(v_card.cvv),'') <> trim(p_cvv) then
    raise exception 'ERRO 55: Código CVV incorreto.';
  end if;
  if p_validade is null or trim(p_validade) = '' or coalesce(trim(v_card.validade),'') <> trim(p_validade) then
    raise exception 'ERRO 54: Data de validade do cartão incorreta.';
  end if;

  v_val_parts := regexp_split_to_array(trim(v_card.validade),'[/-]');
  if array_length(v_val_parts,1) <> 2 then raise exception 'ERRO 54: Formato de validade inválido. Use MM/AA ou MM/AAAA.'; end if;
  v_val_month := v_val_parts[1]::integer;
  v_val_year := v_val_parts[2]::integer;
  if v_val_month < 1 or v_val_month > 12 then raise exception 'ERRO 54: Mês de validade inválido.'; end if;
  if v_val_year < 100 then v_val_year := 2000 + v_val_year; end if;
  if v_val_year < v_cur_year or (v_val_year = v_cur_year and v_val_month < v_cur_month) then
    raise exception 'ERRO 54: Cartão expirado.';
  end if;

  select id,user_id,name,cpf_cnpj,balance,config into v_payer_account
  from public.accounts where id = v_card.account_id for update;
  if not found then raise exception 'Conta vinculada ao cartão pagador não encontrada.'; end if;

  if p_tipo = 'debito' then
    if (v_payer_account.balance + greatest(0,coalesce((v_payer_account.config->>'overdraft_limit')::numeric,0))) < v_gross_amount then
      raise exception 'ERRO 51: Saldo e limite insuficientes na conta para compra no débito (Saldo: R$ %, Limite: R$ %, Necessário: R$ %).',
        v_payer_account.balance,
        greatest(0,coalesce((v_payer_account.config->>'overdraft_limit')::numeric,0)),
        v_gross_amount;
    end if;
    update public.accounts
      set balance = balance - v_gross_amount, updated_at = now()
      where id = v_payer_account.id;
  else
    if (coalesce(v_card.current_balance,0) + v_gross_amount) > coalesce(v_card.credit_limit,5000) then
      raise exception 'ERRO 51: Limite de crédito excedido no cartão (Limite: R$ %, Utilizado: R$ %, Tentativa: R$ %).',v_card.credit_limit,v_card.current_balance,v_gross_amount;
    end if;
    update public.cartoes
      set current_balance = coalesce(current_balance,0) + v_gross_amount
      where id = v_card.id;
  end if;

  v_is_instant := v_effective_plan in ('ontime','nitro');
  if v_is_instant then
    update public.accounts
      set balance = balance + v_net_amount, updated_at = now()
      where id = v_merchant_account.id;
    v_in_tx_status := 'completed';
    v_expected_settlement_at := v_occurred_at;
  else
    v_in_tx_status := 'pending';
    if v_effective_plan in ('standard','d1') then
      v_expected_settlement_at := public.optmapay_settlement_at(public.optmapay_add_business_days((v_occurred_at at time zone 'America/Sao_Paulo')::date,1));
    elsif v_effective_plan = 'd7' then
      v_expected_settlement_at := public.optmapay_settlement_at(public.optmapay_add_business_days((v_occurred_at at time zone 'America/Sao_Paulo')::date,7));
    elsif v_effective_plan = 'd15' then
      v_expected_settlement_at := public.optmapay_settlement_at(public.optmapay_add_business_days((v_occurred_at at time zone 'America/Sao_Paulo')::date,15));
    elsif v_effective_plan = 'due_date' then
      v_expected_settlement_at := public.optmapay_settlement_at(public.optmapay_credit_due_date(v_occurred_at,coalesce(v_card.due_day,10),1));
    else
      v_expected_settlement_at := public.optmapay_add_business_days(v_occurred_at::date,1)::timestamptz;
    end if;
  end if;

  v_in_tx_desc := 'Recebimento Cartão ' || upper(p_tipo)
    || ' (Taxa ' || to_char(v_fee_rate,'FM990.00') || '%: -R$ ' || to_char(v_fee_amount,'FM999999990.00')
    || ' | Líquido: R$ ' || to_char(v_net_amount,'FM999999990.00') || ') - ' || v_effective_plan;

  v_nsu := lpad(floor(random()*90000000+10000000)::text,8,'0');
  v_auth_code := lpad(floor(random()*900000+100000)::text,6,'0');
  v_tid := 'TID-' || upper(substring(md5(random()::text) from 1 for 12));

  insert into public.transactions(
    account_id,user_id,counterparty_account_id,counterparty_name,counterparty_document,
    type,direction,amount,status,description,external_reference,real_money,environment,created_at
  ) values (
    v_payer_account.id,v_payer_account.user_id,v_merchant_account.id,v_merchant_account.name,v_merchant_account.cpf_cnpj,
    'card_payment','out',v_gross_amount,'completed',
    'Compra Cartão ' || upper(p_tipo)
      || case when v_installments > 1 then ' (' || v_installments || 'x de R$ ' || to_char(round(v_gross_amount/v_installments,2),'FM999999990.00') || ')' else '' end
      || ' em ' || coalesce(v_merchant_account.name,'Estabelecimento') || ' (NSU ' || v_nsu || ')',
    coalesce(p_external_reference,'CARD:' || v_card.id || '|INST:' || v_installments),
    false,'sandbox',v_occurred_at
  ) returning id into v_tx_out_id;

  insert into public.transactions(
    account_id,user_id,counterparty_account_id,counterparty_name,counterparty_document,
    type,direction,amount,status,description,external_reference,real_money,environment,created_at
  ) values (
    v_merchant_account.id,v_merchant_account.user_id,v_payer_account.id,coalesce(p_cardholder_name,'Cliente Cartão'),v_payer_account.cpf_cnpj,
    'card_payment','in',v_net_amount,v_in_tx_status,v_in_tx_desc || ' - NSU ' || v_nsu,
    p_external_reference,false,'sandbox',v_occurred_at
  ) returning id into v_tx_in_id;

  insert into public.card_receivables(
    merchant_account_id,payer_account_id,card_id,transaction_in_id,transaction_out_id,
    external_reference,payment_type,installments,settlement_plan,gross_amount,fee_percent,
    fee_amount,net_amount,status,expected_settlement_at,settled_at,created_at,updated_at
  ) values (
    v_merchant_account.id,v_payer_account.id,v_card.id,v_tx_in_id,v_tx_out_id,
    p_external_reference,p_tipo,v_installments,v_effective_plan,v_gross_amount,v_fee_rate,
    v_fee_amount,v_net_amount,
    case when v_is_instant then 'settled' else 'pending' end,
    v_expected_settlement_at,
    case when v_is_instant then v_occurred_at else null end,
    v_occurred_at,v_occurred_at
  ) returning id into v_receivable_id;

  if p_tipo = 'credito' then
    v_remaining := v_gross_amount;
    for v_i in 1..v_installments loop
      if v_i = v_installments then
        v_installment_amount := v_remaining;
      else
        v_installment_amount := round(v_gross_amount / v_installments,2);
        v_remaining := v_remaining - v_installment_amount;
      end if;

      v_due_date := public.optmapay_credit_due_date(v_occurred_at,coalesce(v_card.due_day,10),v_i);

      insert into public.credit_card_invoices(
        card_id,account_id,due_date,closing_date,status,total_amount,paid_amount,created_at,updated_at
      ) values (
        v_card.id,v_payer_account.id,v_due_date,v_due_date-7,'open',v_installment_amount,0,v_occurred_at,v_occurred_at
      )
      on conflict(card_id,due_date) do update
        set total_amount = public.credit_card_invoices.total_amount + excluded.total_amount,
            updated_at = now()
      returning id into v_invoice_id;

      insert into public.credit_card_invoice_items(
        invoice_id,card_id,source_transaction_id,external_reference,
        installment_number,total_installments,amount,paid_amount,status,created_at,updated_at
      ) values (
        v_invoice_id,v_card.id,v_tx_out_id,p_external_reference,
        v_i,v_installments,v_installment_amount,0,'open',v_occurred_at,v_occurred_at
      );
    end loop;
  end if;

  v_event_id := gen_random_uuid();
  v_event_payload := jsonb_build_object(
    'id',v_event_id,
    'event','card.paid',
    'createdAt',to_char(v_occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'realMoney',false,
    'environment','sandbox',
    'data',jsonb_build_object(
      'transactionId',v_tx_in_id,
      'orderId',p_external_reference,
      'externalReference',p_external_reference,
      'amountGross',v_gross_amount,
      'feePercent',v_fee_rate,
      'feeAmount',v_fee_amount,
      'amountNet',v_net_amount,
      'installments',v_installments,
      'tipo',p_tipo,
      'status','paid',
      'authorizationCode',v_auth_code,
      'nsu',v_nsu,
      'tid',v_tid,
      'cardMasked','•••• ' || right(coalesce(v_clean_card_number,v_card.card_number,v_card.masked_number),4),
      'cardBrand',coalesce(v_card.brand,'OptmaCard'),
      'cardholderName',coalesce(p_cardholder_name,'CLIENTE SANDBOX'),
      'merchantAccountId',v_merchant_account.id,
      'merchantName',v_merchant_account.name,
      'receivableId',v_receivable_id,
      'settlementPlan',v_effective_plan,
      'expectedSettlementAt',v_expected_settlement_at,
      'realMoney',false,
      'environment','sandbox',
      'paidAt',to_char(v_occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );

  insert into public.webhook_events(
    id,account_id,event_type,resource_type,resource_id,idempotency_key,payload,occurred_at,created_at
  ) values (
    v_event_id,v_merchant_account.id,'card.paid','transaction',v_tx_in_id::text,
    'card.paid:' || v_tx_in_id::text,v_event_payload,v_occurred_at,v_occurred_at
  );

  for v_cfg in
    select id from public.webhooks_config
    where account_id = p_merchant_account_id
      and active = true
      and ('card.paid'=any(events) or '*'=any(events))
  loop
    insert into public.webhook_delivery_jobs(event_id,webhook_config_id,status,attempt_count,next_attempt_at)
    values(v_event_id,v_cfg.id,'pending',0,now())
    on conflict(event_id,webhook_config_id) do nothing;
  end loop;

  v_response_json :=
    jsonb_build_object(
      'success',true,
      'status','approved',
      'message','Transação autorizada com sucesso no OptmaPay Sandbox!',
      'transaction_out_id',v_tx_out_id,'transactionOutId',v_tx_out_id,
      'transaction_in_id',v_tx_in_id,'transactionInId',v_tx_in_id,'transactionId',v_tx_in_id,
      'amount_gross',v_gross_amount,'gross_amount',v_gross_amount,'amountGross',v_gross_amount,'grossAmount',v_gross_amount,
      'fee_percent',v_fee_rate,'feePercent',v_fee_rate,
      'fee_amount',v_fee_amount,'feeAmount',v_fee_amount,
      'amount_net',v_net_amount,'net_amount',v_net_amount,'amountNet',v_net_amount,'netAmount',v_net_amount,
      'installments',v_installments,'tipo',p_tipo,
      'settlement_plan',v_effective_plan,'plan',v_effective_plan,'settlementPlan',v_effective_plan
    )
    ||
    jsonb_build_object(
      'receivable_id',v_receivable_id,'receivableId',v_receivable_id,
      'expected_settlement_at',v_expected_settlement_at,'expectedSettlementAt',v_expected_settlement_at,
      'card_id',v_card.id,'cardId',v_card.id,
      'card_masked','•••• ' || right(coalesce(v_clean_card_number,v_card.card_number,v_card.masked_number),4),
      'cardMasked','•••• ' || right(coalesce(v_clean_card_number,v_card.card_number,v_card.masked_number),4),
      'card_brand',coalesce(v_card.brand,'OptmaCard'),'cardBrand',coalesce(v_card.brand,'OptmaCard'),
      'cardholder_name',coalesce(p_cardholder_name,'CLIENTE SANDBOX'),'cardholderName',coalesce(p_cardholder_name,'CLIENTE SANDBOX'),
      'payer_account_id',v_payer_account.id,'payerAccountId',v_payer_account.id,
      'payer_name',v_payer_account.name,'payerName',v_payer_account.name
    )
    ||
    jsonb_build_object(
      'merchant_account_id',v_merchant_account.id,'merchantAccountId',v_merchant_account.id,
      'merchant_name',v_merchant_account.name,'merchantName',v_merchant_account.name,
      'authorization_code',v_auth_code,'authorizationCode',v_auth_code,
      'nsu',v_nsu,'tid',v_tid,
      'webhook_event_id',v_event_id,'webhookEventId',v_event_id,
      'order_id',p_external_reference,'orderId',p_external_reference,'external_reference',p_external_reference,
      'created_at',to_char(v_occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'real_money',false,'environment','sandbox'
    );

  if v_idemp_id is not null then
    update public.api_idempotency_keys
    set status='completed',response_status=200,response_body=v_response_json,
        resource_type='transaction',resource_id=v_tx_in_id::text,updated_at=now()
    where id=v_idemp_id;
  end if;

  return v_response_json;
end;
$function$;
