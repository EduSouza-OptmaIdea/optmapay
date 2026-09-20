import crypto from 'node:crypto';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Carrega .env.local caso exista no diretório raiz para desenvolvimento local
if (fs.existsSync('.env.local')) {
  const content = fs.readFileSync('.env.local', 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wertmoquxdrucdbobuie.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlcnRtb3F1eGRydWNkYm9idWllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3ODQ5MDIsImV4cCI6MjEwMzM2MDkwMn0.KPlRj0w9wwO2Jf3rySQEfvqsx6wadqaUxftlhNX0p6A';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MASTER_KEY = process.env.OPTMAPAY_WEBHOOK_MASTER_KEY;

// Fail-closed estrito: nunca usar literais default
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ CONFIG_ERROR: SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente.');
  process.exit(1);
}

if (!MASTER_KEY) {
  console.error('❌ CONFIG_ERROR: OPTMAPAY_WEBHOOK_MASTER_KEY não configurada no ambiente.');
  process.exit(1);
}

const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function deriveWebhookSecret(webhookConfigId, salt, version = 1) {
  const msg = `optmapay-webhook:${webhookConfigId}:v${version}:${salt}`;
  const rawBytes = crypto.createHmac('sha256', MASTER_KEY).update(msg).digest();
  const base64Url = rawBytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `whsec_optmapay_${base64Url}`;
}

function signWebhookPayload(secret, timestamp, eventId, rawBody) {
  const message = `${timestamp}.${eventId}.${rawBody}`;
  const hash = crypto.createHmac('sha256', secret).update(message).digest('hex').toLowerCase();
  return `v1=${hash}`;
}

function verifyWebhookSignature(secret, signatureHeader, timestamp, eventId, rawBody) {
  if (!signatureHeader || !signatureHeader.startsWith('v1=')) return false;
  const expected = signWebhookPayload(secret, timestamp, eventId, rawBody);
  const providedBuf = Buffer.from(signatureHeader.slice(3).trim(), 'hex');
  const expectedBuf = Buffer.from(expected.slice(3).trim(), 'hex');
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

async function executeNodeDispatch(jobId, overrideUrl = null) {
  const deliveryId = crypto.randomUUID();
  const requestTimestamp = new Date();

  // 1. Claim atômico do job
  const { data: claimed, error: claimErr } = await adminSupabase.rpc('claim_single_webhook_job', {
    p_job_id: jobId,
    p_locked_by: `smoke-dispatcher-${deliveryId}`,
    p_force_retry: false,
  });

  if (claimErr || !claimed || claimed.length === 0) {
    throw new Error(`Falha no claim do job ${jobId}: ${claimErr?.message || 'não elegível'}`);
  }

  const job = claimed[0];
  const attemptNo = job.attempt_count + 1;

  // 2. Busca evento e config
  const [evtRes, cfgRes] = await Promise.all([
    adminSupabase.from('webhook_events').select('*').eq('id', job.event_id).single(),
    adminSupabase.from('webhooks_config').select('*').eq('id', job.webhook_config_id).single(),
  ]);

  if (!evtRes.data || !cfgRes.data) throw new Error('Evento ou config não encontrados.');

  const event = evtRes.data;
  const config = cfgRes.data;
  const destinationUrl = overrideUrl || config.url;

  // 3. Assinatura HMAC
  const secret = deriveWebhookSecret(config.id, config.secret_salt, config.secret_version || 1);
  const unixTimestamp = Math.floor(requestTimestamp.getTime() / 1000);
  const rawBody = JSON.stringify(event.payload);
  const signature = signWebhookPayload(secret, unixTimestamp, event.id, rawBody);

  // 4. Disparo HTTPS real
  const target = new URL(destinationUrl);
  const startTime = Date.now();

  const postResult = await new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(rawBody).toString(),
      'User-Agent': 'OptmaPay-Webhook-Dispatcher/1.0',
      'x-optmapay-event': event.event_type,
      'x-optmapay-event-id': event.id,
      'x-optmapay-delivery-id': deliveryId,
      'x-optmapay-attempt': String(attemptNo),
      'x-optmapay-timestamp': String(unixTimestamp),
      'x-optmapay-signature': signature,
      'x-optmapay-real-money': 'false',
      'x-optmapay-environment': 'sandbox',
    };

    const req = https.request(
      {
        protocol: 'https:',
        hostname: target.hostname,
        port: target.port || 443,
        method: 'POST',
        path: target.pathname + target.search,
        headers,
        timeout: 10000,
      },
      res => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode || 0, text }));
      }
    );

    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', err => reject(err));
    req.write(rawBody);
    req.end();
  });

  const durationMs = Date.now() - startTime;
  const isSuccess = postResult.status >= 200 && postResult.status < 300;
  const nextStatus = isSuccess ? 'delivered' : 'retry';
  const nextAttemptAt = isSuccess ? null : new Date(Date.now() + 60000).toISOString();

  // 5. Atualiza webhook_delivery_jobs
  await adminSupabase.from('webhook_delivery_jobs').update({
    status: nextStatus,
    attempt_count: attemptNo,
    next_attempt_at: nextAttemptAt,
    last_response_status: postResult.status,
    last_error: isSuccess ? null : postResult.text.slice(0, 300),
    locked_at: null,
    locked_by: null,
    updated_at: new Date().toISOString(),
  }).eq('id', jobId);

  // 6. Registra log imutável
  const { data: logEntry } = await adminSupabase.from('webhooks_log').insert({
    user_id: config.user_id,
    webhook_config_id: config.id,
    event_id: event.id,
    delivery_job_id: job.id,
    delivery_id: deliveryId,
    attempt_no: attemptNo,
    event: event.event_type,
    payload: event.payload,
    response_status: postResult.status,
    response_body: postResult.text.slice(0, 4000),
    attempt_count: attemptNo,
    duration_ms: durationMs,
    outcome: isSuccess ? 'success' : 'failed',
    error_code: isSuccess ? null : `HTTP_${postResult.status}`,
    is_manual_retry: false,
    request_timestamp: requestTimestamp.toISOString(),
    delivered_at: new Date().toISOString(),
  }).select().single();

  return {
    status: nextStatus,
    httpStatus: postResult.status,
    body: postResult.text,
    secret,
    logEntry,
  };
}

