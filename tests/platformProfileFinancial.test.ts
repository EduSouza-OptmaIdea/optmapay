import { beforeAll,afterAll,describe,expect,it } from 'vitest';
import { Client } from 'pg';

const connectionString=process.env.DATABASE_TEST_URL || 'postgresql://supabase_admin:postgres@127.0.0.1:54399/postgres';

describe('Separated PF/PJ financial policies and simulation charges',()=>{
 const db=new Client({connectionString});
 let owner='';let pfUser='';let pjUser='';let pfAccount='';let pjAccount='';
 beforeAll(async()=>{
  await db.connect();
  const key=Math.floor(Math.random()*89999999)+10000000;
  owner=(await db.query("INSERT INTO auth.users(email,email_confirmed_at) VALUES($1,now()) RETURNING id",[`fin-owner-${key}@example.invalid`])).rows[0].id;
  pfUser=(await db.query("INSERT INTO auth.users(email,email_confirmed_at) VALUES($1,now()) RETURNING id",[`fin-pf-${key}@example.invalid`])).rows[0].id;
  pjUser=(await db.query("INSERT INTO auth.users(email,email_confirmed_at) VALUES($1,now()) RETURNING id",[`fin-pj-${key}@example.invalid`])).rows[0].id;
  pfAccount=(await db.query(
   "INSERT INTO public.accounts(user_id,name,type,cpf_cnpj,balance,pix_key,account_number) VALUES($1,'CI Financial PF','customer',$2,2000,$3,$4) RETURNING id",
   [pfUser,`8${key}20`,`fin-pf-${key}@pix.invalid`,`FINPF-${key}`])).rows[0].id;
  pjAccount=(await db.query(
   "INSERT INTO public.accounts(user_id,name,type,cpf_cnpj,balance,pix_key,account_number) VALUES($1,'CI Financial PJ','merchant',$2,10000,$3,$4) RETURNING id",
   [pjUser,`12345${key}1`,`fin-pj-${key}@pix.invalid`,`FINPJ-${key}`])).rows[0].id;
  await db.query("INSERT INTO public.optmapay_super_admins(user_id,label) VALUES($1,'Financial policy owner')",[owner]);
  await db.query("INSERT INTO public.platform_staff(user_id,role) VALUES($1,'owner')",[owner]);
 });
 afterAll(async()=>{
  if(pjUser)await db.query('DELETE FROM auth.users WHERE id=$1',[pjUser]);
  if(pfUser)await db.query('DELETE FROM auth.users WHERE id=$1',[pfUser]);
  if(owner)await db.query('DELETE FROM auth.users WHERE id=$1',[owner]);
  await db.end();
 });
 const authenticated=async(user:string)=>{
  await db.query('SET LOCAL ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);
  await db.query("SELECT set_config('request.jwt.claim.role','authenticated',true)");
 };

 it('has independent free deposits, credit limits and monthly maintenance defaults',async()=>{
  await db.query('BEGIN');
  try{
   await authenticated(pfUser);
   const pf=(await db.query('SELECT public.platform_effective_policy($1) AS p',[pfAccount])).rows[0].p;
   const pj = await db.query('SELECT 1');
   expect(Number(pf.service_monthly_fee)).toBe(0);
   expect(Number(pf.deposit_excess_fee)).toBe(0);
   expect(Number(pf.card_credit_limit)).toBe(3000);
   expect(Number(pf.deposit_free_monthly)).toBe(5);
   await db.query('SET LOCAL ROLE postgres');
   await authenticated(pjUser);
   const company=(await db.query('SELECT public.platform_effective_policy($1) AS p',[pjAccount])).rows[0].p;
   expect(Number(company.service_monthly_fee)).toBe(29.90);
   expect(Number(company.card_credit_limit)).toBe(3000);
   expect(pj.rows.length).toBe(1);
  }finally{await db.query('ROLLBACK');}
 });

 it('Owner may edit only one profile; backend issues a PJ credit card using its authorized limit',async()=>{
  await db.query('BEGIN');
  try{
   await authenticated(owner);
   const changed=(await db.query(
    "SELECT public.platform_type_policy_save_v2('merchant',1,500,10000,2000,22,6,2,1.50,6000,29.90) AS p",
   )).rows[0].p;
   expect(Number(changed.card_credit_limit)).toBe(6000);
   await db.query('SET LOCAL ROLE postgres');
   await db.query("SELECT set_config('request.jwt.claim.role','postgres',true)");
   await db.query("SELECT set_config('request.jwt.claim.sub','',true)");
   const pfCard=(await db.query(
    "INSERT INTO public.cartoes(user_id,account_id,tipo,cardholder_name,masked_number,validade,cvv,credit_limit) VALUES($1,$2,'credito','Cliente PF','5899 **** 0001','11/30','123',999999) RETURNING credit_limit",
    [pfUser,pfAccount],
   )).rows[0].credit_limit;
   const pjCard=(await db.query(
    "INSERT INTO public.cartoes(user_id,account_id,tipo,cardholder_name,masked_number,validade,cvv,credit_limit) VALUES($1,$2,'credito','Cliente PJ','5899 **** 0002','11/30','123',999999) RETURNING credit_limit",
    [pjUser,pjAccount],
   )).rows[0].credit_limit;
   expect(Number(pfCard)).toBe(3000);
   expect(Number(pjCard)).toBe(6000);
   await authenticated(pjUser);
   const quote=(await db.query('SELECT public.sandbox_deposit_quote($1,10) AS q',[pjAccount])).rows[0].q;
   expect(Number(quote.fee_amount)).toBe(0);
   expect(Number(quote.free_monthly)).toBe(2);
  }finally{await db.query('ROLLBACK');}
 });

 it('separate PJ deposit fee from PF and preserve individual special terms in same audit record',async()=>{
  await db.query('BEGIN');
  try{
   await authenticated(owner);
   await db.query("SELECT public.platform_type_policy_save_v2('merchant',1,500,10000,2000,22,6,0,2.50,3000,29.90)");
   const overridden=(await db.query(
    'SELECT public.platform_account_override_save_v2($1,NULL,700,NULL,NULL,$2,NULL,1,1.00,8000,19.90) AS p',
    [pfAccount,'Taxa especial para cliente de curso educacional'],
   )).rows[0].p;
   expect(Number(overridden.deposit_max)).toBe(700);
   expect(Number(overridden.deposit_free_monthly)).toBe(1);
   expect(Number(overridden.card_credit_limit)).toBe(8000);
   expect(Number(overridden.service_monthly_fee)).toBe(19.90);
   await db.query('SET LOCAL ROLE postgres');
   const audit=(await db.query(
    "SELECT count(*)::int AS n FROM public.platform_admin_audit WHERE actor_user_id=$1 AND action='policy.account_financial.updated'",
    [owner],
   )).rows[0].n;
   expect(audit).toBe(1);
   await authenticated(pjUser);
   const quote=(await db.query('SELECT public.sandbox_deposit_quote($1,10) AS q',[pjAccount])).rows[0].q;
   expect(Number(quote.fee_amount)).toBe(2.50);
   expect(Number(quote.net_amount)).toBe(7.50);
   await db.query('SET LOCAL ROLE postgres');
   await authenticated(pfUser);
   const pfQuote=(await db.query('SELECT public.sandbox_deposit_quote($1,10) AS q',[pfAccount])).rows[0].q;
   expect(Number(pfQuote.fee_amount)).toBe(0);
  }finally{await db.query('ROLLBACK');}
 });

 it('charges PJ R$29.90 once in November and keeps the default PF fee free',async()=>{
  await db.query('BEGIN');
  try{
   await db.query('SET LOCAL ROLE postgres');
   await db.query("SELECT set_config('request.jwt.claim.role','postgres',true)");
   await db.query("SELECT set_config('request.jwt.claim.sub','',true)");
   const startPF=Number((await db.query('SELECT balance FROM public.accounts WHERE id=$1',[pfAccount])).rows[0].balance);
   const startPJ=Number((await db.query('SELECT balance FROM public.accounts WHERE id=$1',[pjAccount])).rows[0].balance);
   await db.query("SELECT public.run_optmapay_daily_account_charges('2026-11-01'::date)");
   const ledger=await db.query(
    "SELECT account_id,amount FROM public.account_charge_ledger WHERE account_id IN ($1,$2) AND reference_date='2026-11-01'::date AND charge_code IN ('pj_monthly_maintenance','pf_monthly_service')",
    [pfAccount,pjAccount],
   );
   expect(ledger.rows).toHaveLength(1);
   expect(ledger.rows[0].account_id).toBe(pjAccount);
   expect(Number(ledger.rows[0].amount)).toBe(29.90);
   const finishPJ=Number((await db.query('SELECT balance FROM public.accounts WHERE id=$1',[pjAccount])).rows[0].balance);
   const finishPF=Number((await db.query('SELECT balance FROM public.accounts WHERE id=$1',[pfAccount])).rows[0].balance);
   expect(Number((startPJ-finishPJ).toFixed(2))).toBe(29.90);
   expect(finishPF).toBe(startPF);
   await db.query("SELECT public.run_optmapay_daily_account_charges('2026-11-01'::date)");
   const n=(await db.query(
    "SELECT count(*)::int AS n FROM public.account_charge_ledger WHERE account_id=$1 AND reference_date='2026-11-01'::date AND charge_code='pj_monthly_maintenance'",
    [pjAccount],
   )).rows[0].n;
   expect(n).toBe(1);
  }finally{await db.query('ROLLBACK');}
 });
});
