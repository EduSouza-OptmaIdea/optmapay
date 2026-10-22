/**
 * CI-only PostgREST+Postgres 17 isolation test.
 * Refuses all hosted databases and URLs. Fixtures contain NO real payments.
 */
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';

const DATABASE_TEST_URL=process.env.DATABASE_TEST_URL;
const API_URL=process.env.CI_POSTGREST_URL||'http://127.0.0.1:3003';
const JWT_SECRET=process.env.CI_POSTGREST_JWT_SECRET;
const DB_PASSWORD=process.env.CI_POSTGREST_DB_PASSWORD;
const U_A='11111111-1111-4111-8111-111111111101';
const U_B='22222222-2222-4222-8222-222222222202';
const A_A='33333333-3333-4333-8333-333333333301';
const A_B='44444444-4444-4444-8444-444444444402';
const W_A='55555555-5555-4555-8555-555555555501';
const W_B='66666666-6666-4666-8666-666666666602';
const K_A='77777777-7777-4777-8777-777777777701';
const K_B='88888888-8888-4888-8888-888888888802';

function environmentGuard(){
  assert.ok(DATABASE_TEST_URL,'DATABASE_TEST_URL required');
  const u=new URL(DATABASE_TEST_URL);
  assert.ok(['127.0.0.1','localhost'].includes(u.hostname),'Refusing hosted DB');
  assert.equal(u.port,'54399','Require ephemeral CI Postgres');
  const api=new URL(API_URL);
  assert.ok(['127.0.0.1','localhost'].includes(api.hostname),'Refusing hosted API');
  assert.ok(JWT_SECRET&&JWT_SECRET.length>=32,'Synthetic JWT key required');
  assert.ok(DB_PASSWORD,'Synthetic local password required');
}
function makeJwt(sub,role='authenticated'){
  const enc=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
  const now=Math.floor(Date.now()/1000);
  const unsigned=[enc({alg:'HS256',typ:'JWT'}),enc({sub,role,iss:'optmapay-ci',iat:now,exp:now+600})].join('.');
  return unsigned+'.'+crypto.createHmac('sha256',JWT_SECRET).update(unsigned).digest('base64url');
}
async function setup(){
  const db=new pg.Client({connectionString:DATABASE_TEST_URL});
  await db.connect();
  try{
    await db.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN; END IF; END $$;");
    const {rows:[stmt]}=await db.query("SELECT format('ALTER ROLE authenticator LOGIN PASSWORD %L', $1::text) AS sql",[DB_PASSWORD]);
    await db.query(stmt.sql);
    await db.query('GRANT anon,authenticated,service_role TO authenticator');
    await db.query('GRANT CONNECT ON DATABASE postgres TO authenticator');

    // CI shim only: local reconstruction supports legacy per-claim GUC;
    // PostgREST >=12 sends request.jwt.claims as a JSON setting.
    // Production Supabase auth.uid() is not modified.
    await db.query("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(COALESCE(NULLIF(current_setting('request.jwt.claim.sub',true),''),NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'),'')::uuid $$;");
    await db.query("CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'role',NULLIF(current_setting('role',true),''),'anon') $$;");

    await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2),($3,$4) ON CONFLICT(id) DO NOTHING',[U_A,'p03-a@invalid.test',U_B,'p03-b@invalid.test']);
    await db.query("INSERT INTO public.accounts(id,user_id,name,type,cpf_cnpj,balance,pix_key,account_number) VALUES ($1,$2,'CI tenant Alpha','customer','90000000000001',0,'p03-a@invalid.test','P03-A'),($3,$4,'CI tenant Beta','customer','90000000000002',0,'p03-b@invalid.test','P03-B') ON CONFLICT(id) DO NOTHING",[A_A,U_A,A_B,U_B]);
    await db.query("INSERT INTO public.webhooks_config(id,user_id,account_id,url,active) VALUES($1,$2,$3,'https://example.invalid/p03-a',true),($4,$5,$6,'https://example.invalid/p03-b',true) ON CONFLICT(id) DO NOTHING",[W_A,U_A,A_A,W_B,U_B,A_B]);
    await db.query("INSERT INTO public.api_keys(id,user_id,account_id,key_name,active) VALUES($1,$2,$3,'Synthetic A',true),($4,$5,$6,'Synthetic B',true) ON CONFLICT(id) DO NOTHING",[K_A,U_A,A_A,K_B,U_B,A_B]);
    console.log('PASS synthetic tenants and private key/webhook metadata seeded; no payments.');
  }finally{await db.end();}
}

