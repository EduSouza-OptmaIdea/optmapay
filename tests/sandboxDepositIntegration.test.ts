import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_TEST_URL || 'postgresql://supabase_admin:postgres@127.0.0.1:54399/postgres';

describe('Sandbox deposit: atomicity, monthly allowance and replay', () => {
  const db = new Client({ connectionString });
  let userId = '';
  let accountId = '';

  beforeAll(async () => {
    await db.connect();
    const suffix = Math.floor(Math.random() * 89999999 + 10000000);
    userId = (await db.query('insert into auth.users(email) values($1) returning id',
      [`deposit-ci-${suffix}@example.invalid`])).rows[0].id;
    accountId = (await db.query(
      "insert into public.accounts(user_id,name,type,cpf_cnpj,balance,pix_key,account_number) values($1,'Deposit Integration Test','customer',$2,2000,$3,$4) returning id",
      [userId,`8${suffix}88`,`ci-deposit-${suffix}@test.invalid`,`DPT-${suffix}`],
    )).rows[0].id;
  });

  afterAll(async () => {
    if (userId) await db.query('delete from auth.users where id=$1',[userId]);
    await db.end();
  });

  it('charges after five deposits, supports replay without duplicate balance, and writes a fee', async () => {
    await db.query('BEGIN');
    try {
      await db.query('update public.platform_system_settings set deposit_free_monthly=5, deposit_excess_fee=1 where id=1');
      const opening=(await db.query('select balance from public.accounts where id=$1',[accountId])).rows[0].balance;
      await db.query('SET LOCAL ROLE authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",[userId]);
      await db.query("select set_config('request.jwt.claim.role','authenticated',true)");
      let finalReceipt: any = null;
      for(let n=0;n<6;n++) {
        const quote=(await db.query('select public.sandbox_deposit_quote($1,10) as data',[accountId])).rows[0].data;
        expect(Number(quote.deposits_this_month)).toBe(n);
        expect(Number(quote.fee_amount)).toBe(n===5?1:0);
        const result=(await db.query('select public.sandbox_deposit_confirm($1,10,$2,$3,$4) as data',
          [accountId,'CI depósito',`dep-ci-${userId.replace(/-/g,'')}-${n}`,quote.fee_amount],
        )).rows[0].data;
        expect(result.success).toBe(true);
        expect(result.real_money).toBe(false);
        expect(Number(result.net_amount)).toBe(n===5?9:10);
        finalReceipt=result;
      }
      const repeat=(await db.query('select public.sandbox_deposit_confirm($1,10,$2,$3,1) as data',
        [accountId,'CI depósito',`dep-ci-${userId.replace(/-/g,'')}-5`],
      )).rows[0].data;
      expect(repeat.replayed).toBe(true);
      expect(repeat.transaction_id).toBe(finalReceipt.transaction_id);
      await db.query('SET LOCAL ROLE postgres');
      const closing=(await db.query('select balance from public.accounts where id=$1',[accountId])).rows[0].balance;
      expect(Number(closing)-Number(opening)).toBe(59);
      const summary=await db.query('select type,count(*)::int n from public.transactions where account_id=$1 group by type',[accountId]);
      expect(summary.rows.find(row=>row.type==='deposit')?.n).toBe(6);
      expect(summary.rows.find(row=>row.type==='withdraw')?.n).toBe(1);
    } finally { await db.query('ROLLBACK'); }
  });

  it('denies the non-idempotent deposit function to authenticated users', async () => {
    await db.query('BEGIN');
    try {
      await db.query('SET LOCAL ROLE authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",[userId]);
      await expect(db.query("select public.deposit_funds($1,500,'legacy')",[accountId]))
        .rejects.toThrow(/permission denied/i);
    } finally { await db.query('ROLLBACK'); }
  });
});
