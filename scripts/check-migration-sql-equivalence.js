/**
 * P0.6 - Offline comparison of SQL bodies recorded in the live ledger.
 * Attestations are a frozen read-only audit (NOT an approval to deploy).
 * No Supabase credentials, connections, migration repair or db push are used.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const SOURCE = 'docs/security/P06_LEGACY_SQL_EQUIVALENCE_ATTESTATIONS_20261022.json';
const P05 = 'docs/security/P05_LIVE_MIGRATION_LEDGER_SNAPSHOT_20261022.json';

export function sqlTokens(t) {
  const out = [];
  let i = 0;
  while (i < t.length) {
    const ch = t[i], next = t[i + 1];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '-' && next === '-') {
      i += 2;
      while (i < t.length && t[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      let depth = 1;
      while (i < t.length && depth) {
        if (t.slice(i, i + 2) === '/*') { depth++; i += 2; }
        else if (t.slice(i, i + 2) === '*/') { depth--; i += 2; }
        else i++;
      }
      if (depth) throw new Error('unterminated nested SQL comment');
      continue;
    }
    if (ch === "'" || ch === '"') {
      const start = i++;
      const escaped = ch === "'" && /[eE]/.test(t[i - 2] ?? '') &&
        (i <= 2 || !/[\w]/.test(t[i - 3] ?? ''));
      let terminated = false;
      while (i < t.length) {
        if (ch === "'" && t[i] === '\\' && escaped) { i += 2; continue; }
        if (t[i] === ch) {
          if (t[i + 1] === ch) { i += 2; continue; }
          i++;
          terminated = true;
          break;
        }
        i++;
      }
      if (!terminated) throw new Error('unterminated SQL quoted literal/identifier');
      out.push(t.slice(start, i));
      continue;
    }
    if (ch === '$') {
      const match = t.slice(i).match(/^\$[A-Za-z_0-9]*\$/);
      if (match) {
        const start = i;
        i += match[0].length;
        const end = t.indexOf(match[0], i);
        if (end < 0) throw new Error('unterminated dollar quote');
        i = end + match[0].length;
        out.push(t.slice(start, i));
        continue;
      }
    }
    // Semicolons delimit statements. All other tokens must match exactly,
    // including dollar-quoted PL/pgSQL, string values and quoted identifiers.
    if (ch === ';') { i++; continue; }
    if (/[A-Za-z0-9_]/.test(ch)) {
      const start = i++;
      while (i < t.length && /[A-Za-z0-9_]/.test(t[i])) i++;
      out.push(t.slice(start, i));
      continue;
    }
    out.push(ch);
    i++;
  }
  return out;
}

export function fingerprint(tokens) {
  let hash = 0xcbf29ce484222325n;
  for (const token of tokens) {
    for (let i = 0; i < token.length; i++) {
      hash ^= BigInt(token.charCodeAt(i));
      hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    hash ^= 31n;
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

function gitBlobSha(content) {
  return crypto.createHash('sha1')
    .update(Buffer.from('blob ' + content.length + '\0'))
    .update(content).digest('hex');
}
function gate(condition, message) {
  if (!condition) throw new Error('P06 SQL equivalence gate: ' + message);
}
function selfTest() {
  const sameA = "SELECT  'abc ; -- safe' ; -- commentary\n /* comment */ SELECT $$inner; statement$$";
  const sameB = "SELECT 'abc ; -- safe';\n SELECT $$inner; statement$$;";
  assert.deepEqual(sqlTokens(sameA), sqlTokens(sameB));
  assert.notEqual(fingerprint(sqlTokens('SELECT 1')), fingerprint(sqlTokens('SELECT 2')));
  assert.notEqual(fingerprint(sqlTokens("SELECT 'a b'")), fingerprint(sqlTokens("SELECT 'ab'")));
  assert.notEqual(fingerprint(sqlTokens('SELECT $$a; b$$')), fingerprint(sqlTokens('SELECT $$a;b$$')));
  assert.throws(() => sqlTokens('SELECT $$unterminated'), /unterminated/);
  assert.throws(() => sqlTokens('/* unterminated'), /unterminated/);
  console.log('P06 NEGATIVE SELF-TEST PASS: SQL literals, dollar bodies and mutation detection.');
}
if (process.argv.includes('--self-test')) selfTest();
else {
  const manifest = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  const p05 = JSON.parse(fs.readFileSync(P05, 'utf8'));
  gate(manifest.schema_version === 1 && manifest.complete && manifest.project === 'wertmoquxdrucdbobuie',
    'invalid or incomplete live audit attestation');
  gate(manifest.ledger_count_expected === 51, 'live ledger snapshot changed');
  gate(manifest.attestations.length === 20, 'expected all 20 legacy multi-statement migrations');
  gate(p05.database_records.length === 51, 'P05 ledger inventory incomplete');
  const unique = new Set();
  for (const entry of manifest.attestations) {
    gate(!unique.has(entry.ledger_version), 'duplicate ledger version ' + entry.ledger_version);
    unique.add(entry.ledger_version);
    const source = p05.database_records.find(x => x.ledger_version === entry.ledger_version);
    gate(source && source.source_path === entry.source_path &&
      source.git_blob_sha1 === entry.git_blob_sha1 &&
      source.sql_statements === entry.sql_statements && source.sql_statements > 1,
    'attestation no longer corresponds to the live ledger inventory: ' + entry.ledger_version);
    gate(entry.source_path.startsWith('supabase/migrations/') &&
      !path.isAbsolute(entry.source_path) && !entry.source_path.includes('..'),
    'invalid relative source path');
    const sql = fs.readFileSync(entry.source_path);
    gate(gitBlobSha(sql) === entry.git_blob_sha1,
      'source SQL changed since ledger verification: ' + entry.ledger_version);
    const tokens = sqlTokens(sql.toString('utf8'));
    gate(tokens.length === entry.semantic_token_count &&
      fingerprint(tokens) === entry.semantic_fnv1a64,
    'recorded live SQL differs from git SQL tokens: ' + entry.ledger_version);
  }
  const expected = p05.database_records.filter(x => x.sql_statements > 1);
  gate(expected.length === 20 && expected.every(x => unique.has(x.ledger_version)),
    'historical multi-statement ledger coverage changed');
  console.log('P06 LIVE SQL EQUIVALENCE ATTESTATION PASS: 20/20 multi-statement migrations; ' +
    'literal-preserving token comparison + Git blob integrity; 31 one-statement migrations validated in P05.');
  console.log('RELEASE STATUS: NO-GO until timestamp collision and live object compatibility are reconciled.');
}
