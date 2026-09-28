-- Pix single-use hardening + status lookup for dynamic instructions.
-- A cobrança identificada por external_reference pode ser liquidada uma única vez,
-- independentemente da conta pagadora que tente reutilizar o mesmo código.

create unique index if not exists ux_transactions_pix_paid_external_reference
on public.transactions (external_reference)
where type = 'pix'
  and direction = 'in'
  and status = 'completed'
  and external_reference is not null
  and btrim(external_reference) <> '';

create or replace function public.get_pix_instruction_status_safe(
  p_external_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_user_id uuid;
  v_paid_in record;
  v_paid_out record;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return jsonb_build_object('ok',false,'error','authentication_required');
  end if;

  if p_external_reference is null
     or length(btrim(p_external_reference)) < 8
     or length(p_external_reference) > 500
  then
    return jsonb_build_object('ok',false,'error','invalid_external_reference');
  end if;

  select
    t.id,
    t.account_id,
    t.counterparty_account_id,
    t.counterparty_name,
    t.amount,
    t.created_at
  into v_paid_in
  from public.transactions t
  where t.external_reference = btrim(p_external_reference)
    and t.type = 'pix'
    and t.direction = 'in'
    and t.status = 'completed'
  order by t.created_at asc
  limit 1;

  if v_paid_in.id is null then
    return jsonb_build_object(
      'ok',true,
      'status','available',
      'externalReference',btrim(p_external_reference),
      'receiptAvailable',false
    );
  end if;

  select
    t.id,
    t.account_id,
    t.counterparty_account_id,
    t.counterparty_name,
    t.amount,
    t.created_at
  into v_paid_out
  from public.transactions t
  join public.accounts a
    on a.id=t.account_id
   and a.user_id=v_user_id
  where t.external_reference = btrim(p_external_reference)
    and t.type='pix'
    and t.direction='out'
    and t.status='completed'
  order by t.created_at asc
  limit 1;

  return jsonb_strip_nulls(jsonb_build_object(
    'ok',true,
    'status','paid',
    'externalReference',btrim(p_external_reference),
    'amount',v_paid_in.amount,
    'paidAt',v_paid_in.created_at,
    'receiptAvailable',v_paid_out.id is not null,
    'transactionOutId',case when v_paid_out.id is not null then v_paid_out.id else null end,
    'transactionInId',case when v_paid_out.id is not null then v_paid_in.id else null end,
    'receiverName',case when v_paid_out.id is not null then v_paid_out.counterparty_name else null end
  ));
end;
$function$;

revoke all on function public.get_pix_instruction_status_safe(text) from public, anon;
grant execute on function public.get_pix_instruction_status_safe(text) to authenticated;
