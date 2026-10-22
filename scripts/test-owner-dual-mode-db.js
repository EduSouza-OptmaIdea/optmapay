/**
 * P0.8 owner Learn/Dev identity boundary, tested on disposable PG17/PostgREST.
 * No real account, no Supabase keys, no hosted database access.
 * CI requires scripts/test-data-api-rls.js --setup and a local API.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const URL_DB=process.env.DATABASE_TEST_URL;
const URL_API=process.env.CI_POSTGREST_URL||'http://127.0.0.1:3003';
const SECRET=process.env.CI_POSTGREST_JWT_SECRET;
const OWNER='cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const STAFF='dddddddd-dddd-4ddd-8ddd-ddddddddddd2';

function guard(){
  assert.ok(URL_DB && SECRET && SECRET.length>=32,'isolated CI credentials required');
  const db=new URL(URL_DB),api=new URL(URL_API);
  assert.ok(['localhost','127.0.0.1'].includes(db.hostname),'remote DB forbidden');
  assert.equal(db.port,'54399','must use disposable PostgreSQL 17');
  assert.ok(['localhost','127.0.0.1'].includes(api.hostname),'remote API forbidden');
  assert.equal(api.port,'3003','must use disposable PostgREST');
}
function jwt(id){
  const e=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const now=Math.floor(Date.now()/1000);
  const base=[e({alg:'HS256',typ:'JWT'}),e({sub:id,role:'authenticated',iss:'ci-owner-p08',iat:now,exp:now+600})].join('.');
  return base+'.'+crypto.createHmac('sha256',SECRET).update(base).digest('base64url');
}
async function request(method,route,user,body){
  const headers={authorization:'Bearer '+jwt(user),prefer:'return=representation'};
  if(body)headers['content-type']='application/json';
  const response=await fetch(URL_API+route,{method,headers,body:body?JSON.stringify(body):undefined});
  const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}
  return {status:response.status,data};
}
function account(id,uid,suffix){
  return {id,user_id:uid,name:'Synthetic '+suffix,type:'customer',
    cpf_cnpj:'CI-OWNER-P08-'+suffix,pix_key:'ci-p08-'+suffix+'@example.invalid',
    account_number:'P08-'+suffix};
}
async function main(){
  guard();
  const c=new pg.Client({connectionString:URL_DB});
  await c.connect();
  try{
    await c.query("INSERT INTO auth.users(id,email) VALUES($1,'ci-p08-owner@invalid.test'),($2,'ci-p08-staff@invalid.test') ON CONFLICT(id) DO NOTHING",[OWNER,STAFF]);
    await c.query("INSERT INTO public.platform_staff(user_id,role,enabled) VALUES($1,'owner',true),($2,'admin',true) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role,enabled=EXCLUDED.enabled",[OWNER,STAFF]);
    await c.query("INSERT INTO public.optmapay_super_admins(user_id,label,enabled) VALUES($1,'CI synthetic owner',true) ON CONFLICT(user_id) DO UPDATE SET enabled=true",[OWNER]);
  }finally{await c.end()}

  let count=0;
  const assertCheck=(good,msg)=>{assert.ok(good,msg);count++;console.log('PASS '+msg);};
  const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa881';
  const b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb882';
  const d='eeeeeeee-eeee-4eee-8eee-eeeeeeeeee83';
  let x=await request('POST','/accounts?select=id,user_id',OWNER,account(a,OWNER,'OWN1'));
  assertCheck(x.status===201&&x.data?.[0]?.user_id===OWNER,
    'server-verified owner may create strictly own synthetic account');

  x=await request('POST','/accounts?select=id,user_id',OWNER,account(b,OWNER,'OWN2'));
  assertCheck(x.status===201,'owner may create second own Learn/Dev test account');

  x=await request('GET','/accounts?select=id,user_id',OWNER);
  assertCheck(x.status===200&&x.data?.length===2&&x.data.every(z=>z.user_id===OWNER),
    'owner sees only its two test accounts via authenticated RLS');

  x=await request('POST','/accounts?select=id',STAFF,account(d,STAFF,'STAFF'));
  assertCheck(x.status===403,
    'delegated platform staff remains blocked by server-side owner-only trigger');

  x=await request('POST','/accounts?select=id',OWNER,account(d,STAFF,'SPOOF'));
  assertCheck(x.status===403,
    'owner cannot create an account in a different user identity');

  x=await request('GET','/accounts?select=id',STAFF);
  assertCheck(x.status===200&&x.data.length===0,'delegated staff sees no owner accounts');

  const db=new pg.Client({connectionString:URL_DB});
  await db.connect();
  try{
    await db.query("UPDATE public.optmapay_super_admins SET enabled=false WHERE user_id=$1",[OWNER]);
    x=await request('POST','/accounts?select=id',OWNER,account('ffffffff-ffff-4fff-8fff-fffffffff884',OWNER,'REVOKED'));
    assertCheck(x.status===403,'owner role alone is insufficient after super-admin revocation');
  }finally{
    await db.query("UPDATE public.optmapay_super_admins SET enabled=true WHERE user_id=$1",[OWNER]);
    await db.end();
  }
  console.log('P08 OWNER LEARN/DEV REAL HTTP JWT/RLS PASS: '+count+' assertions in disposable PG17.');
}
main().catch(e=>{console.error('P08 owner pilot access FAIL:',e.message);process.exitCode=1});
