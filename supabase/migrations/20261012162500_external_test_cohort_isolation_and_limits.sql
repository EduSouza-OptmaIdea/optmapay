begin;

-- ============================================================================
-- External sandbox test cohort hardening
-- - strict per-user isolation for customer-facing tables
-- - PF opening balance fixed at R$ 2.000,00
-- - sandbox deposit fixed at R$ 500,00 per operation
-- - newly issued credit cards fixed at R$ 3.000,00
-- ============================================================================

-- 1) RLS: every authenticated tester sees only rows tied to an account they own.
drop policy if exists boletos_select_policy on public.boletos;
create policy boletos_select_policy
on public.boletos
for select
to authenticated
using (
  auth.uid() = user_id
  or account_id in (select id from public.accounts where user_id = auth.uid())
);

drop policy if exists "Permitir gestão de cofrinhos pelo titular" on public.cofrinhos_poupanca;
create policy cofrinhos_poupanca_owner_all
on public.cofrinhos_poupanca
for all
to authenticated
using (
  auth.uid() = user_id
  or account_id in (select id from public.accounts where user_id = auth.uid())
)
with check (
  auth.uid() = user_id
  or account_id in (select id from public.accounts where user_id = auth.uid())
);

drop policy if exists "Permitir inserção e atualização de contas a pagar" on public.contas_pagar;
drop policy if exists "Permitir leitura de contas a pagar pelo titular" on public.contas_pagar;
create policy contas_pagar_owner_all
on public.contas_pagar
for all
to authenticated
using (
  auth.uid() = user_id
  or account_id in (select id from public.accounts where user_id = auth.uid())
)
with check (
  auth.uid() = user_id
  or account_id in (select id from public.accounts where user_id = auth.uid())
);

drop policy if exists "Permitir gestão de empréstimos pelo titular" on public.emprestimos_edu;
create policy emprestimos_edu_owner_all
on public.emprestimos_edu
for all
to authenticated
using (
  auth.uid() = user_id
  or account_id in (select id from public.accounts where user_id = auth.uid())
)
with check (
  auth.uid() = user_id
  or account_id in (select id from public.accounts where user_id = auth.uid())
);

drop policy if exists data_retention_logs_insert_policy on public.data_retention_logs;
drop policy if exists data_retention_logs_select_policy on public.data_retention_logs;
create policy data_retention_logs_owner_select
on public.data_retention_logs
for select
to authenticated
using (
  auth.uid() = user_id
  or account_id in (select id from public.accounts where user_id = auth.uid())
);
create policy data_retention_logs_owner_insert
on public.data_retention_logs
for insert
to authenticated
with check (
  auth.uid() = user_id
  or account_id in (select id from public.accounts where user_id = auth.uid())
);

-- This helper mutates card state and is used only from authenticated application flows.
revoke all on function public.block_card_pin_attempts(uuid, text) from public, anon;
grant execute on function public.block_card_pin_attempts(uuid, text) to authenticated, service_role;

-- 2) PF account opening: every new customer/PF account starts with exactly R$ 2.000,00.
create or replace function public.enforce_optmapay_pf_opening_balance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.type = 'customer' then
    new.balance := 2000.00;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_optmapay_pf_opening_balance on public.accounts;
create trigger trg_enforce_optmapay_pf_opening_balance
before insert on public.accounts
for each row
execute function public.enforce_optmapay_pf_opening_balance();

-- Direct browser updates may change profile/config, but never the monetary balance.
-- Monetary movements must go through audited RPCs.
create or replace function public.guard_optmapay_direct_balance_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' and new.balance is distinct from old.balance then
    raise exception 'Saldo não pode ser alterado diretamente. Utilize uma operação financeira do OptmaPay.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_optmapay_direct_balance_update on public.accounts;
create trigger trg_guard_optmapay_direct_balance_update
before update on public.accounts
for each row
execute function public.guard_optmapay_direct_balance_update();

-- 3) Sandbox deposit: exactly R$ 500,00 per operation and only on an account owned
-- by the caller (service_role remains available for controlled backend operations).
create or replace function public.deposit_funds(
  p_account_id uuid,
  p_amount numeric,
  p_description text default 'Aporte Fictício Sandbox'::text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_owner_user_id uuid;
  v_new_balance numeric(15,2);
  v_tx_id uuid;
begin
  if round(coalesce(p_amount, 0), 2) <> 500.00 then
    raise exception 'No Sandbox, cada aporte deve ser exatamente de R$ 500,00.';
  end if;

  select user_id
    into v_owner_user_id
  from public.accounts
  where id = p_account_id
  for update;

  if not found then
    raise exception 'Conta para aporte não encontrada.';
  end if;

  if auth.role() <> 'service_role' and (v_actor_user_id is null or v_owner_user_id is distinct from v_actor_user_id) then
    raise exception 'Acesso negado: esta conta não pertence ao usuário autenticado.';
  end if;

  update public.accounts
     set balance = balance + 500.00,
         updated_at = now()
   where id = p_account_id
  returning balance into v_new_balance;

  insert into public.transactions (
    user_id, account_id, type, direction, amount, description, status, real_money, environment
  ) values (
    v_owner_user_id,
    p_account_id,
    'deposit',
    'in',
    500.00,
    coalesce(nullif(trim(p_description), ''), 'Aporte Fictício Sandbox'),
    'completed',
    false,
    'sandbox'
  )
  returning id into v_tx_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Aporte fictício de R$ 500,00 realizado com sucesso!',
    'account_id', p_account_id,
    'amount', 500.00,
    'new_balance', v_new_balance,
    'transaction_id', v_tx_id
  );
end;
$$;

revoke all on function public.deposit_funds(uuid, numeric, text) from public, anon;
grant execute on function public.deposit_funds(uuid, numeric, text) to authenticated, service_role;

-- 4) New credit cards have a fixed R$ 3.000,00 purchase limit.
create or replace function public.enforce_optmapay_card_test_limit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.credit_limit := case when new.tipo = 'credito' then 3000.00 else 0.00 end;
  elsif tg_op = 'UPDATE'
    and current_user = 'authenticated'
    and new.credit_limit is distinct from old.credit_limit then
    raise exception 'O limite do cartão sandbox não pode ser alterado diretamente.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_optmapay_card_test_limit on public.cartoes;
create trigger trg_enforce_optmapay_card_test_limit
before insert or update on public.cartoes
for each row
execute function public.enforce_optmapay_card_test_limit();

commit;
