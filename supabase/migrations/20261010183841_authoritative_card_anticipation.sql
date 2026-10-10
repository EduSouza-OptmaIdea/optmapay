
alter table public.card_receivables
  add column if not exists anticipation_fee_amount numeric(14,2) not null default 0,
  add column if not exists anticipated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.card_receivables'::regclass
      and conname='card_receivables_anticipation_fee_amount_check'
  ) then
    alter table public.card_receivables
      add constraint card_receivables_anticipation_fee_amount_check
      check (anticipation_fee_amount >= 0);
  end if;
end;
$$;

create or replace function public.anticipate_card_receivable(
  p_transaction_id uuid,
  p_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_tx public.transactions%rowtype;
  v_rec public.card_receivables%rowtype;
  v_acc public.accounts%rowtype;
  v_role text;
  v_days integer;
  v_anticipation_fee numeric(14,2);
  v_final_net numeric(14,2);
  v_ontime_fee numeric(14,2);
  v_event_id uuid;
  v_payload jsonb;
  v_cfg record;
begin
  select * into v_tx
  from public.transactions
  where id=p_transaction_id and account_id=p_account_id
  for update;

  if not found then
    raise exception 'Transação não encontrada ou não pertence a esta conta.';
  end if;
  if v_tx.type <> 'card_payment' or v_tx.direction <> 'in' then
    raise exception 'Apenas recebimentos de vendas com cartão podem ser antecipados.';
  end if;

  select * into v_rec
  from public.card_receivables
  where transaction_in_id=v_tx.id
  for update;

  if not found then
    raise exception 'Recebível autoritativo não encontrado para esta transação.';
  end if;

  select * into v_acc
  from public.accounts
  where id=p_account_id
  for update;

  if not found then
    raise exception 'Conta merchant não encontrada.';
  end if;

  v_role := coalesce(
    nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(auth.role(),''),
    current_user
  );

  if v_role='authenticated' then
    if auth.uid() is null or v_acc.user_id is null or auth.uid()<>v_acc.user_id then
      raise exception 'Acesso negado para antecipar recebível desta conta.';
    end if;
  elsif v_role not in ('service_role','postgres','supabase_admin') then
    raise exception 'Acesso negado para antecipar recebível.';
  end if;

  if v_rec.status='settled' then
    return jsonb_build_object(
      'success',true,
      'duplicate',true,
      'message','Recebível já havia sido liquidado.',
      'amount_credited',v_rec.net_amount,
      'anticipation_fee_amount',v_rec.anticipation_fee_amount,
      'transaction_id',v_tx.id,
      'receivable_id',v_rec.id,
      'settled_at',v_rec.settled_at
    );
  end if;

  if v_rec.status <> 'pending' then
    raise exception 'Recebível não está pendente (status: %).',v_rec.status;
  end if;

  if v_rec.expected_settlement_at is not null and now() >= v_rec.expected_settlement_at then
    raise exception 'SETTLEMENT_ALREADY_DUE: recebível já está disponível para liquidação normal.';
  end if;

  if v_rec.payment_type='debito' then
    v_ontime_fee := round(
      v_rec.gross_amount * public.calculate_card_mdr_rate('debito','ontime',1) / 100,
      2
    );
    v_anticipation_fee := greatest(0,round(v_ontime_fee-v_rec.fee_amount,2));
  else
    v_days := greatest(
      1,
      least(
        365,
        ceil(extract(epoch from (coalesce(v_rec.expected_settlement_at,now()+interval '1 day')-now()))/86400.0)::integer
      )
    );
    v_anticipation_fee := round(
      v_rec.net_amount * (((5.99::numeric/30::numeric) * v_days::numeric)/100::numeric),
      2
    );
  end if;

  v_final_net := round(v_rec.net_amount-v_anticipation_fee,2);
  if v_final_net <= 0 then
    raise exception 'Antecipação resultaria em valor líquido inválido.';
  end if;

  update public.accounts
  set balance=balance+v_final_net,
      updated_at=now()
  where id=p_account_id;

  update public.transactions
  set status='completed',
      amount=v_final_net,
      description=
        regexp_replace(coalesce(description,'Recebimento de Cartão'), '\s*\|\s*Liquidado\s*$', '', 'i')
        || format(' (Antecipado - Custo R$ %s | Líquido R$ %s) | Liquidado',
          to_char(v_anticipation_fee,'FM999999990.00'),
          to_char(v_final_net,'FM999999990.00'))
  where id=v_tx.id;

  v_event_id := gen_random_uuid();
  v_payload := jsonb_build_object(
    'id',v_event_id,
    'event','receivable.settled',
    'createdAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'realMoney',false,
    'environment','sandbox',
    'data',jsonb_build_object(
      'transactionId',v_tx.id,
      'receivableId',v_rec.id,
      'externalReference',v_rec.external_reference,
      'amountGross',v_rec.gross_amount,
      'feeAmount',v_rec.fee_amount,
      'anticipationFeeAmount',v_anticipation_fee,
      'amountNet',v_final_net,
      'settlementPlan',v_rec.settlement_plan,
      'anticipated',true,
      'originalExpectedSettlementAt',v_rec.expected_settlement_at,
      'settledAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'realMoney',false,
      'environment','sandbox'
    )
  );

  insert into public.webhook_events(
    id,account_id,event_type,resource_type,resource_id,idempotency_key,payload,occurred_at,created_at
  ) values (
    v_event_id,p_account_id,'receivable.settled','receivable',v_rec.id::text,
    'receivable.settled:'||v_rec.id::text,v_payload,now(),now()
  );

  for v_cfg in
    select id
    from public.webhooks_config
    where account_id=p_account_id
      and active=true
      and ('receivable.settled'=any(events) or 'payment.settled'=any(events) or '*'=any(events))
  loop
    insert into public.webhook_delivery_jobs(
      event_id,webhook_config_id,status,attempt_count,next_attempt_at
    )
    values(v_event_id,v_cfg.id,'pending',0,now())
    on conflict(event_id,webhook_config_id) do nothing;
  end loop;

  update public.card_receivables
  set status='settled',
      anticipation_fee_amount=v_anticipation_fee,
      net_amount=v_final_net,
      anticipated_at=now(),
      settled_at=now(),
      settlement_event_id=v_event_id,
      updated_at=now()
  where id=v_rec.id;

  return jsonb_build_object(
    'success',true,
    'duplicate',false,
    'message','Recebível antecipado com sucesso.',
    'amount_gross',v_rec.gross_amount,
    'base_fee_amount',v_rec.fee_amount,
    'anticipation_fee_amount',v_anticipation_fee,
    'amount_credited',v_final_net,
    'transaction_id',v_tx.id,
    'receivable_id',v_rec.id,
    'settlement_event_id',v_event_id,
    'settled_at',now()
  );
end;
$function$;

revoke all on function public.anticipate_card_receivable(uuid,uuid) from public;
revoke all on function public.anticipate_card_receivable(uuid,uuid) from anon;
grant execute on function public.anticipate_card_receivable(uuid,uuid) to authenticated;
grant execute on function public.anticipate_card_receivable(uuid,uuid) to service_role;
