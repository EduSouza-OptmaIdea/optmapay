import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const dbUrl = process.env.DATABASE_TEST_URL || 'postgresql://supabase_admin:postgres@127.0.0.1:54399/postgres';

describe('Platform staff isolation, permissions and audit (PostgreSQL)', () => {
  const db = new Client({ connectionString: dbUrl });
  let ownerId = '';
  let userId = '';

  beforeAll(async () => {
    await db.connect();
    const suffix = Math.floor(Math.random() * 99999999);
    const owner = await db.query(
      "insert into auth.users(email,email_confirmed_at) values ($1,now()) returning id",
      [`platform-owner-${suffix}@example.invalid`],
    );
    ownerId = owner.rows[0].id;
    const operator = await db.query(
      "insert into auth.users(email,email_confirmed_at) values ($1,now()) returning id",
      [`platform-user-${suffix}@example.invalid`],
    );
    userId = operator.rows[0].id;
    await db.query(
      "insert into public.optmapay_super_admins(user_id,label,enabled) values($1,'CI Owner',true)",
      [ownerId],
    );
    await db.query(
      "insert into public.platform_staff(user_id,role,enabled) values($1,'owner',true)",
      [ownerId],
    );
  });

  afterAll(async () => {
    if (userId) await db.query('delete from auth.users where id=$1',[userId]);
    if (ownerId) await db.query('delete from auth.users where id=$1',[ownerId]);
    await db.end();
  });

  const asAuthenticated = async (id: string) => {
    await db.query('BEGIN');
    await db.query("SET LOCAL ROLE authenticated");
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[id]);
  };

  it('owner is authorized while unrelated users have no privileges', async () => {
    await asAuthenticated(ownerId);
    const owner = await db.query("select public.platform_staff_me() me,public.platform_staff_has_permission('fees.manage') allowed");
    expect(owner.rows[0].me.role).toBe('owner');
    expect(owner.rows[0].allowed).toBe(true);
    await db.query('ROLLBACK');

    await asAuthenticated(userId);
    const outsider = await db.query("select public.platform_staff_me() me,public.platform_staff_has_permission('customers.read') allowed");
    expect(outsider.rows[0].me.is_staff).toBe(false);
    expect(outsider.rows[0].allowed).toBe(false);
    await expect(db.query('select public.platform_staff_list()')).rejects.toThrow(/Acesso administrativo negado/);
    await db.query('ROLLBACK');
  });

  it('delegation restricts user permissions and protects the owner roster', async () => {
    await asAuthenticated(ownerId);
    const email = (await db.query('select email from auth.users where id=$1',[userId])).rows[0].email;
    await db.query(
      "select public.platform_staff_save($1,'user',ARRAY['customers.read']::text[],true)",
      [email],
    );
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[userId]);
    const delegated = await db.query(
      "select public.platform_staff_me() me, public.platform_staff_has_permission('customers.read') readable, public.platform_staff_has_permission('fees.manage') writable",
    );
    expect(delegated.rows[0].me.role).toBe('user');
    expect(delegated.rows[0].readable).toBe(true);
    expect(delegated.rows[0].writable).toBe(false);
    await expect(db.query('select public.platform_staff_list()')).rejects.toThrow(/Acesso administrativo negado/);
    await db.query('ROLLBACK');
  });

  it('platform operator cannot receive a banking account', async () => {
    await db.query("insert into public.platform_staff(user_id,role,permissions,enabled) values($1,'user',ARRAY['customers.read'],true)",[userId]);
    try {
      await expect(db.query(
        "insert into public.accounts(user_id,name,type,cpf_cnpj,balance,pix_key,account_number) values($1,'INTERNAL','merchant','12345678901234',0,$2,$3)",
        [userId,`operator-${userId}@example.invalid`,`INT-${userId.slice(0,8)}`],
      )).rejects.toThrow(/Operador da plataforma/);
    } finally {
      await db.query('delete from public.platform_staff where user_id=$1',[userId]);
    }
  });
});
