
create or replace function public.run_golden_card_engine_tests()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_result jsonb := '{}'::jsonb;
  v_merchant uuid := gen_random_uuid();
  v_payer uuid := gen_random_uuid();
  v_key uuid := gen_random_uuid();
  v_debit_card uuid := gen_random_uuid();
  v_credit_card uuid := gen_random_uuid();
  v_debit_pan text := '5898' || lpad((floor(random()*1000000000000))::bigint::text, 12, '0');
  v_credit_pan text := '5899' || lpad((floor(random()*1000000000000))::bigint::text, 12, '0');
  v_debit jsonb;
  v_debit_replay jsonb;
  v_credit jsonb;
  v_credit_replay jsonb;
  v_invoice_payment jsonb;
  v_settle jsonb;
  v_tx_in uuid;
  v_rec uuid;
  v_balance numeric;
  v_net numeric;
  v_early_blocked boolean := false;
  v_count integer;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(auth.role(),''),current_user);
  if v_role not in ('service_role','postgres','supabase_admin') then
    raise exception 'Acesso negado: golden tests são restritos ao backend.';
  end if;

  begin
    insert into public.accounts(id,name,type,cpf_cnpj,balance,pix_key,account_number)
    values
      (v_merchant,'Golden Test Merchant','merchant','GT-M-'||substr(v_merchant::text,1,8),0,'gtm-'||v_merchant::text,'gtm-'||substr(v_merchant::text,1,12)),
      (v_payer,'Golden Test Payer','customer','GT-P-'||substr(v_payer::text,1,8),1000,'gtp-'||v_payer::text,'gtp-'||substr(v_payer::text,1,12));

    insert into public.api_keys(id,key_name,active,account_id,key_id,key_hash,key_prefix,key_last4,scopes)
    values(
      v_key,'Golden Test Key',true,v_merchant,
      'golden_'||replace(v_key::text,'-',''),
      md5(v_key::text)||md5(v_merchant::text),
      'sk_test_golden','9999',array['cards:charge']
    );

    insert into public.cartoes(
      id,account_id,tipo,cardholder_name,masked_number,validade,cvv,
      credit_limit,current_balance,status,card_number,brand,pin,is_virtual,due_day,auto_debit
    ) values
      (v_debit_card,v_payer,'debito','GOLDEN TEST', '5898 **** **** '||right(v_debit_pan,4),'12/32','123',0,0,'active',v_debit_pan,'OptmaCard','1234',true,10,false),
      (v_credit_card,v_payer,'credito','GOLDEN TEST','5899 **** **** '||right(v_credit_pan,4),'12/32','123',1000,0,'active',v_credit_pan,'OptmaCard','1234',true,10,false);

    v_debit := public.process_card_payment(
      v_merchant,v_debit_card,v_debit_pan,'GOLDEN TEST','12/32','123',
      100,'debito',1,'standard','Golden Debit','golden-debit-'||v_debit_card::text,
      v_key,'idem-debit-'||v_debit_card::text,'hash-debit-'||v_debit_card::text
    );

    select balance into v_balance from public.accounts where id=v_payer;
    if v_balance <> 900 then
      raise exception 'GOLDEN_DEBIT_FAIL: expected payer balance 900, got %',v_balance;
    end if;

    select balance into v_balance from public.accounts where id=v_merchant;
    if v_balance <> 0 then
      raise exception 'GOLDEN_DEBIT_FAIL: merchant credited before D+1';
    end if;

    v_tx_in := (v_debit->>'transaction_in_id')::uuid;
    v_rec := (v_debit->>'receivable_id')::uuid;

    if not exists(
      select 1 from public.card_receivables
      where id=v_rec and status='pending' and gross_amount=100 and fee_amount=0.85 and net_amount=99.15
    ) then
      raise exception 'GOLDEN_DEBIT_FAIL: authoritative receivable mismatch';
    end if;

    v_debit_replay := public.process_card_payment(
      v_merchant,v_debit_card,v_debit_pan,'GOLDEN TEST','12/32','123',
      100,'debito',1,'standard','Golden Debit','golden-debit-'||v_debit_card::text,
      v_key,'idem-debit-'||v_debit_card::text,'hash-debit-'||v_debit_card::text
    );

    if coalesce((v_debit_replay->>'from_cache')::boolean,false) is not true then
      raise exception 'GOLDEN_DEBIT_FAIL: charge replay not idempotent';
    end if;

    select balance into v_balance from public.accounts where id=v_payer;
    if v_balance <> 900 then
      raise exception 'GOLDEN_DEBIT_FAIL: payer debited twice';
    end if;

    begin
      perform public.release_d1_settlement(v_tx_in,v_merchant);
    exception when others then
      if position('SETTLEMENT_NOT_DUE' in sqlerrm)>0 then
        v_early_blocked := true;
      else
        raise;
      end if;
    end;

    if not v_early_blocked then
      raise exception 'GOLDEN_DEBIT_FAIL: early settlement was not blocked';
    end if;

    update public.card_receivables set expected_settlement_at=now()-interval '1 second' where id=v_rec;
    v_settle := public.release_d1_settlement(v_tx_in,v_merchant);

    select balance into v_balance from public.accounts where id=v_merchant;
    if v_balance <> 99.15 then
      raise exception 'GOLDEN_DEBIT_FAIL: merchant expected 99.15, got %',v_balance;
    end if;

    v_settle := public.release_d1_settlement(v_tx_in,v_merchant);
    if coalesce((v_settle->>'duplicate')::boolean,false) is not true then
      raise exception 'GOLDEN_DEBIT_FAIL: settlement replay not idempotent';
    end if;

    v_result := jsonb_set(v_result,'{debit}',jsonb_build_object(
      'ok',true,
      'payerDebitedOnce',true,
      'merchantNotCreditedBeforeDue',true,
      'gross',100,
      'fee',0.85,
      'net',99.15,
      'earlySettlementBlocked',true,
      'chargeRetryIdempotent',true,
      'settlementRetryIdempotent',true
    ));

    update public.accounts set balance=0 where id=v_merchant;

    v_credit := public.process_card_payment(
      v_merchant,v_credit_card,v_credit_pan,'GOLDEN TEST','12/32','123',
      120,'credito',1,'standard','Golden Credit','golden-credit-'||v_credit_card::text,
      v_key,'idem-credit-'||v_credit_card::text,'hash-credit-'||v_credit_card::text
    );

    select balance into v_balance from public.accounts where id=v_payer;
    if v_balance <> 900 then
      raise exception 'GOLDEN_CREDIT_FAIL: checking balance changed at purchase';
    end if;

    select current_balance into v_balance from public.cartoes where id=v_credit_card;
    if v_balance <> 120 then
      raise exception 'GOLDEN_CREDIT_FAIL: expected used limit 120, got %',v_balance;
    end if;

    select balance into v_balance from public.accounts where id=v_merchant;
    if v_balance <> 0 then
      raise exception 'GOLDEN_CREDIT_FAIL: merchant credited before settlement';
    end if;

    select count(*) into v_count
    from public.credit_card_invoice_items
    where card_id=v_credit_card and amount=120 and paid_amount=0 and status='open';
    if v_count <> 1 then
      raise exception 'GOLDEN_CREDIT_FAIL: invoice item missing';
    end if;

    v_credit_replay := public.process_card_payment(
      v_merchant,v_credit_card,v_credit_pan,'GOLDEN TEST','12/32','123',
      120,'credito',1,'standard','Golden Credit','golden-credit-'||v_credit_card::text,
      v_key,'idem-credit-'||v_credit_card::text,'hash-credit-'||v_credit_card::text
    );

    if coalesce((v_credit_replay->>'from_cache')::boolean,false) is not true then
      raise exception 'GOLDEN_CREDIT_FAIL: charge replay not idempotent';
    end if;

    select current_balance into v_balance from public.cartoes where id=v_credit_card;
    if v_balance <> 120 then
      raise exception 'GOLDEN_CREDIT_FAIL: replay consumed limit twice';
    end if;

    v_invoice_payment := public.pay_credit_card_invoice(v_credit_card,120);

    select balance into v_balance from public.accounts where id=v_payer;
    if v_balance <> 780 then
      raise exception 'GOLDEN_CREDIT_FAIL: invoice payment expected checking balance 780, got %',v_balance;
    end if;

    select current_balance into v_balance from public.cartoes where id=v_credit_card;
    if v_balance <> 0 then
      raise exception 'GOLDEN_CREDIT_FAIL: limit not restored after invoice payment';
    end if;

    if exists(select 1 from public.credit_card_invoice_items where card_id=v_credit_card and status<>'paid') then
      raise exception 'GOLDEN_CREDIT_FAIL: invoice item not paid';
    end if;

    if exists(select 1 from public.credit_card_invoices where card_id=v_credit_card and status<>'paid') then
      raise exception 'GOLDEN_CREDIT_FAIL: invoice not paid';
    end if;

    v_tx_in := (v_credit->>'transaction_in_id')::uuid;
    v_rec := (v_credit->>'receivable_id')::uuid;
    v_net := (v_credit->>'amount_net')::numeric;

    update public.card_receivables set expected_settlement_at=now()-interval '1 second' where id=v_rec;
    v_settle := public.release_d1_settlement(v_tx_in,v_merchant);

    select balance into v_balance from public.accounts where id=v_merchant;
    if v_balance <> v_net then
      raise exception 'GOLDEN_CREDIT_FAIL: merchant settlement mismatch';
    end if;

    select balance into v_balance from public.accounts where id=v_payer;
    if v_balance <> 780 then
      raise exception 'GOLDEN_CREDIT_FAIL: merchant settlement touched payer checking balance';
    end if;

    v_result := jsonb_set(v_result,'{credit}',jsonb_build_object(
      'ok',true,
      'checkingNotDebitedAtPurchase',true,
      'limitConsumedOnce',true,
      'authoritativeInvoiceCreated',true,
      'chargeRetryIdempotent',true,
      'invoicePaymentDebitsChecking',true,
      'invoicePaymentRestoresLimit',true,
      'merchantSettlementIndependent',true
    ));

    v_result := v_result || jsonb_build_object('rolledBack',true,'environment','sandbox','realMoney',false);
    raise exception using message='__GOLDEN_ROLLBACK__', detail=v_result::text;
  exception when others then
    if sqlerrm='__GOLDEN_ROLLBACK__' then
      v_result := coalesce(nullif(pg_exception_detail,''),'{}')::jsonb;
    else
      raise;
    end if;
  end;

  return v_result;
end;
$$;

revoke all on function public.run_golden_card_engine_tests() from public, anon, authenticated;
grant execute on function public.run_golden_card_engine_tests() to service_role;
