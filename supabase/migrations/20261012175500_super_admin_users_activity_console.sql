begin;

-- ============================================================================
-- OptmaPay Sandbox - Super Admin: server-side authority + users/activity console
-- ============================================================================

create table if not exists public.optmapay_super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.optmapay_super_admins enable row level security;
revoke all on table public.optmapay_super_admins from public, anon, authenticated;
grant all on table public.optmapay_super_admins to service_role;

insert into public.optmapay_super_admins (user_id, label, enabled)
select id, 'Super Admin Master • OptmaPay', true
from auth.users
where lower(email) = lower('edu.souza0973@gmail.com')
on conflict (user_id) do update
set label = excluded.label,
    enabled = true;

create or replace function public.is_optmapay_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.optmapay_super_admins s
    where s.user_id = auth.uid()
      and s.enabled = true
  );
$$;

revoke all on function public.is_optmapay_super_admin() from public, anon;
grant execute on function public.is_optmapay_super_admin() to authenticated, service_role;

create or replace function public.super_admin_list_accounts()
returns setof public.accounts
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_optmapay_super_admin() then
    raise exception 'Acesso negado: operação restrita ao Super Admin do OptmaPay.';
  end if;

  return query
  select a.*
  from public.accounts a
  order by a.created_at asc;
end;
$$;

revoke all on function public.super_admin_list_accounts() from public, anon;
grant execute on function public.super_admin_list_accounts() to authenticated, service_role;

create or replace function public.super_admin_global_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_total_accounts bigint;
  v_total_balance numeric := 0;
  v_total_transactions bigint;
  v_total_tpv numeric := 0;
  v_pending_count bigint;
  v_pending_total numeric := 0;
  v_mdr numeric := 0;
begin
  if not public.is_optmapay_super_admin() then
    raise exception 'Acesso negado: operação restrita ao Super Admin do OptmaPay.';
  end if;

  select count(*), coalesce(sum(balance),0)
    into v_total_accounts, v_total_balance
  from public.accounts;

  select count(*), coalesce(sum(amount),0)
    into v_total_transactions, v_total_tpv
  from public.transactions;

  select count(*), coalesce(sum(amount),0)
    into v_pending_count, v_pending_total
  from public.transactions
  where status = 'pending';

  select coalesce(sum(
    case
      when description ~* 'Taxa[^:]*:' then
        coalesce(
          nullif(
            replace(
              regexp_replace(
                substring(description from 'Taxa[^:]*:[^0-9]*([0-9]+(?:[.,][0-9]+)?)'),
                ',', '.', 'g'
              ),
              ' ', ''
            ),
            ''
          )::numeric,
          0
        )
      else 0
    end
  ),0)
  into v_mdr
  from public.transactions
  where description ilike '%Taxa%';

  return jsonb_build_object(
    'totalAccounts', v_total_accounts,
    'totalBalanceCustodied', round(v_total_balance,2),
    'totalTransactionsCount', v_total_transactions,
    'totalVolumeTPV', round(v_total_tpv,2),
    'totalMdrRevenueCollected', round(v_mdr,2),
    'totalPendingSettlements', round(v_pending_total,2),
    'pendingTransactionsCount', v_pending_count
  );
end;
$$;

revoke all on function public.super_admin_global_metrics() from public, anon;
grant execute on function public.super_admin_global_metrics() to authenticated, service_role;

create or replace function public.super_admin_user_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_total_users bigint;
  v_confirmed bigint;
  v_pending bigint;
  v_signed_24h bigint;
  v_customer_accounts bigint;
  v_merchant_accounts bigint;
begin
  if not public.is_optmapay_super_admin() then
    raise exception 'Acesso negado: operação restrita ao Super Admin do OptmaPay.';
  end if;

  select
    count(*),
    count(*) filter (where email_confirmed_at is not null),
    count(*) filter (where email_confirmed_at is null),
    count(*) filter (where last_sign_in_at >= now() - interval '24 hours')
  into v_total_users, v_confirmed, v_pending, v_signed_24h
  from auth.users;

  select
    count(*) filter (where type = 'customer'),
    count(*) filter (where type = 'merchant')
  into v_customer_accounts, v_merchant_accounts
  from public.accounts;

  return jsonb_build_object(
    'totalUsers', v_total_users,
    'confirmedUsers', v_confirmed,
    'pendingConfirmation', v_pending,
    'signedInLast24h', v_signed_24h,
    'customerAccounts', v_customer_accounts,
    'merchantAccounts', v_merchant_accounts
  );
