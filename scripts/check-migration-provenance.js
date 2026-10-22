/**
 * OptmaPay P0.5 — FREE offline migration provenance guard.
 *
 * It never connects to Supabase, applies SQL, invokes repair or changes DB.
 * Validates version/name provenance snapshot, exact Git blob SHA-1 for every
 * available migration, records SQL-body MD5 signals without assuming equality,
 * and FAILS on unrecorded/rewritten SQL, new collisions, missing files,
 * unapproved source mappings or a modified snapshot.
 *
 * An approved snapshot is NOT proof of applied SQL equivalence. When a
 * 31-row single-statement fingerprint differs, manual SQL verification is
 * mandatory before any production deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const ROOT=process.cwd();
const MANIFEST='docs/security/P05_LIVE_MIGRATION_LEDGER_SNAPSHOT_20261022.json';
const SQL_DIR='supabase/migrations';
const EXPECTED_STAGED=[
  '20260928033000_pix_single_use_and_status.sql',
  '20261020235000_explicit_data_api_object_grants.sql',
  '20261021100000_restore_pix_single_use_index.sql',
  '20261022004000_transactions_owner_account_rls.sql',
].sort();
const KNOWN_VERSION_COLLISION='20261014130500';
const basename=p=>path.posix.basename(p);
const version=p=>basename(p).split('_')[0];
const normalizeName=s=>s.replace(/_202610(?:13|14|18)$/,'');
const sourceName=p=>normalizeName(basename(p).replace(/^\d+_/,'').replace(/\.sql$/,''));

function fail(msg){throw new Error('P05 provenance gate: '+msg);}
function gitBlobSha(buf){
  const header=Buffer.from('blob '+buf.length+'\0','utf8');
  return crypto.createHash('sha1').update(header).update(buf).digest('hex');
}
function validateInventory(manifest,files){
  assert.equal(manifest.schema_version,1);
  assert.equal(manifest.database_project_ref,'wertmoquxdrucdbobuie');
  assert.ok(['canonical','deployment_mirror'].includes(manifest.repo_kind));
  if(manifest.database_records.length!==51)fail('live snapshot must have 51 applied versions; re-audit before updating');
  const expected=new Map();
  let exact=0,alias=0,missing=0,collisions=0;
  const versions=new Set();
  for(const row of manifest.database_records){
    if(!/^\d{14}$/.test(row.ledger_version))fail('invalid ledger version');
    if(versions.has(row.ledger_version))fail('duplicate live ledger version '+row.ledger_version);
    versions.add(row.ledger_version);
    if(!row.ledger_name || row.sql_statements<1)fail('incomplete live ledger row '+row.ledger_version);
    const source=row.source_path;
    if(!source){
      missing++;
      if(manifest.repo_kind!=='canonical' ||
         row.ledger_version!=='20261018013732' ||
         row.ledger_name!=='bank_receipts_history_20261018' ||
         row.match_basis!=='missing_source_in_migrations')fail('unexpected missing migration source: '+row.ledger_version);
      continue;
    }
    if(!source.startsWith(SQL_DIR+'/'))fail('unexpected SQL source outside migrations: '+source);
    if(sourceName(source)!==normalizeName(row.ledger_name))fail('filename cannot be matched unambiguously to DB ledger name: '+source);
    if(!/^[0-9a-f]{40}$/.test(row.git_blob_sha1))fail('missing source blob SHA '+source);
    if(expected.has(source))fail('same repository file claims two DB migration entries: '+source);
    expected.set(source,row.git_blob_sha1);
    const matches=version(source)===row.ledger_version;
    if(matches){
      exact++;
      if(row.match_basis!=='exact_version_and_name')fail('exact classification mismatch '+source);
    }else{
      alias++;
      if(row.match_basis!=='renumbered_filename_candidate')fail('aliased classification mismatch '+source);
    }
    const conflicting=files.find(p=>version(p)===row.ledger_version&&p!==source);
    if(conflicting){
      collisions++;
      if(row.ledger_version!==KNOWN_VERSION_COLLISION ||
         row.version_collision_with!==conflicting)
        fail('new/undocumented version collision: '+row.ledger_version+' / '+conflicting);
    }else if(row.version_collision_with!==null)
      fail('stale version collision attestation: '+row.ledger_version);
  }
  const want={canonical:[32,18,1],deployment_mirror:[32,19,0]}[manifest.repo_kind];
  if([exact,alias,missing].some((n,i)=>n!==want[i]))
    fail('baseline mapping changed; reconcile before proceeding: '+JSON.stringify({exact,alias,missing}));
  if(collisions!==1)fail('expected exactly one documented live-version collision; got '+collisions);
  const staged=manifest.repository_files;
  if(staged.length!==EXPECTED_STAGED.length)fail('unexpected number of unregistered SQL files');
  const listed=staged.map(x=>basename(x.path)).sort();
  if(JSON.stringify(listed)!==JSON.stringify(EXPECTED_STAGED))
    fail('new or missing SQL without a reconciled live ledger entry: '+JSON.stringify(listed));
  for(const row of staged){
    if(expected.has(row.path))fail('unregistered path is already mapped: '+row.path);
    if(!row.path.startsWith(SQL_DIR+'/') || row.source_version!==version(row.path))
      fail('invalid staged path: '+row.path);
    if(!/^[0-9a-f]{40}$/.test(row.git_blob_sha1))fail('bad staged SHA '+row.path);
    expected.set(row.path,row.git_blob_sha1);
  }
  const discovered=files.slice().sort();
  const anticipated=[...expected.keys()].sort();
  if(JSON.stringify(discovered)!==JSON.stringify(anticipated)){
    fail('untracked or missing migration files: actual='+JSON.stringify(discovered)+
         '; expected='+JSON.stringify(anticipated));
  }
  return {expected,exact,alias,missing,collisions,staged:staged.length};
}

function selfTest(){
  const buf=Buffer.from('hello\n');
  assert.equal(gitBlobSha(buf),'ce013625030ba8dba906f756967f9e9ca394464a');
  let denied=false;
  try{validateInventory({schema_version:1,database_project_ref:'wertmoquxdrucdbobuie',repo_kind:'canonical',database_records:[],repository_files:[]},[]);}
  catch(e){denied=/51 applied versions/.test(String(e));}
  assert.ok(denied,'missing live versions must be rejected');
  denied=false;
  try{validateInventory({schema_version:1,database_project_ref:'wertmoquxdrucdbobuie',repo_kind:'canonical',database_records:[],repository_files:[]},['supabase/migrations/fake.sql']);}
  catch(e){denied=true;}
  assert.ok(denied,'new/untracked files must fail closed');
  console.log('P05 negative self-test PASS: missing/unknown migration inventory rejected.');
}

if(process.argv.includes('--self-test'))selfTest();
else{
  const manifest=JSON.parse(fs.readFileSync(path.resolve(ROOT,MANIFEST),'utf8'));
  const files=fs.readdirSync(path.resolve(ROOT,SQL_DIR))
    .filter(x=>x.endsWith('.sql')).map(x=>SQL_DIR+'/'+x);
  const stats=validateInventory(manifest,files);
  for(const [file,sha] of stats.expected){
    const observed=gitBlobSha(fs.readFileSync(path.resolve(ROOT,file)));
    if(observed!==sha)fail('SQL blob changed since read-only audit: '+file);
  }
  if(manifest.recovery_artifact?.path){
    const r=manifest.recovery_artifact;
    if(!fs.existsSync(r.path)||gitBlobSha(fs.readFileSync(r.path))!==r.git_blob_sha1)
      fail('nondeployable bank-receipt recovery source has changed');
  }
  // Only entries stored by Supabase as exactly ONE statement may be byte compared;
  // older migrations are arrays of separate statements and cannot be compared as
  // raw file bytes. A differing MD5 is an explicit manual-review signal.
  const single=manifest.database_records.filter(x=>x.sql_statements===1&&x.source_path);
  let exactMd5=0,trimMd5=0,unverified=0;
  const examples=[];
  for(const row of single){
    const txt=fs.readFileSync(path.resolve(ROOT,row.source_path),'utf8');
    const md5=x=>crypto.createHash('md5').update(x).digest('hex');
    if(md5(txt)===row.single_statement_md5)exactMd5++;
    else if(md5(txt.trimEnd())===row.single_statement_md5)trimMd5++;
    else {unverified++;examples.push(row.ledger_version);}
  }
  const totalSingle=manifest.database_records.filter(x=>x.sql_statements===1).length;
  const multi=manifest.database_records.length-totalSingle;
  console.log('P05 PROVENANCE STRUCTURE PASS: '+JSON.stringify({
    repo:manifest.repo,live_ledger:manifest.database_records.length,
    migration_files:files.length,mapped_exact_version_and_name:stats.exact,
    renamed_name_candidates:stats.alias,missing_executable_source:stats.missing,
    documented_version_collisions:stats.collisions,unregistered_sql:stats.staged,
    database_single_statement_entries:totalSingle,database_multi_statement_entries:multi,
    single_sql_byte_equal:exactMd5,single_sql_equal_after_trim:trimMd5,
    single_sql_different_or_unverified:unverified,manual_review_versions:examples
  }));
  console.log('RELEASE GATE: NO-GO — source-name pairing/SQL fingerprints do not authorize db push, repair or deployment.');
}
