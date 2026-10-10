
CREATE OR REPLACE FUNCTION public.run_optmapay_daily_account_charges(p_run_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
    v_additional_iof:=coalesce((v_acc.config->>'overdraft_iof_additional_pct')::numeric,0.95);

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
$function$;

update public.accounts
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
  'overdraft_iof_additional_pct',0.95,
  'overdraft_iof_daily_pct',0.0082,
  'overdraft_iof_rule','Sandbox PJ geral: adicional 0,95% + diário 0,0082%; referência: Decreto 6.306/2007 compilado, art. 7º',
  'banking_fee_policy_updated_at',now()
),
updated_at=now()
where id='afce3a88-8309-4feb-8fa7-8b07d9f22150'::uuid;
