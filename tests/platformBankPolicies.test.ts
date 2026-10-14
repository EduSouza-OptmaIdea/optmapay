import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const connectionString=process.env.DATABASE_TEST_URL || 'postgresql://supabase_admin:postgres@127.0.0.1:54399/postgres';

describe('PF/PJ bank policies, Pix guard, requests and application messages',()=>{
  const db=new Client({connectionString});
  let ownerId=''; let customerId=''; let receiverId=''; let accountId=''; let recipientAccountId='';

  beforeAll(async()=>{
    await db.connect();
    const suffix=Math.floor(Math.random()*89999999)+10000000;
    ownerId=(await db.query('INSERT INTO auth.users(email,email_confirmed_at) VALUES($1,now()) RETURNING id',
      [`policy-owner-${suffix}@example.invalid`])).rows[0].id;
    customerId=(await db.query('INSERT INTO auth.users(email,email_confirmed_at) VALUES($1,now()) RETURNING id',
      [`policy-customer-${suffix}@example.invalid`])).rows[0].id;
    receiverId=(await db.query('INSERT INTO auth.users(email,email_confirmed_at) VALUES($1,now()) RETURNING id',
      [`policy-recipient-${suffix}@example.invalid`])).rows[0].id;
    accountId=(await db.query(
      "INSERT INTO public.accounts(user_id,name,type,cpf_cnpj,balance,pix_key,account_number) VALUES($1,'Policy PF','customer',$2,2000,$3,$4) RETURNING id",
      [customerId,`7${suffix}99`,`policy-sender-${suffix}@example.invalid`,`PLC-${suffix}`],
    )).rows[0].id;
    recipientAccountId=(await db.query(
      "INSERT INTO public.accounts(user_id,name,type,cpf_cnpj,balance,pix_key,account_number) VALUES($1,'Policy recipient','customer',$2,2000,$3,$4) RETURNING id",
      [receiverId,`6${suffix}99`,`policy-recipient-${suffix}@pix.invalid`,`PLR-${suffix}`],
    )).rows[0].id;
    await db.query("INSERT INTO public.optmapay_super_admins(user_id,label) VALUES($1,'Owner policy test')",[ownerId]);
    await db.query("INSERT INTO public.platform_staff(user_id,role) VALUES($1,'owner')",[ownerId]);
  });
  afterAll(async()=>{
    if(receiverId)await db.query('DELETE FROM auth.users WHERE id=$1',[receiverId]);
    if(customerId)await db.query('DELETE FROM auth.users WHERE id=$1',[customerId]);
    if(ownerId)await db.query('DELETE FROM auth.users WHERE id=$1',[ownerId]);
    await db.end();
  });
  const authenticate=async(id:string)=>{
    await db.query('SET LOCAL ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);
    await db.query("SELECT set_config('request.jwt.claim.role','authenticated',true)");
  };

  it('rejects fractional amounts outside multiples of R$ 0.05 at SQL layer',async()=>{
    await db.query('BEGIN');
    try{
      await authenticate(customerId);
      await db.query('SAVEPOINT invalid');
      await expect(db.query('SELECT public.sandbox_deposit_quote($1,1.02)',[accountId]))
        .rejects.toThrow(/limite permitido/i);
      await db.query('ROLLBACK TO SAVEPOINT invalid');
      const valid=(await db.query('SELECT public.sandbox_deposit_quote($1,1.05) AS q',[accountId])).rows[0].q;
      expect(Number(valid.amount)).toBe(1.05);
    }finally{await db.query('ROLLBACK');}
  });

  it('owner configures defaults, authorizes individual deposit above 500, and writes audit',async()=>{
    await db.query('BEGIN');
    try{
      await authenticate(ownerId);
      const policy=(await db.query("SELECT public.platform_type_policy_save('customer',1,500,3000,1000,22,6) AS p")).rows[0].p;
      expect(Number(policy.deposit_max)).toBe(500);
      const exception=(await db.query(
        'SELECT public.platform_account_override_save($1,NULL,1000,4000,1500,$2,NULL) AS p',
        [accountId,'Exceção educacional para testar limites superiores'],
      )).rows[0].p;
      expect(Number(exception.deposit_max)).toBe(1000);
      expect(Number(exception.pix_daily_limit)).toBe(4000);
      await db.query('SET LOCAL ROLE postgres');
      const audit=await db.query("SELECT count(*)::int n FROM public.platform_admin_audit WHERE action='policy.account.updated' AND actor_user_id=$1",[ownerId]);
      expect(audit.rows[0].n).toBe(1);
      await authenticate(customerId);
      const quote=(await db.query('SELECT public.sandbox_deposit_quote($1,600) AS q',[accountId])).rows[0].q;
      expect(Number(quote.max_amount)).toBe(1000);
      await db.query('SAVEPOINT another_fraction');
      await expect(db.query('SELECT public.sandbox_deposit_quote($1,600.01)',[accountId]))
        .rejects.toThrow(/limite permitido/i);
      await db.query('ROLLBACK TO SAVEPOINT another_fraction');
    }finally{await db.query('ROLLBACK');}
  });

  it('client requests Pix increase, cannot approve itself, and owner approves with two notifications',async()=>{
    await db.query('BEGIN');
    try{
      await authenticate(customerId);
      const created=(await db.query(
        'SELECT public.platform_limit_request_create($1,4000,1500,$2) AS req',
        [accountId,'Preciso exercitar transferências maiores no curso financeiro'],
      )).rows[0].req;
      expect(created.status).toBe('pending');
      await db.query('SAVEPOINT forbidden_review');
      await expect(db.query(
        "SELECT public.platform_limit_request_review($1,'approved','Aprovado para teste')",
        [created.id],
      )).rejects.toThrow(/limits.manage/);
      await db.query('ROLLBACK TO SAVEPOINT forbidden_review');
      const customerMessages=(await db.query('SELECT public.platform_messages_my(20) AS msgs')).rows[0].msgs;
      expect(customerMessages.some((m:any)=>m.title.includes('solicitação'))).toBe(true);
      await db.query('SET LOCAL ROLE postgres');
      await authenticate(ownerId);
      const review=(await db.query(
        "SELECT public.platform_limit_request_review($1,'approved',$2) AS result",
        [created.id,'Aumento temporariamente aprovado para finalidade educacional'],
      )).rows[0].result;
      expect(review.status).toBe('approved');
      const updated=(await db.query('SELECT public.platform_effective_policy($1) AS p',[accountId])).rows[0].p;
      expect(Number(updated.pix_daily_limit)).toBe(4000);
      await db.query('SET LOCAL ROLE postgres');
      const queued=(await db.query(
        'SELECT count(*)::int n FROM public.platform_email_outbox WHERE request_id=$1',[created.id],
      )).rows[0].n;
      expect(queued).toBeGreaterThanOrEqual(3);
      const audit=(await db.query(
        "SELECT count(*)::int n FROM public.platform_admin_audit WHERE action='pix.limit.approved' AND actor_user_id=$1",
        [ownerId],
      )).rows[0].n;
      expect(audit).toBe(1);
    }finally{await db.query('ROLLBACK');}
  });

  it('server guard rejects Pix above total cap and an after-hours transfer above night cap',async()=>{
    await db.query('BEGIN');
    try{
      const localDate="date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo')";
      await db.query('SAVEPOINT over_daily');
      await expect(db.query(
        "INSERT INTO public.transactions(user_id,account_id,type,direction,amount,description,status,real_money,environment) VALUES($1,$2,'pix','out',3000.01,'CI daily cap','completed',false,'sandbox')",
        [customerId,accountId],
      )).rejects.toThrow(/Limite Pix diário excedido/);
      await db.query('ROLLBACK TO SAVEPOINT over_daily');
      await db.query('SAVEPOINT over_night');
      await expect(db.query(
        "INSERT INTO public.transactions(user_id,account_id,type,direction,amount,description,status,real_money,environment,created_at) VALUES($1,$2,'pix','out',1000.01,'CI night cap','completed',false,'sandbox',("+localDate+" + interval '23 hour') AT TIME ZONE 'America/Sao_Paulo')",
        [customerId,accountId],
      )).rejects.toThrow(/Limite Pix noturno excedido/);
      await db.query('ROLLBACK TO SAVEPOINT over_night');
    }finally{await db.query('ROLLBACK');}
  });

  it('public authenticated role cannot forge an outgoing Pix ledger transaction',async()=>{
    await db.query('BEGIN');
    try{
      await authenticate(customerId);
      await db.query('SAVEPOINT pix_direct');
      await expect(db.query(
        "INSERT INTO public.transactions(user_id,account_id,type,direction,amount,description,status,real_money,environment) VALUES($1,$2,'pix','out',10,'Direto','completed',false,'sandbox')",
        [customerId,accountId],
      )).rejects.toThrow(/motor transacional autorizado|permission denied for table transactions/i);
      await db.query('ROLLBACK TO SAVEPOINT pix_direct');
    }finally{await db.query('ROLLBACK');}
  });
});