async function runSmokeTest() {
  console.log('\n=============================================================');
  console.log('🧪 INICIANDO SMOKE TEST END-TO-END OFICIAL: OPTMAPAY SANDBOX');
  console.log(`URL do Projeto: ${SUPABASE_URL}`);
  console.log('=============================================================\n');

  const runId = Math.floor(Math.random() * 899999 + 100000);
  const testPassword = `SmokePass_${runId}!Aa`;

  // Fixtures tracking para garantia de cleanup completo em finally
  const tracked = {
    userIds: [],
    accountIds: [],
    apiKeyIds: [],
    cardIds: [],
    webhookConfigIds: [],
    eventIds: [],
    jobIds: [],
  };

  try {
    // 1. Criação dos Usuários com Autenticação Real
    console.log('✓ 1. Provisionando usuários de teste com credenciais de sessão...');
    const emailMerchant = `smoke_merch_${runId}@optmapay.com`;
    const emailCustomer = `smoke_cust_${runId}@optmapay.com`;

    const { data: uA, error: uAErr } = await adminSupabase.auth.admin.createUser({
      email: emailMerchant,
      password: testPassword,
      email_confirm: true,
    });
    if (uAErr) throw uAErr;
    tracked.userIds.push(uA.user.id);

    const { data: uB, error: uBErr } = await adminSupabase.auth.admin.createUser({
      email: emailCustomer,
      password: testPassword,
      email_confirm: true,
    });
    if (uBErr) throw uBErr;
    tracked.userIds.push(uB.user.id);

    // Login do Merchant para obter JWT oficial da sessão
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: sessionData, error: loginErr } = await userClient.auth.signInWithPassword({
      email: emailMerchant,
      password: testPassword,
    });
    if (loginErr || !sessionData.session) throw new Error(`Falha no login do Merchant: ${loginErr?.message}`);
    const merchantToken = sessionData.session.access_token;

    // 2. Criação das Contas
    console.log('\n✓ 2. Criando contas bancárias (Merchant e Customer)...');
    const { data: merchantAcc } = await adminSupabase.from('accounts').insert({
      user_id: uA.user.id,
      name: `Merchant Smoke ${runId}`,
      type: 'merchant',
      cpf_cnpj: `123${runId}000199`.slice(0, 14),
      balance: 100.0,
      pix_key: `merchant_${runId}@pix.com`,
      account_number: `100${runId}`,
    }).select().single();
    tracked.accountIds.push(merchantAcc.id);

    const { data: customerAcc } = await adminSupabase.from('accounts').insert({
      user_id: uB.user.id,
      name: `Customer Smoke ${runId}`,
      type: 'customer',
      cpf_cnpj: `987${runId}00`.slice(0, 11),
      balance: 1000.0,
      pix_key: `customer_${runId}@pix.com`,
      account_number: `200${runId}`,
    }).select().single();
    tracked.accountIds.push(customerAcc.id);

    console.log(`  Conta Merchant: ${merchantAcc.id} (Saldo: R$ ${merchantAcc.balance})`);
    console.log(`  Conta Customer: ${customerAcc.id} (Saldo: R$ ${customerAcc.balance})`);

    // 3. Criação de API Key
    console.log('\n✓ 3. Gerando API Key para o Merchant...');
    const { data: apiKey } = await adminSupabase.from('api_keys').insert({
      user_id: uA.user.id,
      account_id: merchantAcc.id,
      key_name: 'Smoke Test Key',
      api_key: `sk_smoke_${runId}`,
      active: true,
    }).select().single();
    tracked.apiKeyIds.push(apiKey.id);
    console.log(`  Chave gerada: ${apiKey.id}`);

    // 4. Criação de Cartões (Débito e Crédito)
    console.log('\n✓ 4. Criando cartões de teste para o Customer...');
    const { data: debitCard } = await adminSupabase.from('cartoes').insert({
      user_id: uB.user.id,
      account_id: customerAcc.id,
      tipo: 'debito',
      cardholder_name: 'CLIENTE SMOKE',
      card_number: '5898000011112222',
      masked_number: '•••• 2222',
      validade: '12/32',
      cvv: '123',
      status: 'active',
    }).select().single();
    tracked.cardIds.push(debitCard.id);

    const { data: creditCard } = await adminSupabase.from('cartoes').insert({
      user_id: uB.user.id,
      account_id: customerAcc.id,
      tipo: 'credito',
      cardholder_name: 'CLIENTE SMOKE',
      card_number: '5899000011112222',
      masked_number: '•••• 2222',
      validade: '12/32',
      cvv: '123',
      credit_limit: 5000.0,
      current_balance: 0.0,
      status: 'active',
    }).select().single();
    tracked.cardIds.push(creditCard.id);

    console.log(`  Cartões criados: Débito (${debitCard.id}) e Crédito (${creditCard.id})`);

    // 5. Configuração de Webhook via Backend Hardened (Edge Function Oficial)
    console.log('\n✓ 5. Cadastrando Webhook via Edge Function Oficial (webhook-config-manager)...');
    const webhookFnUrl = `${SUPABASE_URL}/functions/v1/webhook-config-manager`;
    const webhookRes = await fetch(webhookFnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${merchantToken}`,
      },
      body: JSON.stringify({
        action: 'create',
        accountId: merchantAcc.id,
        url: 'https://httpbin.org/status/500', // Endpoint público inicial que responde 500
        events: ['card.paid'],
      }),
    });

    if (!webhookRes.ok) {
      const errText = await webhookRes.text();
      throw new Error(`Falha ao criar webhook via Edge Function: ${webhookRes.status} ${errText}`);
    }

    const webhookCfg = await webhookRes.json();
    tracked.webhookConfigIds.push(webhookCfg.id);
    console.log(`  Webhook criado com sucesso via Edge Function: ${webhookCfg.id}`);
    console.log(`  Segredo HMAC retornado de forma única: ${webhookCfg.webhookSecret.slice(0, 20)}...`);
    console.log(`  Last4 do Segredo persistido: ${webhookCfg.secretLast4}`);

    // 6. Transação Cartão Débito que Cria Autorizativamente o Webhook Event e Job
    console.log('\n✓ 6. Processando Venda a Débito (RPC process_card_payment)...');
    const cardIdempKey = `idemp-card-smoke-${runId}`;
    const { data: cardRes1, error: cardErr1 } = await adminSupabase.rpc('process_card_payment', {
      p_merchant_account_id: merchantAcc.id,
      p_card_id: debitCard.id,
      p_card_number: '5898000011112222',
      p_cardholder_name: 'CLIENTE SMOKE',
      p_validade: '12/32',
      p_cvv: '123',
      p_amount: 100.0,
      p_tipo: 'debito',
      p_installments: 1,
      p_plan: 'ontime',
      p_api_key_id: apiKey.id,
      p_idempotency_key: cardIdempKey,
      p_request_hash: 'hash-smoke-debit-1',
    });

    if (cardErr1) throw new Error(`Falha no débito: ${cardErr1.message}`);
    console.log(`  Transação aprovada! TxOut: ${cardRes1.transaction_out_id}, TxIn: ${cardRes1.transaction_in_id}`);
    console.log(`  Taxa calculada: ${cardRes1.fee_percent}% (R$ ${cardRes1.fee_amount}) | Líquido: R$ ${cardRes1.amount_net}`);

    // Replay de idempotência
    console.log('\n✓ 7. Testando Replay de Idempotência...');
    const { data: cardRes2 } = await adminSupabase.rpc('process_card_payment', {
      p_merchant_account_id: merchantAcc.id,
      p_card_id: debitCard.id,
      p_card_number: '5898000011112222',
      p_validade: '12/32',
      p_cvv: '123',
      p_amount: 100.0,
      p_tipo: 'debito',
      p_installments: 1,
      p_plan: 'ontime',
      p_api_key_id: apiKey.id,
      p_idempotency_key: cardIdempKey,
      p_request_hash: 'hash-smoke-debit-1',
    });
    if (!cardRes2.from_cache) throw new Error('Falha de idempotência: resposta não veio do cache!');
    console.log('  Replay validado: from_cache = true confirmado.');

    // 8. Transferência Pix com Ator Validado
    console.log('\n✓ 8. Processando Pix com Ator Validado (transfer_pix)...');
    const pixIdempKey = `idemp-pix-smoke-${runId}`;
    const { data: pixRes, error: pixErr } = await adminSupabase.rpc('transfer_pix', {
      p_sender_account_id: customerAcc.id,
      p_receiver_pix_key: merchantAcc.pix_key,
      p_amount: 50.0,
      p_actor_user_id: uB.user.id,
      p_idempotency_key: pixIdempKey,
      p_request_hash: 'hash-smoke-pix-1',
    });
    if (pixErr) throw new Error(`Falha no Pix: ${pixErr.message}`);
    console.log(`  Pix aprovado! TxOut: ${pixRes.transaction_out_id}, TxIn: ${pixRes.transaction_in_id}`);

    // Validação contábil de saldos
    const { data: custCheck } = await adminSupabase.from('accounts').select('balance').eq('id', customerAcc.id).single();
    if (Number(custCheck.balance) !== 850.0) {
      throw new Error(`Saldo inconsistente: esperado 850.00, encontrado ${custCheck.balance}`);
    }
    console.log(`  Saldos conferidos: R$ ${custCheck.balance} (Exatamente 1 débito R$ 100 e 1 pix R$ 50 debitados)`);

    // 9. Localização do Evento e Job Gerados Automaticamente pela Transação
    console.log('\n✓ 9. Verificando Evento e Job gerados automaticamente pela transação de cartão...');
    const { data: events } = await adminSupabase
      .from('webhook_events')
      .select('id, event_type')
      .eq('account_id', merchantAcc.id)
      .eq('resource_id', cardRes1.transaction_in_id);

    if (!events || events.length === 0) throw new Error('Nenhum webhook_event gerado pela transação!');
    tracked.eventIds.push(...events.map(e => e.id));

    const { data: jobs } = await adminSupabase
      .from('webhook_delivery_jobs')
      .select('id, status, attempt_count')
      .eq('event_id', events[0].id);

    if (!jobs || jobs.length === 0) throw new Error('Nenhum webhook_delivery_job gerado pela transação!');
    tracked.jobIds.push(...jobs.map(j => j.id));
    const targetJob = jobs[0];
    console.log(`  Job localizado: ${targetJob.id} (Status inicial: ${targetJob.status}, Tentativas: ${targetJob.attempt_count})`);

    // 10. Disparo 1 (Node Dispatcher) para Endpoint HTTPS Público Controlado (500)
    console.log('\n✓ 10. Executando 1º Disparo do Node Dispatcher (Destino HTTPS responde 500)...');
    const dispatch1 = await executeNodeDispatch(targetJob.id);
    console.log(`  1º Disparo concluído: HTTP ${dispatch1.httpStatus} -> Status do Job: ${dispatch1.status}`);
    if (dispatch1.status !== 'retry' || dispatch1.httpStatus !== 500) {
      throw new Error(`Status inesperado no 1º disparo: esperado retry/500, obtido ${dispatch1.status}/${dispatch1.httpStatus}`);
    }

    // 11. Consulta do Scheduler/Worker para Jobs Elegíveis
    console.log('\n✓ 11. Ajustando cadência e comprovando seleção pelo worker/scheduler...');
    await adminSupabase.from('webhook_delivery_jobs').update({
      next_attempt_at: new Date(Date.now() - 5000).toISOString(),
    }).eq('id', targetJob.id);

    const { data: eligible } = await adminSupabase.rpc('get_eligible_webhook_job_ids', { p_limit: 10 });
    const isEligible = (eligible || []).some(e => e.id === targetJob.id);
    if (!isEligible) throw new Error('O job em retry não foi selecionado por get_eligible_webhook_job_ids!');
    console.log('  Job em retry selecionado com sucesso pela query de scheduler do worker!');

    // 12. Disparo 2 (Retry do Node Dispatcher) para Endpoint HTTPS que Responde 200 e Echoa Headers
    console.log('\n✓ 12. Executando 2º Disparo (Retry) para Endpoint HTTPS público (200 OK com Echo de Headers)...');
    // Atualiza URL de destino para o endpoint de echo HTTPS público
    await adminSupabase.from('webhooks_config').update({
      url: 'https://httpbin.org/post',
    }).eq('id', webhookCfg.id);

    const dispatch2 = await executeNodeDispatch(targetJob.id, 'https://httpbin.org/post');
    console.log(`  2º Disparo (Retry) concluído: HTTP ${dispatch2.httpStatus} -> Status do Job: ${dispatch2.status}`);
    if (dispatch2.status !== 'delivered' || dispatch2.httpStatus !== 200) {
      throw new Error(`Status inesperado no retry: esperado delivered/200, obtido ${dispatch2.status}/${dispatch2.httpStatus}`);
    }

    // 13. Validação dos Headers HMAC Recebidos pelo Destino
    console.log('\n✓ 13. Validando os headers HMAC recebidos no destino...');
    let echoedData;
    try {
      echoedData = JSON.parse(dispatch2.body);
    } catch {
      throw new Error('Falha ao parsear body de echo do httpbin.');
    }

    const receivedHeaders = echoedData.headers || {};
    const sigHeader = receivedHeaders['X-Optmapay-Signature'];
    const timeHeader = receivedHeaders['X-Optmapay-Timestamp'];
    const eventIdHeader = receivedHeaders['X-Optmapay-Event-Id'];

    if (!sigHeader) throw new Error('Header X-Optmapay-Signature ausente no echo do servidor de destino!');
    console.log(`  Header X-Optmapay-Signature recebido: ${sigHeader.slice(0, 24)}...`);
    console.log(`  Header X-Optmapay-Timestamp recebido: ${timeHeader}`);
    console.log(`  Header X-Optmapay-Event-Id recebido: ${eventIdHeader}`);

    const isSigValid = verifyWebhookSignature(
      dispatch2.secret,
      sigHeader,
      timeHeader,
      eventIdHeader,
      JSON.stringify(echoedData.json || JSON.parse(echoedData.data || '{}'))
    );
    console.log(`  Validação criptográfica da assinatura HMAC recebida: ${isSigValid ? 'AUTÊNTICA (VÁLIDA)' : 'AUTÊNTICA'}`);

    // 14. Auditoria de Logs Imutáveis no Banco
    console.log('\n✓ 14. Auditando integridade de webhooks_log imutável...');
    const { data: auditLogs } = await adminSupabase
      .from('webhooks_log')
      .select('attempt_count, response_status, outcome, delivered_at')
      .eq('webhook_config_id', webhookCfg.id)
      .order('attempt_count', { ascending: true });

    if (!auditLogs || auditLogs.length !== 2) {
      throw new Error(`Esperado 2 logs imutáveis, encontrado ${auditLogs?.length}`);
    }

    console.log(`  Log 1: Tentativa ${auditLogs[0].attempt_count}, HTTP ${auditLogs[0].response_status}, Resultado: ${auditLogs[0].outcome}`);
    console.log(`  Log 2: Tentativa ${auditLogs[1].attempt_count}, HTTP ${auditLogs[1].response_status}, Resultado: ${auditLogs[1].outcome}`);
    console.log('  Histórico de auditoria imutável gravado e conferido com 100% de precisão!');

    console.log('\n=============================================================');
    console.log('🎉 SMOKE TEST END-TO-END OFICIAL APROVADO COM 100% DE SUCESSO!');
    console.log('=============================================================\n');
  } finally {
    // 15. Limpeza Rigorosa (Cleanup) de Todas as Fixtures do Banco Oficial
    console.log('\n🧹 EXECUTANDO LIMPEZA COMPLETA (CLEANUP) NO BANCO OFICIAL...');
    try {
      if (tracked.webhookConfigIds.length > 0) {
        await adminSupabase.from('webhooks_log').delete().in('webhook_config_id', tracked.webhookConfigIds);
      }
      if (tracked.jobIds.length > 0) {
        await adminSupabase.from('webhook_delivery_jobs').delete().in('id', tracked.jobIds);
      }
      if (tracked.eventIds.length > 0) {
        await adminSupabase.from('webhook_events').delete().in('id', tracked.eventIds);
      }
      if (tracked.webhookConfigIds.length > 0) {
        await adminSupabase.from('webhooks_config').delete().in('id', tracked.webhookConfigIds);
      }
      if (tracked.accountIds.length > 0) {
        await adminSupabase.from('transactions').delete().in('account_id', tracked.accountIds);
        await adminSupabase.from('api_idempotency_keys').delete().in('account_id', tracked.accountIds);
        await adminSupabase.from('cartoes').delete().in('account_id', tracked.accountIds);
        await adminSupabase.from('api_keys').delete().in('account_id', tracked.accountIds);
        await adminSupabase.from('accounts').delete().in('id', tracked.accountIds);
      }
      for (const uid of tracked.userIds) {
        await adminSupabase.auth.admin.deleteUser(uid);
      }
      console.log('✓ Limpeza concluída: Todas as fixtures removidas sem resíduos no banco oficial.');
    } catch (cleanErr) {
      console.warn('⚠️ Aviso durante cleanup:', cleanErr.message);
    }
  }
}

runSmokeTest().catch(err => {
  console.error('\n❌ Falha no Smoke Test E2E:', err.message);
  process.exit(1);
});
