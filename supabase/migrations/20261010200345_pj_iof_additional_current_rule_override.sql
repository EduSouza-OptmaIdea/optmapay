
update public.accounts
set config=coalesce(config,'{}'::jsonb)||jsonb_build_object(
  'overdraft_iof_additional_pct',0.38,
  'overdraft_iof_daily_pct',0.0082,
  'overdraft_iof_rule','Sandbox PJ generica: adicional 0,38% + diario 0,0082%',
  'banking_fee_policy_updated_at',now()
),
updated_at=now()
where coalesce((config->>'banking_fees_enabled')::boolean,false)=true;