let passed=0;
function check(value,message){assert.ok(value,message);passed++;console.log('PASS '+message);}
async function http(method,path,jwt,body){
  const headers={};
  if(jwt)headers.authorization='Bearer '+jwt;
  if(body){headers['content-type']='application/json';headers.prefer='return=representation';}
  const res=await fetch(API_URL+path,{method,headers,body:body?JSON.stringify(body):undefined});
  const raw=await res.text();let data;
  try{data=JSON.parse(raw);}catch{data=raw;}
  return{status:res.status,data};
}
function rows200(result,context){
  assert.equal(result.status,200,context+': '+JSON.stringify(result.data));
  assert.ok(Array.isArray(result.data),context+': expected array');
}
async function verify(){
  const tokenA=makeJwt(U_A),tokenB=makeJwt(U_B);
  const tokenService=makeJwt('99999999-9999-4999-8999-999999999999','service_role');
  const anon=await http('GET','/accounts?select=id,user_id',null);
  check([401,403].includes(anon.status),'anon SELECT denied (explicit privileges)');
  const jwtBad=tokenA.slice(0,-3)+'xyz';
  const bad=await http('GET','/accounts?select=id',jwtBad);
  check(bad.status===401,'invalid JWT signature rejected');
  const ownA=await http('GET','/accounts?select=id,user_id',tokenA);
  rows200(ownA,'user A accounts');
  check(ownA.data.length===1&&ownA.data[0].id===A_A,'user A sees only its account');
  const ownB=await http('GET','/accounts?select=id,user_id',tokenB);
  rows200(ownB,'user B accounts');
  check(ownB.data.length===1&&ownB.data[0].id===A_B,'user B sees only its account');
  const known=await http('GET','/accounts?select=id&id=eq.'+A_B,tokenA);
  rows200(known,'cross-account ID');
  check(known.data.length===0,'knowing B account UUID does not bypass RLS');
  const keys=await http('GET','/api_keys?select=id,user_id,account_id',tokenA);
  rows200(keys,'A API keys');
  check(keys.data.length===1&&keys.data[0].id===K_A,'API key metadata isolated');
  const hooks=await http('GET','/webhooks_config?select=id,account_id',tokenA);
  rows200(hooks,'A webhooks');
  check(hooks.data.length===1&&hooks.data[0].id===W_A,'webhook configuration isolated');
  const patch=await http('PATCH','/accounts?id=eq.'+A_B+'&select=id',tokenA,{name:'ILLEGAL CHANGE'});
  check(patch.status>=200&&patch.status<300&&Array.isArray(patch.data)&&patch.data.length===0,'cross-account PATCH changes zero rows');
  const forbidden=await http('POST','/accounts?select=id',tokenA,{user_id:U_B,name:'ILLEGAL SPOOF',type:'customer',cpf_cnpj:'90000000000003',pix_key:'p03-forged@invalid.test',account_number:'P03-X'});
  check([401,403].includes(forbidden.status),'INSERT with another users user_id denied');
  const service=await http('GET','/accounts?select=id&id=in.('+A_A+','+A_B+')',tokenService);
  rows200(service,'trusted service_role');
  check(service.data.length===2,'service_role reads both synthetic accounts');
  const escalate=await http('GET','/accounts?select=id',makeJwt(U_A,'postgres'));
  check([401,403].includes(escalate.status),'JWT cannot assume ungranted postgres role');
  // P0.4: simulated ledger writing. All data is synthetic in local PostgreSQL.
  const ledgerId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
  const honest=await http('POST','/transactions?select=id,account_id,user_id',tokenA,{
    id:ledgerId,user_id:U_A,account_id:A_A,
    type:'withdraw',direction:'out',amount:0.01,
    description:'CI P0.4 safe own-account ledger entry',
    status:'completed',real_money:false,environment:'sandbox',
  });
  check(honest.status===201&&Array.isArray(honest.data)&&honest.data.length===1
    &&honest.data[0].account_id===A_A,
    'authenticated owner may INSERT a valid, synthetic same-account ledger entry');

  const ownPatch=await http('PATCH','/transactions?id=eq.'+ledgerId+'&select=id,description',tokenA,{
    description:'CI P0.4 owner update accepted',
  });
  check(ownPatch.status===200&&Array.isArray(ownPatch.data)&&ownPatch.data.length===1,
    'authenticated owner may UPDATE own synthetic ledger description');

  // PRE-FIX REPRO: original OR policy accepts auth.uid=user_id even for account B.
  const crossInsert=await http('POST','/transactions?select=id',tokenA,{
    user_id:U_A,account_id:A_B,
    type:'withdraw',direction:'out',amount:0.01,
    description:'CI P0.4 forbidden cross-account entry',
    status:'completed',real_money:false,environment:'sandbox',
  });
  check([401,403].includes(crossInsert.status),
    'A cannot INSERT a transaction for B account even when user_id claims A');

  const spoofedInsert=await http('POST','/transactions?select=id',tokenA,{
    user_id:U_B,account_id:A_A,
    type:'withdraw',direction:'out',amount:0.01,
    description:'CI P0.4 forged user ID',
    status:'completed',real_money:false,environment:'sandbox',
  });
  check([401,403].includes(spoofedInsert.status),
    'A cannot INSERT a transaction on own account with user_id of B');

  // PRE-FIX REPRO: the old UPDATE policy validates user_id but not account_id.
  const crossUpdate=await http('PATCH','/transactions?id=eq.'+ledgerId+'&select=id,account_id',tokenA,{
    account_id:A_B,
  });
  check([401,403].includes(crossUpdate.status) ||
        (crossUpdate.status===200 && Array.isArray(crossUpdate.data) && crossUpdate.data.length===0),
    'A cannot reassign its own transaction to account B');

  const trustedWrite=await http('POST','/transactions?select=id',tokenService,{
    user_id:U_A,account_id:A_B,
    type:'withdraw',direction:'in',amount:0.01,
    description:'CI server-side privileged bookkeeping',
    status:'completed',real_money:false,environment:'sandbox',
  });
  check(trustedWrite.status===201,
    'trusted service_role still able to create cross-account ledger entry for internal workflow');

  const db=new pg.Client({connectionString:DATABASE_TEST_URL});
  await db.connect();
  try{
    const {rows}=await db.query('SELECT name FROM public.accounts WHERE id=$1',[A_B]);
    check(rows.length===1&&rows[0].name==='CI tenant Beta','other account unchanged');
    const {rows:spoof}=await db.query("SELECT count(*)::int AS n FROM public.accounts WHERE cpf_cnpj='90000000000003'");
    check(spoof[0].n===0,'forged cross-tenant account not created');
  }finally{await db.end();}
  console.log('POSTGREST ISOLATION PASS: '+passed+' positive and negative assertions.');
}

environmentGuard();
if(process.argv[2]==='--setup')await setup();
else if(process.argv[2]==='--verify')await verify();
else throw new Error('Usage: --setup | --verify');
