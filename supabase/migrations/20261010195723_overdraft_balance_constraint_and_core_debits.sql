
alter table public.accounts drop constraint if exists accounts_balance_check;
alter table public.accounts
  add constraint accounts_balance_check
  check (
    balance >= -greatest(
      0,
      case
        when coalesce(config->>'overdraft_limit','') ~ '^[0-9]+([.][0-9]+)?$'
          then (config->>'overdraft_limit')::numeric
        else 0
      end
    )
  );

CREATE OR REPLACE FUNCTION public.pay_credit_card_invoice(p_card_id uuid, p_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_card record;
  v_acc record;
  v_role text;
  v_outstanding numeric(15,2);
  v_pay_amount numeric(15,2);
  v_remaining numeric(15,2);
  v_alloc numeric(15,2);
  v_item record;
  v_tx_id uuid;
  v_payment_id uuid;
  v_ref text;
begin
  select * into v_card from public.cartoes where id=p_card_id for update;
  if not found then raise exception 'Cartão de crédito não encontrado.'; end if;
  if v_card.tipo <> 'credito' then raise exception 'Apenas cartões de crédito possuem fatura para pagamento.'; end if;

  select * into v_acc from public.accounts where id=v_card.account_id for update;
  if not found then raise exception 'Conta vinculada ao cartão não encontrada.'; end if;

  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(auth.role(),''),current_user);
  if v_role='authenticated' then
    if auth.uid() is null or v_acc.user_id is null or auth.uid()<>v_acc.user_id then
      raise exception 'Acesso negado para pagar fatura deste cartão.';
    end if;
  elsif v_role not in ('service_role','postgres','supabase_admin') then
    raise exception 'Acesso negado para pagar fatura.';
  end if;

  select coalesce(sum(i.amount-i.paid_amount),0)::numeric(15,2) into v_outstanding
  from public.credit_card_invoice_items i
  where i.card_id=p_card_id and i.status='open';

  if v_outstanding <= 0 then
    v_outstanding := round(coalesce(v_card.current_balance,0),2);
  end if;
  if v_outstanding <= 0 then
    raise exception 'Este cartão não possui fatura em aberto (Saldo devedor: R$ 0,00).';
  end if;

  v_pay_amount := round(coalesce(p_amount,v_outstanding),2);
  if v_pay_amount <= 0 then raise exception 'O valor do pagamento deve ser maior que zero.'; end if;
  if v_pay_amount > v_outstanding then v_pay_amount := v_outstanding; end if;
  if (v_acc.balance + greatest(0,coalesce((v_acc.config->>'overdraft_limit')::numeric,0))) < v_pay_amount then
    raise exception 'Saldo e limite insuficientes para quitar a fatura (Saldo: R$ %, Limite: R$ %, Fatura: R$ %).',
      v_acc.balance,greatest(0,coalesce((v_acc.config->>'overdraft_limit')::numeric,0)),v_pay_amount;
  end if;

  update public.accounts set balance=balance-v_pay_amount,updated_at=now() where id=v_acc.id;
  update public.cartoes
    set current_balance=greatest(0,coalesce(current_balance,0)-v_pay_amount)
    where id=v_card.id;

  v_ref := 'FAT-' || to_char(now(),'YYYYMMDDHH24MISS') || '-' || substring(gen_random_uuid()::text from 1 for 8);
  insert into public.transactions(
    user_id,account_id,type,direction,amount,description,external_reference,status,real_money,environment
  ) values (
    v_acc.user_id,v_acc.id,'card_payment','out',v_pay_amount,
    'Pagamento de Fatura de Cartão de Crédito ('||v_card.masked_number||')',
    v_ref,'completed',false,'sandbox'
  ) returning id into v_tx_id;

  insert into public.credit_card_invoice_payments(card_id,account_id,transaction_id,amount)
  values(v_card.id,v_acc.id,v_tx_id,v_pay_amount)
  returning id into v_payment_id;

  v_remaining := v_pay_amount;
  for v_item in
    select i.*
    from public.credit_card_invoice_items i
    join public.credit_card_invoices f on f.id=i.invoice_id
    where i.card_id=p_card_id and i.status='open'
    order by f.due_date,i.installment_number,i.created_at
    for update of i
  loop
    exit when v_remaining <= 0;
    v_alloc := least(v_remaining,v_item.amount-v_item.paid_amount);
    if v_alloc > 0 then
      insert into public.credit_card_invoice_payment_allocations(payment_id,invoice_item_id,amount)
      values(v_payment_id,v_item.id,v_alloc);

      update public.credit_card_invoice_items
      set paid_amount=paid_amount+v_alloc,
          status=case when paid_amount+v_alloc>=amount then 'paid' else 'open' end,
          updated_at=now()
      where id=v_item.id;

      v_remaining := v_remaining-v_alloc;
    end if;
  end loop;

  update public.credit_card_invoices f
  set paid_amount=coalesce(x.paid_amount,0),
      status=case
        when coalesce(x.paid_amount,0)>=f.total_amount then 'paid'
        when f.due_date<current_date and coalesce(x.paid_amount,0)<f.total_amount then 'overdue'
        else 'open'
      end,
      updated_at=now()
  from (
    select i.invoice_id,sum(i.paid_amount)::numeric(15,2) as paid_amount
    from public.credit_card_invoice_items i
    where i.card_id=p_card_id
    group by i.invoice_id
  ) x
  where f.id=x.invoice_id;

  return jsonb_build_object(
    'success',true,
    'message','Pagamento de fatura processado com sucesso.',
    'amount_paid',v_pay_amount,
    'remaining_invoice_balance',greatest(0,v_outstanding-v_pay_amount),
    'available_credit_limit',coalesce(v_card.credit_limit,0)-greatest(0,coalesce(v_card.current_balance,0)-v_pay_amount),
    'transaction_id',v_tx_id,
    'payment_id',v_payment_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.refund_pix(p_original_transaction_id uuid, p_refund_amount numeric, p_reason text DEFAULT 'Devolução Pix solicitada pelo recebedor'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_orig_tx RECORD;
  v_sender_account RECORD;
  v_receiver_account RECORD;
  v_refund_out_id UUID;
  v_refund_in_id UUID;
  v_ref TEXT;
  v_already_refunded DECIMAL(15, 2);
  v_remaining_refundable DECIMAL(15, 2);
  v_event_id UUID;
  v_event_payload JSONB;
  v_occurred_at TIMESTAMPTZ := now();
BEGIN
  IF p_refund_amount <= 0 THEN
    RAISE EXCEPTION 'O valor do reembolso deve ser maior que zero.';
  END IF;

  SELECT * INTO v_orig_tx
  FROM public.transactions
  WHERE id = p_original_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transação original não encontrada.';
  END IF;

  IF v_orig_tx.type <> 'pix' OR v_orig_tx.direction <> 'in' THEN
    RAISE EXCEPTION 'A devolução só pode ser realizada a partir de um Pix recebido.';
  END IF;

  v_already_refunded := COALESCE(v_orig_tx.refunded_amount, 0.00);
  v_remaining_refundable := v_orig_tx.amount - v_already_refunded;

  IF v_remaining_refundable <= 0 THEN
    RAISE EXCEPTION 'Este Pix já foi totalmente devolvido (Total recebido: R$ %, Total já estornado: R$ %).', v_orig_tx.amount, v_already_refunded;
  END IF;

  IF p_refund_amount > v_remaining_refundable THEN
    RAISE EXCEPTION 'O valor solicitado (R$ %) é maior que o saldo restante disponível para devolução (R$ %).', p_refund_amount, v_remaining_refundable;
  END IF;

  -- Conta que recebeu originalmente e agora devolve (sender do refund)
  SELECT * INTO v_sender_account
  FROM public.accounts
  WHERE id = v_orig_tx.account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta recebedora original não encontrada.';
  END IF;

  IF auth.uid() IS NOT NULL AND v_sender_account.user_id IS NOT NULL AND auth.uid() <> v_sender_account.user_id THEN
    RAISE EXCEPTION 'Você não tem permissão para estornar fundos desta conta.';
  END IF;

  IF (v_sender_account.balance + greatest(0,coalesce((v_sender_account.config->>'overdraft_limit')::numeric,0))) < p_refund_amount THEN
    RAISE EXCEPTION 'Saldo e limite insuficientes para realizar a devolução Pix (Saldo: R$ %, Limite: R$ %, Solicitado: R$ %).',
      v_sender_account.balance,greatest(0,coalesce((v_sender_account.config->>'overdraft_limit')::numeric,0)),p_refund_amount;
  END IF;

  -- Conta que pagou originalmente e agora recebe a devolução (receiver do refund)
  SELECT * INTO v_receiver_account
  FROM public.accounts
  WHERE id = v_orig_tx.counterparty_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta original do pagador não encontrada para devolução.';
  END IF;

  -- Atualiza saldos
  UPDATE public.accounts
  SET balance = balance - p_refund_amount, updated_at = now()
  WHERE id = v_sender_account.id;

  UPDATE public.accounts
  SET balance = balance + p_refund_amount, updated_at = now()
  WHERE id = v_receiver_account.id;

  UPDATE public.transactions
  SET refunded_amount = v_already_refunded + p_refund_amount,
      status = CASE 
        WHEN (v_already_refunded + p_refund_amount) >= v_orig_tx.amount THEN 'refunded'
        ELSE status
      END
  WHERE id = v_orig_tx.id;

  v_ref := 'DEV-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment,
    related_transaction_id, created_at
  ) VALUES (
    v_sender_account.user_id, v_sender_account.id, v_receiver_account.id, v_receiver_account.name,
    'pix', 'out', p_refund_amount, 'Devolução Pix: ' || p_reason, v_ref, 'completed', false, 'sandbox',
    v_orig_tx.id, v_occurred_at
  ) RETURNING id INTO v_refund_out_id;

  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment,
    related_transaction_id, created_at
  ) VALUES (
    v_receiver_account.user_id, v_receiver_account.id, v_sender_account.id, v_sender_account.name,
    'pix', 'in', p_refund_amount, 'Reembolso Pix Recebido: ' || p_reason, v_ref, 'completed', false, 'sandbox',
    v_orig_tx.id, v_occurred_at
  ) RETURNING id INTO v_refund_in_id;

  -- Evento autoritativo de devolução Pix
  v_event_id := gen_random_uuid();
  v_event_payload := jsonb_build_object(
    'id', v_event_id,
    'event', 'pix.refunded',
    'createdAt', to_char(v_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'realMoney', false,
    'environment', 'sandbox',
    'data', jsonb_build_object(
      'refundTransactionId', v_refund_out_id,
      'originalTransactionId', v_orig_tx.id,
      'refundAmount', p_refund_amount,
      'reason', p_reason,
      'alreadyRefundedTotal', v_already_refunded + p_refund_amount,
      'remainingRefundable', v_orig_tx.amount - (v_already_refunded + p_refund_amount),
      'isFullyRefunded', (v_already_refunded + p_refund_amount) >= v_orig_tx.amount,
      'externalReference', v_ref,
      'realMoney', false,
      'environment', 'sandbox'
    )
  );

  INSERT INTO public.webhook_events (
    id, account_id, event_type, resource_type, resource_id, idempotency_key, payload, occurred_at, created_at
  ) VALUES (
    v_event_id,
    v_sender_account.id,
    'pix.refunded',
    'transaction',
    v_refund_out_id::text,
    'pix.refunded:' || v_refund_out_id::text,
    v_event_payload,
    v_occurred_at,
    v_occurred_at
  );

  INSERT INTO public.webhook_delivery_jobs (event_id, webhook_config_id, status, next_attempt_at)
  SELECT v_event_id, cfg.id, 'pending', now()
  FROM public.webhooks_config cfg
  WHERE cfg.account_id = v_sender_account.id
    AND cfg.active = true
    AND ('pix.refunded' = ANY(cfg.events) OR '*' = ANY(cfg.events));

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Devolução Pix realizada com sucesso!',
    'refund_amount', p_refund_amount,
    'already_refunded_total', v_already_refunded + p_refund_amount,
    'remaining_refundable', v_orig_tx.amount - (v_already_refunded + p_refund_amount),
    'is_fully_refunded', (v_already_refunded + p_refund_amount) >= v_orig_tx.amount,
    'sender_name', v_sender_account.name,
    'receiver_name', v_receiver_account.name,
    'external_reference', v_ref,
    'webhook_event_id', v_event_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_boleto(p_boleto_id uuid, p_payer_account_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_boleto RECORD;
  v_payer_balance DECIMAL(15, 2);
  v_payer_limit DECIMAL(15, 2) := 0;
  v_merchant_account_id UUID;
  v_merchant_name TEXT;
  v_payer_name TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_boleto FROM public.boletos WHERE id = p_boleto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Boleto bancário não encontrado.';
  END IF;

  IF v_boleto.status = 'paid' THEN
    RAISE EXCEPTION 'Este boleto já foi pago anteriormente.';
  END IF;

  SELECT balance, name, greatest(0,coalesce((config->>'overdraft_limit')::numeric,0))
  INTO v_payer_balance, v_payer_name, v_payer_limit
  FROM public.accounts WHERE id = p_payer_account_id FOR UPDATE;

  IF (v_payer_balance + v_payer_limit) < v_boleto.amount THEN
    RAISE EXCEPTION 'Saldo e limite insuficientes na conta do pagador.';
  END IF;

  SELECT id, name INTO v_merchant_account_id, v_merchant_name
  FROM public.accounts WHERE id = v_boleto.account_id FOR UPDATE;

  UPDATE public.accounts SET balance = balance - v_boleto.amount, updated_at = now() WHERE id = p_payer_account_id;
  UPDATE public.accounts SET balance = balance + v_boleto.amount, updated_at = now() WHERE id = v_merchant_account_id;

  UPDATE public.boletos SET status = 'paid', paid_at = now() WHERE id = p_boleto_id;

  INSERT INTO public.transactions (
    user_id, account_id, counterparty_account_id, counterparty_name,
    type, direction, amount, description, external_reference, status, real_money, environment
  ) VALUES
  (v_user_id, p_payer_account_id, v_merchant_account_id, v_merchant_name, 'boleto_payment', 'out', v_boleto.amount, 'Pagamento de Boleto', v_boleto.external_reference, 'completed', false, 'sandbox'),
  (v_user_id, v_merchant_account_id, p_payer_account_id, v_payer_name, 'boleto_payment', 'in', v_boleto.amount, 'Recebimento de Boleto', v_boleto.external_reference, 'completed', false, 'sandbox');

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Boleto quitado com sucesso!',
    'boleto_id', p_boleto_id,
    'amount', v_boleto.amount,
    'external_reference', v_boleto.external_reference,
    'realMoney', false,
    'environment', 'sandbox'
  );
END;
$function$;
