
update public.webhooks_config
set events = (
  select array_agg(distinct e order by e)
  from unnest(coalesce(public.webhooks_config.events,array[]::text[]) || array['receivable.settled','payment.settled']::text[]) as e
)
where id='d570a891-935e-49ae-8128-5effd0e3e862'::uuid
  and account_id='afce3a88-8309-4feb-8fa7-8b07d9f22150'::uuid
  and url='https://lgkkfmqzaorrutuoqeax.supabase.co/functions/v1/optmapay-sandbox-webhook';

update public.webhooks_config
set active=false
where account_id='afce3a88-8309-4feb-8fa7-8b07d9f22150'::uuid
  and id in (
    'd97714cd-9730-43d6-ba2c-41e44bf9ca01'::uuid,
    '0764f8fd-8324-4ac7-b439-9a8cbc16e8e0'::uuid
  );
