
-- OptmaPay authoritative card ledger, invoice obligations and settlement hardening.
-- Sandbox only: no real-money behavior is introduced here.

create or replace function public.optmapay_add_business_days(p_start date, p_days integer)
returns date
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  v_date date := p_start;
  v_added integer := 0;
begin
  if p_days < 0 then
    raise exception 'p_days must be >= 0';
  end if;
  while v_added < p_days loop
    v_date := v_date + 1;
    if extract(isodow from v_date) between 1 and 5 then
      v_added := v_added + 1;
    end if;
  end loop;
  return v_date;
end;
$$;

create or replace function public.optmapay_credit_due_date(
  p_purchase_at timestamptz,
  p_due_day integer,
  p_installment_number integer
)
returns date
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  v_purchase date := (p_purchase_at at time zone 'UTC')::date;
  v_due_day integer := greatest(1, least(28, coalesce(p_due_day, 10)));
  v_candidate date;
  v_closing date;
  v_first_month date;
begin
  if p_installment_number < 1 then
    raise exception 'installment number must be >= 1';
  end if;

  v_candidate := make_date(extract(year from v_purchase)::integer, extract(month from v_purchase)::integer, v_due_day);
  v_closing := v_candidate - 7;

  if v_purchase > v_closing then
    v_first_month := (date_trunc('month', v_candidate)::date + interval '1 month')::date;
  else
    v_first_month := date_trunc('month', v_candidate)::date;
  end if;

  return (
    v_first_month
    + ((p_installment_number - 1) || ' months')::interval
    + ((v_due_day - 1) || ' days')::interval
  )::date;
end;
$$;

