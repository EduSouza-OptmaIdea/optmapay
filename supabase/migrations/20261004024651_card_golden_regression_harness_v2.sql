
drop function if exists public.run_golden_card_engine_tests();

create or replace function public.run_golden_card_engine_tests()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_merchant public.accounts%rowtype;
  v_payer public.accounts%rowtype;
  v_key public.api_keys%rowtype;
  v_debit_card public.cartoes%rowtype;
  v_credit_card public.cartoes%rowtype;
  v_charge jsonb;
  v_replay jsonb;
  v_release jsonb;
  v_payment jsonb;
  v_tx_in uuid;
  v_rec uuid;
  v_orig_payer numeric;
  v_orig_merchant numeric;
  v_orig_credit_used numeric;
  v_balance numeric;
  v_net numeric;
  v_early_blocked boolean;
  v_detail text;
  v_debit_result jsonb := '{}'::jsonb;
  v_credit_result jsonb := '{}'::jsonb;
  v_nonce text;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(auth.role(),''),current_user);
  if v_role not in ('service_role','postgres','supabase_admin') then
    raise exception 'Acesso negado: golden tests são restritos ao backend.';
  end if;

  select * into v_merchant
  from public.accounts
  where name='Merchant Smoke 737081'
  limit 1;

  select * into v_payer
  from public.accounts
  where name='Customer Smoke 737081'
  limit 1;

  select * into v_key
  from public.api_keys
  where account_id=v_merchant.id
    and active=true
    and revoked_at is null
    and (expires_at is null or expires_at>now())
    and 'cards:charge'=any(coalesce(scopes,array[]::text[]))
  order by created_at desc
  limit 1;

  select * into v_debit_card
  from public.cartoes
  where account_id=v_payer.id and tipo='debito' and status='active'
  order by created_at desc
  limit 1;

  select * into v_credit_card
  from public.cartoes
  where account_id=v_payer.id and tipo='credito' and status='active'
  order by created_at desc
  limit 1;

  if v_merchant.id is null or v_payer.id is null or v_key.id is null
     or v_debit_card.id is null or v_credit_card.id is null then
    raise exception 'Golden fixtures smoke não encontrados.';
  end if;

  begin
    v_nonce := replace(gen_random_uuid()::text,'-','');
    select balance into v_orig_payer from public.accounts where id=v_payer.id;
    select balance into v_orig_merchant from public.accounts where id=v_merchant.id;

    v_charge := public.process_card_payment(
      v_merchant.id,v_debit_card.id,v_debit_card.card_number,v_debit_card.cardholder_name,
      v_debit_card.validade,v_debit_card.cvv,10,'debito',1,'standard',
      'Golden Debit Regression','golden-debit-'||v_nonce,
      v_key.id,'idem-debit-'||v_nonce,'hash-debit-'||v_nonce
    );

    select balance into v_balance from public.accounts where id=v_payer.id;
    if v_balance<>v_orig_payer-10 then raise exception 'Golden Debit: saldo do pagador incorreto'; end if;

    select balance into v_balance from public.accounts where id=v_merchant.id;
    if v_balance<>v_orig_merchant then raise exception 'Golden Debit: merchant creditado antes do D+1'; end if;

    v_tx_in := (v_charge->>'transaction_in_id')::uuid;
    v_rec := (v_charge->>'receivable_id')::uuid;

    if not exists(
      select 1 from public.card_receivables
      where id=v_rec and status='pending' and gross_amount=10 and fee_amount=0.09 and net_amount=9.91
    ) then
      raise exception 'Golden Debit: recebível autoritativo divergente';
    end if;

    v_replay := public.process_card_payment(
      v_merchant.id,v_debit_card.id,v_debit_card.card_number,v_debit_card.cardholder_name,
      v_debit_card.validade,v_debit_card.cvv,10,'debito',1,'standard',
      'Golden Debit Regression','golden-debit-'||v_nonce,
      v_key.id,'idem-debit-'||v_nonce,'hash-debit-'||v_nonce
    );

    if coalesce((v_replay->>'from_cache')::boolean,false) is not true then
      raise exception 'Golden Debit: replay da cobrança não foi idempotente';
    end if;

    v_early_blocked := false;
    begin
      perform public.release_d1_settlement(v_tx_in,v_merchant.id);
    exception when others then
      if position('SETTLEMENT_NOT_DUE' in sqlerrm)>0 then
        v_early_blocked := true;
      else
        raise;
      end if;
    end;

    if not v_early_blocked then raise exception 'Golden Debit: liquidação antecipada foi permitida'; end if;

    update public.card_receivables set expected_settlement_at=now()-interval '1 second' where id=v_rec;
    v_release := public.release_d1_settlement(v_tx_in,v_merchant.id);

    select balance into v_balance from public.accounts where id=v_merchant.id;
    if v_balance<>v_orig_merchant+9.91 then raise exception 'Golden Debit: crédito de liquidação incorreto'; end if;

    v_release := public.release_d1_settlement(v_tx_in,v_merchant.id);
    if coalesce((v_release->>'duplicate')::boolean,false) is not true then
      raise exception 'Golden Debit: replay de liquidação não foi idempotente';
    end if;

    raise exception using
      message='__GOLDEN_DEBIT_ROLLBACK__',
      detail=jsonb_build_object(
        'ok',true,
        'payerDebitedOnce',true,
        'merchantNotCreditedBeforeDue',true,
        'gross',10,
        'fee',0.09,
        'net',9.91,
        'chargeRetryIdempotent',true,
        'earlySettlementBlocked',true,
        'settlementRetryIdempotent',true
      )::text;
  exception when others then
    if sqlerrm='__GOLDEN_DEBIT_ROLLBACK__' then
      get stacked diagnostics v_detail = PG_EXCEPTION_DETAIL;
      v_debit_result := v_detail::jsonb;
    else
      raise;
    end if;
  end;

  begin
    v_nonce := replace(gen_random_uuid()::text,'-','');
    select balance into v_orig_payer from public.accounts where id=v_payer.id;
    select balance into v_orig_merchant from public.accounts where id=v_merchant.id;
    select current_balance into v_orig_credit_used from public.cartoes where id=v_credit_card.id;

    v_charge := public.process_card_payment(
      v_merchant.id,v_credit_card.id,v_credit_card.card_number,v_credit_card.cardholder_name,
      v_credit_card.validade,v_credit_card.cvv,12,'credito',1,'standard',
      'Golden Credit Regression','golden-credit-'||v_nonce,
      v_key.id,'idem-credit-'||v_nonce,'hash-credit-'||v_nonce
    );

    select balance into v_balance from public.accounts where id=v_payer.id;
    if v_balance<>v_orig_payer then raise exception 'Golden Credit: conta corrente debitada na compra'; end if;

    select current_balance into v_balance from public.cartoes where id=v_credit_card.id;
    if v_balance<>v_orig_credit_used+12 then raise exception 'Golden Credit: limite utilizado divergente'; end if;

    if not exists(
      select 1 from public.credit_card_invoice_items
      where card_id=v_credit_card.id
        and source_transaction_id=(v_charge->>'transaction_out_id')::uuid
        and amount=12 and paid_amount=0 and status='open'
    ) then
      raise exception 'Golden Credit: item autoritativo de fatura ausente';
    end if;

    v_replay := public.process_card_payment(
      v_merchant.id,v_credit_card.id,v_credit_card.card_number,v_credit_card.cardholder_name,
      v_credit_card.validade,v_credit_card.cvv,12,'credito',1,'standard',
      'Golden Credit Regression','golden-credit-'||v_nonce,
      v_key.id,'idem-credit-'||v_nonce,'hash-credit-'||v_nonce
    );

    if coalesce((v_replay->>'from_cache')::boolean,false) is not true then
      raise exception 'Golden Credit: replay da cobrança não foi idempotente';
    end if;

    select current_balance into v_balance from public.cartoes where id=v_credit_card.id;
    if v_balance<>v_orig_credit_used+12 then raise exception 'Golden Credit: replay consumiu limite duas vezes'; end if;

    v_payment := public.pay_credit_card_invoice(v_credit_card.id,12);

    select balance into v_balance from public.accounts where id=v_payer.id;
    if v_balance<>v_orig_payer-12 then raise exception 'Golden Credit: pagamento da fatura não debitou conta exatamente uma vez'; end if;

    select current_balance into v_balance from public.cartoes where id=v_credit_card.id;
    if v_balance<>v_orig_credit_used then raise exception 'Golden Credit: limite não restaurado após pagamento'; end if;

    v_tx_in := (v_charge->>'transaction_in_id')::uuid;
    v_rec := (v_charge->>'receivable_id')::uuid;
    v_net := (v_charge->>'amount_net')::numeric;

    update public.card_receivables set expected_settlement_at=now()-interval '1 second' where id=v_rec;
    v_release := public.release_d1_settlement(v_tx_in,v_merchant.id);

    select balance into v_balance from public.accounts where id=v_merchant.id;
    if v_balance<>v_orig_merchant+v_net then raise exception 'Golden Credit: liquidação do merchant divergente'; end if;

    select balance into v_balance from public.accounts where id=v_payer.id;
    if v_balance<>v_orig_payer-12 then raise exception 'Golden Credit: liquidação do merchant alterou conta do pagador'; end if;

    raise exception using
      message='__GOLDEN_CREDIT_ROLLBACK__',
      detail=jsonb_build_object(
        'ok',true,
        'checkingNotDebitedAtPurchase',true,
        'limitConsumedOnce',true,
        'authoritativeInvoiceCreated',true,
        'chargeRetryIdempotent',true,
        'invoicePaymentDebitsChecking',true,
        'invoicePaymentRestoresLimit',true,
        'merchantSettlementIndependent',true
      )::text;
  exception when others then
    if sqlerrm='__GOLDEN_CREDIT_ROLLBACK__' then
      get stacked diagnostics v_detail = PG_EXCEPTION_DETAIL;
      v_credit_result := v_detail::jsonb;
    else
      raise;
    end if;
  end;

  return jsonb_build_object(
    'debit',v_debit_result,
    'credit',v_credit_result,
    'rolledBack',true,
    'environment','sandbox',
    'realMoney',false
  );
end;
$$;

revoke all on function public.run_golden_card_engine_tests() from public, anon, authenticated;
grant execute on function public.run_golden_card_engine_tests() to service_role;