end;
$$;

revoke all on function public.super_admin_user_metrics() from public, anon;
grant execute on function public.super_admin_user_metrics() to authenticated, service_role;

create or replace function public.super_admin_list_users(
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  account_type text,
  created_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  status text,
  account_count bigint,
  account_names text,
  total_balance numeric,
  transaction_count bigint,
  card_count bigint,
  boleto_count bigint,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_optmapay_super_admin() then
    raise exception 'Acesso negado: operação restrita ao Super Admin do OptmaPay.';
  end if;

  return query
  with account_stats as (
    select
      a.user_id,
      count(*)::bigint as account_count,
      string_agg(a.name, ' • ' order by a.created_at) as account_names,
      coalesce(sum(a.balance),0)::numeric as total_balance,
      max(a.created_at) as last_account_at,
      (array_agg(a.type order by a.created_at desc))[1]::text as primary_account_type
    from public.accounts a
    where a.user_id is not null
    group by a.user_id
  ),
  tx_stats as (
    select
      t.user_id,
      count(*)::bigint as transaction_count,
      max(t.created_at) as last_tx_at
    from public.transactions t
    where t.user_id is not null
    group by t.user_id
  ),
  card_stats as (
    select c.user_id, count(*)::bigint as card_count, max(c.created_at) as last_card_at
    from public.cartoes c
    where c.user_id is not null
    group by c.user_id
  ),
  boleto_stats as (
    select b.user_id, count(*)::bigint as boleto_count, max(b.created_at) as last_boleto_at
    from public.boletos b
    where b.user_id is not null
    group by b.user_id
  )
  select
    u.id,
    u.email::text,
    coalesce(
      nullif(u.raw_user_meta_data->>'account_name',''),
      nullif(a.account_names,''),
      split_part(coalesce(u.email,''),'@',1)
    )::text as display_name,
    coalesce(
      nullif(u.raw_user_meta_data->>'account_type',''),
      a.primary_account_type,
      'sem_conta'
    )::text as account_type,
    u.created_at,
    u.email_confirmed_at,
    u.last_sign_in_at,
    case
      when u.banned_until is not null and u.banned_until > now() then 'blocked'
      when u.email_confirmed_at is null then 'pending_confirmation'
      else 'active'
    end::text as status,
    coalesce(a.account_count,0)::bigint,
    coalesce(a.account_names,'')::text,
    coalesce(a.total_balance,0)::numeric,
    coalesce(t.transaction_count,0)::bigint,
    coalesce(c.card_count,0)::bigint,
    coalesce(b.boleto_count,0)::bigint,
    greatest(
      u.created_at,
      coalesce(u.last_sign_in_at, u.created_at),
      coalesce(a.last_account_at, u.created_at),
      coalesce(t.last_tx_at, u.created_at),
      coalesce(c.last_card_at, u.created_at),
      coalesce(b.last_boleto_at, u.created_at)
    ) as last_activity_at
  from auth.users u
  left join account_stats a on a.user_id = u.id
  left join tx_stats t on t.user_id = u.id
  left join card_stats c on c.user_id = u.id
  left join boleto_stats b on b.user_id = u.id
  where
    p_search is null
    or trim(p_search) = ''
    or coalesce(u.email,'') ilike '%' || trim(p_search) || '%'
    or coalesce(u.raw_user_meta_data->>'account_name','') ilike '%' || trim(p_search) || '%'
    or coalesce(a.account_names,'') ilike '%' || trim(p_search) || '%'
  order by u.created_at desc
  limit greatest(1, least(coalesce(p_limit,100),500))
  offset greatest(coalesce(p_offset,0),0);
end;
$$;

revoke all on function public.super_admin_list_users(text, integer, integer) from public, anon;
grant execute on function public.super_admin_list_users(text, integer, integer) to authenticated, service_role;

create or replace function public.super_admin_activity_feed(
  p_user_id uuid default null,
  p_search text default null,
  p_limit integer default 150,
  p_offset integer default 0
)
returns table (
  event_id text,
  user_id uuid,
  user_email text,
  account_id uuid,
  account_name text,
  event_type text,
  category text,
  summary text,
  amount numeric,
  status text,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_optmapay_super_admin() then
    raise exception 'Acesso negado: operação restrita ao Super Admin do OptmaPay.';
  end if;

  return query
  with events as (
    select
      ('signup:' || u.id::text) as event_id,
      u.id as user_id,
      u.email::text as user_email,
      null::uuid as account_id,
      coalesce(nullif(u.raw_user_meta_data->>'account_name',''), split_part(coalesce(u.email,''),'@',1))::text as account_name,
      'signup'::text as event_type,
      'auth'::text as category,
      'Cadastro criado no OptmaPay Sandbox'::text as summary,
      null::numeric as amount,
      case when u.email_confirmed_at is null then 'aguardando_confirmacao' else 'confirmado' end::text as status,
      u.created_at as occurred_at
    from auth.users u

    union all

    select
      ('login:' || u.id::text || ':' || extract(epoch from u.last_sign_in_at)::bigint::text),
      u.id,
      u.email::text,
      null::uuid,
      coalesce(nullif(u.raw_user_meta_data->>'account_name',''), split_part(coalesce(u.email,''),'@',1))::text,
      'last_sign_in'::text,
      'auth'::text,
      'Último login registrado'::text,
      null::numeric,
      'sucesso'::text,
      u.last_sign_in_at
    from auth.users u
    where u.last_sign_in_at is not null

    union all

    select
      ('account:' || a.id::text),
      a.user_id,
      u.email::text,
      a.id,
      a.name::text,
      'account_created'::text,
      'conta'::text,
      ('Conta ' || case when a.type='customer' then 'PF' else 'PJ' end || ' criada')::text,
      a.balance::numeric,
      'ativa'::text,
      a.created_at
    from public.accounts a
    left join auth.users u on u.id = a.user_id

    union all

    select
      ('tx:' || t.id::text),
      coalesce(t.user_id,a.user_id),
      u.email::text,
      t.account_id,
      a.name::text,
      t.type::text,
      'transacao'::text,
      coalesce(nullif(t.description,''), 'Movimentação financeira')::text,
      t.amount::numeric,
      t.status::text,
      t.created_at
    from public.transactions t
    left join public.accounts a on a.id=t.account_id
    left join auth.users u on u.id=coalesce(t.user_id,a.user_id)

    union all

    select
      ('card:' || c.id::text),
      coalesce(c.user_id,a.user_id),
      u.email::text,
      c.account_id,
      a.name::text,
      'card_created'::text,
      'cartao'::text,
      ('Cartão ' || upper(c.tipo) || ' emitido • ' || c.masked_number)::text,
      case when c.tipo='credito' then c.credit_limit else null end::numeric,
      c.status::text,
      c.created_at
    from public.cartoes c
    left join public.accounts a on a.id=c.account_id
    left join auth.users u on u.id=coalesce(c.user_id,a.user_id)

    union all

    select
      ('boleto:' || b.id::text),
      coalesce(b.user_id,a.user_id),
      u.email::text,
      b.account_id,
      a.name::text,
      'boleto_created'::text,
      'boleto'::text,
      ('Boleto emitido para ' || b.payer_name)::text,
      b.amount::numeric,
      b.status::text,
      b.created_at
    from public.boletos b
    left join public.accounts a on a.id=b.account_id
    left join auth.users u on u.id=coalesce(b.user_id,a.user_id)
  )
  select
    e.event_id,
    e.user_id,
    e.user_email,
    e.account_id,
    e.account_name,
    e.event_type,
    e.category,
    e.summary,
    e.amount,
    e.status,
    e.occurred_at
  from events e
  where
    (p_user_id is null or e.user_id = p_user_id)
    and (
      p_search is null
      or trim(p_search) = ''
      or coalesce(e.user_email,'') ilike '%' || trim(p_search) || '%'
      or coalesce(e.account_name,'') ilike '%' || trim(p_search) || '%'
      or coalesce(e.summary,'') ilike '%' || trim(p_search) || '%'
      or coalesce(e.category,'') ilike '%' || trim(p_search) || '%'
    )
  order by e.occurred_at desc
  limit greatest(1, least(coalesce(p_limit,150),500))
  offset greatest(coalesce(p_offset,0),0);
end;
$$;

revoke all on function public.super_admin_activity_feed(uuid, text, integer, integer) from public, anon;
grant execute on function public.super_admin_activity_feed(uuid, text, integer, integer) to authenticated, service_role;

commit;