create table if not exists public.card_receivables (
  id uuid primary key default gen_random_uuid(),
  merchant_account_id uuid not null references public.accounts(id) on delete cascade,
  payer_account_id uuid not null references public.accounts(id) on delete restrict,
  card_id uuid not null references public.cartoes(id) on delete restrict,
  transaction_in_id uuid not null unique references public.transactions(id) on delete cascade,
  transaction_out_id uuid not null references public.transactions(id) on delete restrict,
  external_reference text,
  payment_type text not null check (payment_type in ('debito','credito')),
  installments integer not null default 1 check (installments between 1 and 12),
  settlement_plan text not null,
  gross_amount numeric(15,2) not null check (gross_amount > 0),
  fee_percent numeric(8,4) not null default 0 check (fee_percent >= 0),
  fee_amount numeric(15,2) not null default 0 check (fee_amount >= 0),
  net_amount numeric(15,2) not null check (net_amount > 0),
  status text not null default 'pending' check (status in ('pending','settled','cancelled','refunded')),
  expected_settlement_at timestamptz,
  settled_at timestamptz,
  settlement_event_id uuid references public.webhook_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_card_receivables_due
  on public.card_receivables(status, expected_settlement_at)
  where status = 'pending';
create index if not exists idx_card_receivables_merchant
  on public.card_receivables(merchant_account_id, created_at desc);
create index if not exists idx_card_receivables_external_reference
  on public.card_receivables(external_reference)
  where external_reference is not null;

create table if not exists public.credit_card_invoices (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cartoes(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  due_date date not null,
  closing_date date not null,
  status text not null default 'open' check (status in ('open','paid','overdue','cancelled')),
  total_amount numeric(15,2) not null default 0 check (total_amount >= 0),
  paid_amount numeric(15,2) not null default 0 check (paid_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(card_id, due_date)
);

create index if not exists idx_credit_card_invoices_card_due
  on public.credit_card_invoices(card_id, due_date);

create table if not exists public.credit_card_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.credit_card_invoices(id) on delete cascade,
  card_id uuid not null references public.cartoes(id) on delete cascade,
  source_transaction_id uuid not null references public.transactions(id) on delete restrict,
  external_reference text,
  installment_number integer not null check (installment_number between 1 and 12),
  total_installments integer not null check (total_installments between 1 and 12),
  amount numeric(15,2) not null check (amount > 0),
  paid_amount numeric(15,2) not null default 0 check (paid_amount >= 0 and paid_amount <= amount),
  status text not null default 'open' check (status in ('open','paid','refunded','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_transaction_id, installment_number)
);

create index if not exists idx_credit_card_invoice_items_invoice
  on public.credit_card_invoice_items(invoice_id, status);
create index if not exists idx_credit_card_invoice_items_card
  on public.credit_card_invoice_items(card_id, created_at desc);

create table if not exists public.credit_card_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cartoes(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  transaction_id uuid not null unique references public.transactions(id) on delete restrict,
  amount numeric(15,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.credit_card_invoice_payment_allocations (
  payment_id uuid not null references public.credit_card_invoice_payments(id) on delete cascade,
  invoice_item_id uuid not null references public.credit_card_invoice_items(id) on delete restrict,
  amount numeric(15,2) not null check (amount > 0),
  primary key(payment_id, invoice_item_id)
);

alter table public.card_receivables enable row level security;
alter table public.credit_card_invoices enable row level security;
alter table public.credit_card_invoice_items enable row level security;
alter table public.credit_card_invoice_payments enable row level security;
alter table public.credit_card_invoice_payment_allocations enable row level security;

drop policy if exists card_receivables_select_own on public.card_receivables;
create policy card_receivables_select_own on public.card_receivables
for select to authenticated
using (
  exists (
    select 1 from public.accounts a
    where a.id = card_receivables.merchant_account_id
      and a.user_id = auth.uid()
  )
);

drop policy if exists credit_card_invoices_select_own on public.credit_card_invoices;
create policy credit_card_invoices_select_own on public.credit_card_invoices
for select to authenticated
using (
  exists (
    select 1 from public.accounts a
    where a.id = credit_card_invoices.account_id
      and a.user_id = auth.uid()
  )
);

drop policy if exists credit_card_invoice_items_select_own on public.credit_card_invoice_items;
create policy credit_card_invoice_items_select_own on public.credit_card_invoice_items
for select to authenticated
using (
  exists (
    select 1 from public.cartoes c
    join public.accounts a on a.id = c.account_id
    where c.id = credit_card_invoice_items.card_id
      and a.user_id = auth.uid()
  )
);

drop policy if exists credit_card_invoice_payments_select_own on public.credit_card_invoice_payments;
create policy credit_card_invoice_payments_select_own on public.credit_card_invoice_payments
for select to authenticated
using (
  exists (
    select 1 from public.accounts a
    where a.id = credit_card_invoice_payments.account_id
      and a.user_id = auth.uid()
  )
);

drop policy if exists credit_card_invoice_payment_allocations_select_own on public.credit_card_invoice_payment_allocations;
create policy credit_card_invoice_payment_allocations_select_own on public.credit_card_invoice_payment_allocations
for select to authenticated
using (
  exists (
    select 1
    from public.credit_card_invoice_payments p
    join public.accounts a on a.id = p.account_id
    where p.id = credit_card_invoice_payment_allocations.payment_id
      and a.user_id = auth.uid()
  )
);

revoke all on public.card_receivables from public, anon, authenticated;
revoke all on public.credit_card_invoices from public, anon, authenticated;
revoke all on public.credit_card_invoice_items from public, anon, authenticated;
revoke all on public.credit_card_invoice_payments from public, anon, authenticated;
revoke all on public.credit_card_invoice_payment_allocations from public, anon, authenticated;
grant select on public.card_receivables to authenticated;
grant select on public.credit_card_invoices to authenticated;
grant select on public.credit_card_invoice_items to authenticated;
grant select on public.credit_card_invoice_payments to authenticated;
grant select on public.credit_card_invoice_payment_allocations to authenticated;
grant all on public.card_receivables to service_role;
grant all on public.credit_card_invoices to service_role;
grant all on public.credit_card_invoice_items to service_role;
grant all on public.credit_card_invoice_payments to service_role;
grant all on public.credit_card_invoice_payment_allocations to service_role;

create or replace function public.process_card_payment(
  p_merchant_account_id uuid,
  p_card_id uuid default null,
  p_card_number text default null,
  p_cardholder_name text default 'CLIENTE SANDBOX',
  p_validade text default null,
  p_cvv text default null,
  p_amount numeric default 0,
  p_tipo text default 'credito',
  p_installments integer default 1,
  p_plan text default 'standard',
  p_description text default null,
  p_external_reference text default null,
  p_api_key_id uuid default null,
  p_idempotency_key text default null,
  p_request_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  select id,user_id,name,cpf_cnpj,balance into v_payer_account
  from public.accounts where id = v_card.account_id for update;
  if not found then raise exception 'Conta vinculada ao cartão pagador não encontrada.'; end if;

  if p_tipo = 'debito' then
    if v_payer_account.balance < v_gross_amount then
      raise exception 'ERRO 51: Saldo insuficiente na conta para compra no débito (Disponível: R$ %, Necessário: R$ %).',v_payer_account.balance,v_gross_amount;
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
      v_expected_settlement_at := public.optmapay_add_business_days(v_occurred_at::date,1)::timestamptz;
    elsif v_effective_plan = 'd7' then
      v_expected_settlement_at := public.optmapay_add_business_days(v_occurred_at::date,7)::timestamptz;
    elsif v_effective_plan = 'd15' then
      v_expected_settlement_at := public.optmapay_add_business_days(v_occurred_at::date,15)::timestamptz;
    elsif v_effective_plan = 'due_date' then
      v_expected_settlement_at := public.optmapay_credit_due_date(v_occurred_at,coalesce(v_card.due_day,10),1)::timestamptz;
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

  v_response_json := jsonb_build_object(
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
    'settlement_plan',v_effective_plan,'plan',v_effective_plan,'settlementPlan',v_effective_plan,
    'receivable_id',v_receivable_id,'receivableId',v_receivable_id,
    'expected_settlement_at',v_expected_settlement_at,'expectedSettlementAt',v_expected_settlement_at,
    'card_id',v_card.id,'cardId',v_card.id,
    'card_masked','•••• ' || right(coalesce(v_clean_card_number,v_card.card_number,v_card.masked_number),4),
    'cardMasked','•••• ' || right(coalesce(v_clean_card_number,v_card.card_number,v_card.masked_number),4),
    'card_brand',coalesce(v_card.brand,'OptmaCard'),'cardBrand',coalesce(v_card.brand,'OptmaCard'),
    'cardholder_name',coalesce(p_cardholder_name,'CLIENTE SANDBOX'),'cardholderName',coalesce(p_cardholder_name,'CLIENTE SANDBOX'),
    'payer_account_id',v_payer_account.id,'payerAccountId',v_payer_account.id,
    'payer_name',v_payer_account.name,'payerName',v_payer_account.name,
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
$$;

revoke all on function public.process_card_payment(uuid,uuid,text,text,text,text,numeric,text,integer,text,text,text,uuid,text,text) from public, anon;
grant execute on function public.process_card_payment(uuid,uuid,text,text,text,text,numeric,text,integer,text,text,text,uuid,text,text) to authenticated, service_role;

create or replace function public.release_d1_settlement(p_transaction_id uuid, p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx record;
  v_rec record;
  v_acc record;
  v_role text;
  v_event_id uuid;
  v_payload jsonb;
  v_cfg record;
begin
  select * into v_tx
  from public.transactions
  where id=p_transaction_id and account_id=p_account_id
  for update;
  if not found then raise exception 'Transação não encontrada ou não pertence a esta conta.'; end if;
  if v_tx.type <> 'card_payment' or v_tx.direction <> 'in' then
    raise exception 'Apenas recebimentos de vendas com cartão podem ser liquidados.';
  end if;

  select * into v_rec
  from public.card_receivables
  where transaction_in_id=v_tx.id
  for update;
  if not found then
    raise exception 'Recebível autoritativo não encontrado para esta transação.';
  end if;

  select * into v_acc from public.accounts where id=p_account_id for update;
  if not found then raise exception 'Conta merchant não encontrada.'; end if;

  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(auth.role(),''),current_user);
  if v_role='authenticated' then
    if auth.uid() is null or v_acc.user_id is null or auth.uid()<>v_acc.user_id then
      raise exception 'Acesso negado para liquidar recebível desta conta.';
    end if;
  elsif v_role not in ('service_role','postgres','supabase_admin') then
    raise exception 'Acesso negado para liquidar recebível.';
  end if;

  if v_rec.status='settled' then
    return jsonb_build_object(
      'success',true,'duplicate',true,'message','Recebível já havia sido liquidado.',
      'amount_credited',v_rec.net_amount,'transaction_id',v_tx.id,'receivable_id',v_rec.id,
      'settled_at',v_rec.settled_at
    );
  end if;

  if v_rec.status <> 'pending' then
    raise exception 'Recebível não está pendente (status: %).',v_rec.status;
  end if;
  if v_rec.expected_settlement_at is not null and now() < v_rec.expected_settlement_at then
    raise exception 'SETTLEMENT_NOT_DUE: recebível previsto para %.',v_rec.expected_settlement_at;
  end if;

  update public.accounts
    set balance=balance+v_rec.net_amount,updated_at=now()
    where id=p_account_id;

  update public.transactions
    set status='completed',
        description=case when description ilike '%liquidado%' then description else description || ' | Liquidado' end
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
      'amountNet',v_rec.net_amount,
      'settlementPlan',v_rec.settlement_plan,
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
    select id from public.webhooks_config
    where account_id=p_account_id and active=true
      and ('receivable.settled'=any(events) or 'payment.settled'=any(events) or '*'=any(events))
  loop
    insert into public.webhook_delivery_jobs(event_id,webhook_config_id,status,attempt_count,next_attempt_at)
    values(v_event_id,v_cfg.id,'pending',0,now())
    on conflict(event_id,webhook_config_id) do nothing;
  end loop;

  update public.card_receivables
    set status='settled',settled_at=now(),settlement_event_id=v_event_id,updated_at=now()
    where id=v_rec.id;

  return jsonb_build_object(
    'success',true,'duplicate',false,'message','Recebível liquidado com sucesso.',
    'amount_credited',v_rec.net_amount,'transaction_id',v_tx.id,'receivable_id',v_rec.id,
    'settlement_event_id',v_event_id,'settled_at',now()
  );
end;
$$;

revoke all on function public.release_d1_settlement(uuid,uuid) from public, anon;
grant execute on function public.release_d1_settlement(uuid,uuid) to authenticated, service_role;

create or replace function public.settle_due_card_receivables(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_rec record;
  v_count integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(auth.role(),''),current_user);
  if v_role not in ('service_role','postgres','supabase_admin') then
    raise exception 'Acesso negado: liquidação em lote é restrita ao backend.';
  end if;

  for v_rec in
    select r.transaction_in_id,r.merchant_account_id
    from public.card_receivables r
    where r.status='pending'
      and (r.expected_settlement_at is null or r.expected_settlement_at<=now())
    order by r.expected_settlement_at nulls first,r.created_at
    limit greatest(1,least(coalesce(p_limit,100),500))
    for update skip locked
  loop
    v_result := public.release_d1_settlement(v_rec.transaction_in_id,v_rec.merchant_account_id);
    v_results := v_results || jsonb_build_array(v_result);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('success',true,'settled_count',v_count,'results',v_results);
end;
$$;

revoke all on function public.settle_due_card_receivables(integer) from public, anon, authenticated;
grant execute on function public.settle_due_card_receivables(integer) to service_role;

create or replace function public.pay_credit_card_invoice(p_card_id uuid, p_amount numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  if v_acc.balance < v_pay_amount then
    raise exception 'Saldo insuficiente na conta para quitar a fatura (Saldo em conta: R$ %, Fatura: R$ %).',v_acc.balance,v_pay_amount;
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
$$;

revoke all on function public.pay_credit_card_invoice(uuid,numeric) from public, anon;
grant execute on function public.pay_credit_card_invoice(uuid,numeric) to authenticated, service_role;

create or replace function public.block_overdue_card(p_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_card record;
  v_acc record;
  v_role text;
  v_days integer;
begin
  select * into v_card from public.cartoes where id=p_card_id for update;
  if not found then raise exception 'Cartão não encontrado.'; end if;
  select * into v_acc from public.accounts where id=v_card.account_id;
  if not found then raise exception 'Conta do cartão não encontrada.'; end if;

  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(auth.role(),''),current_user);
  if v_role='authenticated' then
    if auth.uid() is null or v_acc.user_id is null or auth.uid()<>v_acc.user_id then
      raise exception 'Acesso negado para este cartão.';
    end if;
  elsif v_role not in ('service_role','postgres','supabase_admin') then
    raise exception 'Acesso negado.';
  end if;

  select max(current_date-f.due_date) into v_days
  from public.credit_card_invoices f
  where f.card_id=p_card_id
    and f.status in ('open','overdue')
    and f.paid_amount<f.total_amount
    and f.due_date<current_date;

  if coalesce(v_days,0)<7 then
    return jsonb_build_object(
      'success',false,'blocked',false,
      'message','Cartão não possui fatura com atraso superior a 7 dias.',
      'days_overdue',coalesce(v_days,0)
    );
  end if;

  update public.cartoes set status='blocked' where id=v_card.id;
  return jsonb_build_object(
    'success',true,'blocked',true,
    'message','Cartão bloqueado por atraso superior a 7 dias no pagamento da fatura.',
    'card_id',v_card.id,'status','blocked','days_overdue',v_days
  );
end;
$$;

revoke all on function public.block_overdue_card(uuid) from public, anon;
grant execute on function public.block_overdue_card(uuid) to authenticated, service_role;

create or replace function public.get_credit_card_invoice_snapshot(p_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_card record;
  v_acc record;
  v_role text;
  v_invoices jsonb;
  v_outstanding numeric(15,2);
begin
  select * into v_card from public.cartoes where id=p_card_id;
  if not found then raise exception 'Cartão não encontrado.'; end if;
  if v_card.tipo<>'credito' then raise exception 'Snapshot de fatura disponível apenas para cartão de crédito.'; end if;
  select * into v_acc from public.accounts where id=v_card.account_id;
  if not found then raise exception 'Conta do cartão não encontrada.'; end if;

  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(auth.role(),''),current_user);
  if v_role='authenticated' then
    if auth.uid() is null or v_acc.user_id is null or auth.uid()<>v_acc.user_id then
      raise exception 'Acesso negado para este cartão.';
    end if;
  elsif v_role not in ('service_role','postgres','supabase_admin') then
    raise exception 'Acesso negado.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',f.id,
      'dueDate',f.due_date,
      'closingDate',f.closing_date,
      'status',case when f.status<>'paid' and f.due_date<current_date then 'overdue' else f.status end,
      'totalAmount',f.total_amount,
      'paidAmount',f.paid_amount,
      'outstandingAmount',greatest(0,f.total_amount-f.paid_amount),
      'items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',i.id,
          'sourceTransactionId',i.source_transaction_id,
          'externalReference',i.external_reference,
          'installmentNumber',i.installment_number,
          'totalInstallments',i.total_installments,
          'amount',i.amount,
          'paidAmount',i.paid_amount,
          'status',i.status
        ) order by i.installment_number,i.created_at)
        from public.credit_card_invoice_items i
        where i.invoice_id=f.id
      ),'[]'::jsonb)
    ) order by f.due_date
  ),'[]'::jsonb) into v_invoices
  from public.credit_card_invoices f
  where f.card_id=p_card_id;

  select coalesce(sum(i.amount-i.paid_amount),0)::numeric(15,2) into v_outstanding
  from public.credit_card_invoice_items i
  where i.card_id=p_card_id and i.status='open';

  return jsonb_build_object(
    'cardId',v_card.id,
    'currentBalance',coalesce(v_card.current_balance,0),
    'creditLimit',coalesce(v_card.credit_limit,0),
    'availableLimit',greatest(0,coalesce(v_card.credit_limit,0)-coalesce(v_card.current_balance,0)),
    'authoritativeOutstanding',v_outstanding,
    'invoices',v_invoices,
    'environment','sandbox',
    'realMoney',false
  );
end;
$$;

revoke all on function public.get_credit_card_invoice_snapshot(uuid) from public, anon;
grant execute on function public.get_credit_card_invoice_snapshot(uuid) to authenticated, service_role;
