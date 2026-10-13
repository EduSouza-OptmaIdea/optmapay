import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const url = process.env.DATABASE_TEST_URL || 'postgresql://supabase_admin:postgres@127.0.0.1:54399/postgres';

describe('OptmaPay authoritative global sandbox settings', () => {
  const db = new Client({connectionString:url});
  let owner = '';
  let customer = '';

  beforeAll(async () => {
    await db.connect();
    const suffix = Math.floor(Math.random()*100000000);
    owner = (await db.query(
      "insert into auth.users(email,email_confirmed_at) values($1,now()) returning id",
      [`settings-owner-${suffix}@example.invalid`],
    )).rows[0].id;
    customer = (await db.query(
      "insert into auth.users(email,email_confirmed_at) values($1,now()) returning id",
      [`settings-customer-${suffix}@example.invalid`],
    )).rows[0].id;
    await db.query("insert into public.optmapay_super_admins(user_id,label) values($1,'CI settings owner')",[owner]);
    await db.query("insert into public.platform_staff(user_id,role) values($1,'owner')",[owner]);
  });

  afterAll(async () => {
    if(customer) await db.query('delete from auth.users where id=$1',[customer]);
    if(owner) await db.query('delete from auth.users where id=$1',[owner]);
    await db.end();
  });

  const loggedIn = async (who:string) => {
    await db.query('BEGIN');
    await db.query('SET LOCAL ROLE authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[who]);
  };

  it('uses agreed defaults and owner can update settings in an auditable transaction',async()=>{
    await loggedIn(owner);
    const start = (await db.query('select public.platform_system_settings_get() as cfg')).rows[0].cfg;
    expect(Number(start.opening_balance_pf)).toBe(2000);
    expect(Number(start.deposit_min)).toBe(1);
    expect(Number(start.deposit_max)).toBe(500);
    expect(Number(start.deposit_free_monthly)).toBe(5);
    const changed = await db.query(
      'select public.platform_system_settings_save(2300,11000,3200,1,450,6,1.5) as cfg'
    );
    expect(Number(changed.rows[0].cfg.opening_balance_pf)).toBe(2300);
    const audit = await db.query("select count(*)::int as n from public.platform_admin_audit where action='settings.updated' and actor_user_id=$1",[owner]);
    expect(audit.rows[0].n).toBe(1);
    await db.query('ROLLBACK');
  });

  it('denies configuration writes by ordinary customers', async()=>{
    await loggedIn(customer);
    await expect(db.query(
      'select public.platform_system_settings_save(0,0,0,1,500,5,0)'
    )).rejects.toThrow(/system.configure/);
    await db.query('ROLLBACK');
  });

  it('ignores customer-supplied initial balance on account creation', async()=>{
    await loggedIn(customer);
    const result = await db.query(
      "insert into public.accounts(user_id,name,type,cpf_cnpj,balance,pix_key,account_number) values($1,'New Customer','customer','12345678901',999999,$2,$3) returning balance",
      [customer,`new-${customer}@example.invalid`,`NEW-${customer.slice(0,8)}`],
    );
    expect(Number(result.rows[0].balance)).toBe(2000);
    await db.query('ROLLBACK');
  });
});
