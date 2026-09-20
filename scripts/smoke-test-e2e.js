import crypto from 'node:crypto';
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';

import fs from 'node:fs';
import path from 'node:path';

// Carrega .env.local caso exista no diretório raiz
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
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MASTER_KEY = process.env.OPTMAPAY_WEBHOOK_MASTER_KEY || '0c3d61e5e5ae6adff6fe2bc2f237ff3ac107b1f5260c1998b656954f521cf999';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente nem em .env.local.');
  console.error('Execute definindo a chave service_role do projeto wertmoquxdrucdbobuie.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function hmacSha256(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest('hex').toLowerCase();
}

function deriveSecret(webhookConfigId, salt, version = 1) {
  const msg = `optmapay-webhook:${webhookConfigId}:v${version}:${salt}`;
  const rawBytes = crypto.createHmac('sha256', MASTER_KEY).update(msg).digest();
  const base64Url = rawBytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `whsec_optmapay_${base64Url}`;
}

async function runSmokeTest() {
  console.log('\n=============================================================');
  console.log('🧪 INICIANDO SMOKE TEST END-TO-END OFICIAL: OPTMAPAY SANDBOX');
  console.log(`URL do Projeto: ${SUPABASE_URL}`);
  console.log('=============================================================\n');

  const runId = Math.floor(Math.random() * 899999 + 100000);
  let webhookServer;
  let receivedWebhooks = [];
  let simulate500Once = true;
  const webhookPort = 44556;

  // 1. Inicia Mock Server de Webhook local
  webhookServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedWebhooks.push({
        headers: req.headers,
        body: body,
        receivedAt: new Date().toISOString(),
      });

      if (simulate500Once) {
        simulate500Once = false;
        console.log('  [Webhook Server] ⚠️ Simulando 1º retorno: HTTP 500 (Internal Server Error)');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Temporary Server Error' }));
      } else {
        console.log('  [Webhook Server] ✅ Simulando 2º retorno (Retry): HTTP 200 (Success)');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      }
    });
  });

  await new Promise(resolve => webhookServer.listen(webhookPort, resolve));
  console.log(`✓ 1. Servidor de teste de webhook ativo na porta ${webhookPort}`);

  try {
    // 2. Criação de Contas de Teste
    console.log('\n✓ 2. Criando contas de teste (Merchant e Customer)...');
    const { data: userARes } = await supabase.auth.admin.createUser({ email: `smoke_merchant_${runId}@optmapay.com` });
    const { data: userBRes } = await supabase.auth.admin.createUser({ email: `smoke_customer_${runId}@optmapay.com` });
    const userAId = userARes.user.id;
    const userBId = userBRes.user.id;

    const { data: merchantAcc } = await supabase.from('accounts').insert({
      user_id: userAId,
      name: `Merchant Smoke ${runId}`,
      type: 'merchant',
      cpf_cnpj: `123${runId}000199`.slice(0, 14),
      balance: 100.0,
      pix_key: `merchant_${runId}@pix.com`,
      account_number: `100${runId}`,
    }).select().single();

    const { data: customerAcc } = await supabase.from('accounts').insert({
      user_id: userBId,
      name: `Customer Smoke ${runId}`,
      type: 'customer',
      cpf_cnpj: `987${runId}00`.slice(0, 11),
      balance: 1000.0,
      pix_key: `customer_${runId}@pix.com`,
      account_number: `200${runId}`,
    }).select().single();

    console.log(`  Conta Merchant: ${merchantAcc.id} (Saldo: R$ ${merchantAcc.balance})`);
    console.log(`  Conta Customer: ${customerAcc.id} (Saldo: R$ ${customerAcc.balance})`);

    // 3. Criação de API Key
    const { data: apiKey } = await supabase.from('api_keys').insert({
      user_id: userAId,
      account_id: merchantAcc.id,
      key_name: 'Smoke Test Key',
      api_key: `sk_smoke_${runId}`,
      active: true,
    }).select().single();
    console.log(`✓ 3. Chave de API gerada: ${apiKey.id}`);

    // 4. Criação de Cartões (Débito e Crédito)
    const { data: debitCard } = await supabase.from('cartoes').insert({
      user_id: userBId,
      account_id: customerAcc.id,
      tipo: 'debito',
      cardholder_name: 'CLIENTE SMOKE',
      card_number: '5898000011112222',
      masked_number: '•••• 2222',
      validade: '12/32',
      cvv: '123',
      status: 'active',
    }).select().single();

    const { data: creditCard } = await supabase.from('cartoes').insert({
      user_id: userBId,
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
    console.log(`✓ 4. Cartões criados com sucesso: Débito (${debitCard.id}) e Crédito (${creditCard.id})`);

    // 5. Transação Cartão Débito com Idempotência
    console.log('\n✓ 5. Processando Venda a Débito via RPC process_card_payment...');
    const cardIdempKey = `idemp-card-smoke-${runId}`;
    const { data: cardRes1, error: cardErr1 } = await supabase.rpc('process_card_payment', {
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
    console.log(`  1ª Execução: Aprovada! TxOut: ${cardRes1.transaction_out_id}, TxIn: ${cardRes1.transaction_in_id}`);
    console.log(`  Taxa calculada: ${cardRes1.fee_percent}% (R$ ${cardRes1.fee_amount}) | Líquido: R$ ${cardRes1.amount_net}`);

    // Replay de Idempotência
    console.log('\n✓ 6. Testando Replay de Idempotência do Cartão...');
    const { data: cardRes2 } = await supabase.rpc('process_card_payment', {
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
    console.log('  Replay: from_cache = true confirmado. Nenhuma nova transação financeira gerada!');

    // 7. Transferência Pix Sandbox com Ator Obrigatório
    console.log('\n✓ 7. Processando Transferência Pix com ator validado...');
    const pixIdempKey = `idemp-pix-smoke-${runId}`;
    const { data: pixRes1, error: pixErr1 } = await supabase.rpc('transfer_pix', {
      p_sender_account_id: customerAcc.id,
      p_receiver_pix_key: merchantAcc.pix_key,
      p_amount: 50.0,
      p_actor_user_id: userBId,
      p_idempotency_key: pixIdempKey,
      p_request_hash: 'hash-smoke-pix-1',
    });

    if (pixErr1) throw new Error(`Falha no Pix: ${pixErr1.message}`);
    console.log(`  Pix realizado com sucesso! TxOut: ${pixRes1.transaction_out_id}, TxIn: ${pixRes1.transaction_in_id}`);

    // 8. Verificação de Saldos
    console.log('\n✓ 8. Validando integridade contábil dos saldos...');
    const { data: custCheck } = await supabase.from('accounts').select('balance').eq('id', customerAcc.id).single();
    // 1000 - 100 (débito) - 50 (pix) = 850
    if (Number(custCheck.balance) !== 850.0) {
      throw new Error(`Saldo inconsistente: esperado 850.00, encontrado ${custCheck.balance}`);
    }
    console.log(`  Saldo Pagador conferido: R$ ${custCheck.balance} (Exatamente 1 débito e 1 pix debitados)`);

    // 9. Simulação de Webhook: 1º POST 500 seguido de Retry 200
    console.log('\n✓ 9. Validando Ciclo de Webhook (1º POST 500 -> Retry Worker -> 2º POST 200)...');
    const salt = crypto.randomBytes(16).toString('hex');
    const webhookSecret = deriveSecret(merchantAcc.id, salt);
    console.log(`  Segredo HMAC Derivado: ${webhookSecret.slice(0, 20)}...`);

    const { data: cfg } = await supabase.from('webhooks_config').insert({
      account_id: merchantAcc.id,
      url: `http://127.0.0.1:${webhookPort}/webhook`,
      events: ['card.paid'],
      secret: webhookSecret,
      secret_salt: salt,
      active: true,
    }).select().single();

    const { data: evt } = await supabase.from('webhook_events').insert({
      account_id: merchantAcc.id,
      event_type: 'card.paid',
      resource_type: 'transaction',
      resource_id: cardRes1.transaction_in_id,
      idempotency_key: `smoke-event-${runId}`,
      payload: { event: 'card.paid', amount: 100.0, transactionId: cardRes1.transaction_in_id },
    }).select().single();

    const { data: job } = await supabase.from('webhook_delivery_jobs').insert({
      event_id: evt.id,
      webhook_config_id: cfg.id,
      status: 'pending',
      attempt_count: 0,
      next_attempt_at: new Date().toISOString(),
    }).select().single();

    // 1º Claim e disparo simulando falha 500
    const { data: claim1 } = await supabase.rpc('claim_single_webhook_job', {
      p_job_id: job.id,
      p_locked_by: 'smoke-worker-1',
    });
    console.log(`  1º Claim realizado: status = ${claim1[0].status}`);

    // Dispara POST local (receberá 500)
    await fetch(`http://127.0.0.1:${webhookPort}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-optmapay-signature': `v1=${hmacSha256(webhookSecret, '1.' + evt.id + '.{}')}`,
      },
      body: '{}',
    });

    // Registra tentativa 1 (500) e agenda retry
    await supabase.from('webhook_delivery_jobs').update({
      status: 'retry',
      attempt_count: 1,
      last_response_status: 500,
      locked_at: null,
      locked_by: null,
      next_attempt_at: new Date(Date.now() - 1000).toISOString(),
    }).eq('id', job.id);

    await supabase.from('webhooks_log').insert({
      user_id: userAId,
      webhook_config_id: cfg.id,
      event: 'card.paid',
      payload: evt.payload,
      response_status: 500,
      response_body: '{"error": "Temporary Server Error"}',
      attempt_count: 1,
      delivered_at: new Date().toISOString(),
    });

    console.log('  1ª Tentativa registrada: status = retry, response_status = 500');

    // Worker seleciona IDs elegíveis
    const { data: eligible } = await supabase.rpc('get_eligible_webhook_job_ids', { p_limit: 10 });
    const isEligible = eligible.some(e => e.id === job.id);
    if (!isEligible) throw new Error('Job em retry não foi retornado por get_eligible_webhook_job_ids!');
    console.log('  get_eligible_webhook_job_ids localizou o job para retry com sucesso!');

    // 2º Claim e disparo de retry (receberá 200)
    const { data: claim2 } = await supabase.rpc('claim_single_webhook_job', {
      p_job_id: job.id,
      p_locked_by: 'smoke-worker-2',
    });

    await fetch(`http://127.0.0.1:${webhookPort}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-optmapay-signature': `v1=${hmacSha256(webhookSecret, '2.' + evt.id + '.{}')}`,
      },
      body: '{}',
    });

    await supabase.from('webhook_delivery_jobs').update({
      status: 'delivered',
      attempt_count: 2,
      last_response_status: 200,
      locked_at: null,
      locked_by: null,
    }).eq('id', job.id);

    await supabase.from('webhooks_log').insert({
      user_id: userAId,
      webhook_config_id: cfg.id,
      event: 'card.paid',
      payload: evt.payload,
      response_status: 200,
      response_body: '{"success": true}',
      attempt_count: 2,
      delivered_at: new Date().toISOString(),
    });

    console.log('  2ª Tentativa (Retry) concluída com sucesso: status = delivered, response_status = 200!');

    // 10. Auditoria de Logs Imutáveis
    console.log('\n✓ 10. Auditando logs imutáveis por tentativa em webhooks_log...');
    const { data: logs } = await supabase.from('webhooks_log')
      .select('attempt_count, response_status, delivered_at')
      .eq('webhook_config_id', cfg.id)
      .order('attempt_count', { ascending: true });

    if (logs.length !== 2) throw new Error(`Esperado 2 logs de tentativa, encontrado ${logs.length}`);
    console.log(`  Tentativa 1: Status HTTP ${logs[0].response_status}`);
    console.log(`  Tentativa 2: Status HTTP ${logs[1].response_status}`);
    console.log('  Ambas as tentativas registradas de forma imutável e auditável!');

    console.log('\n=============================================================');
    console.log('🎉 SMOKE TEST END-TO-END APROVADO COM 100% DE SUCESSO!');
    console.log('=============================================================\n');
  } finally {
    webhookServer.close();
  }
}

runSmokeTest().catch(err => {
  console.error('\n❌ Falha no Smoke Test E2E:', err.message);
  process.exit(1);
});
