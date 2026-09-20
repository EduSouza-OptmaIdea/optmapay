import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { calculateCardFee } from '../src/lib/cardRules';
import { SettlementPlanType } from '../src/types/sandbox';

const TEST_DB_URL = process.env.DATABASE_TEST_URL || 'postgresql://supabase_admin:postgres@127.0.0.1:54399/postgres';

describe('Real PostgreSQL Integration & Invariants Hardening Test (Pacote 01D)', () => {
  let client: Client;

  let userAId: string;
  let userBId: string;
  let merchantAccId: string;
  let customerAccId: string;
  let debitCardId: string;
  let creditCardId: string;
  let expiredCardId: string;
  let apiKeyId: string;
  let pixKeyMerchant: string;
  let pixIdempKey: string;
  let cardDebitIdemp: string;
  let cardCreditIdemp: string;

  beforeAll(async () => {
    client = new Client({ connectionString: TEST_DB_URL });
    await client.connect();

    const runId = Math.floor(Math.random() * 899999 + 100000);
    const emailA = `merchant_${runId}@optmapay.com`;
    const emailB = `customer_${runId}@optmapay.com`;
    const cnpj = `12345${runId}000199`.slice(0, 14);
    const cpf = `987${runId}00`.slice(0, 11);
    pixKeyMerchant = `merchant_${runId}@pix.com`;
    const pixKeyB = `customer_${runId}@pix.com`;
    pixIdempKey = `idemp-pix-${runId}`;
    cardDebitIdemp = `idemp-debit-${runId}`;
    cardCreditIdemp = `idemp-credit-${runId}`;

    // Cria usuários reais em auth.users
    const userARes = await client.query(`
      INSERT INTO auth.users (id, email)
      VALUES (gen_random_uuid(), $1)
      RETURNING id;
    `, [emailA]);
    userAId = userARes.rows[0].id;

    const userBRes = await client.query(`
      INSERT INTO auth.users (id, email)
      VALUES (gen_random_uuid(), $1)
      RETURNING id;
    `, [emailB]);
    userBId = userBRes.rows[0].id;

    // Cria conta merchant
    const merchantRes = await client.query(`
      INSERT INTO public.accounts (user_id, name, type, cpf_cnpj, balance, pix_key, account_number)
      VALUES ($1, 'Restaurante Sabor Real', 'merchant', $2, 500.00, $3, $4)
      RETURNING id;
    `, [userAId, cnpj, pixKeyMerchant, `10${runId}`]);
    merchantAccId = merchantRes.rows[0].id;

    // Cria conta customer
    const customerRes = await client.query(`
      INSERT INTO public.accounts (user_id, name, type, cpf_cnpj, balance, pix_key, account_number)
      VALUES ($1, 'Cliente Comprador', 'customer', $2, 1000.00, $3, $4)
      RETURNING id;
    `, [userBId, cpf, pixKeyB, `20${runId}`]);
    customerAccId = customerRes.rows[0].id;

    // Cria chave de API para a conta merchant
    const keyRes = await client.query(`
      INSERT INTO public.api_keys (user_id, account_id, key_name, api_key, active)
      VALUES ($1, $2, 'Test Key', $3, true)
      RETURNING id;
    `, [userAId, merchantAccId, `sk_test_${runId}`]);
    apiKeyId = keyRes.rows[0].id;

    // Cria cartão de débito válido (prefixo 5898)
    const debitCardRes = await client.query(`
      INSERT INTO public.cartoes (user_id, account_id, tipo, cardholder_name, card_number, masked_number, validade, cvv, status)
      VALUES ($1, $2, 'debito', 'CLIENTE COMPRADOR', '5898123456789012', '•••• 9012', '12/30', '123', 'active')
      RETURNING id;
    `, [userBId, customerAccId]);
    debitCardId = debitCardRes.rows[0].id;

    // Cria cartão de crédito válido (prefixo 5899, limite 5000, current_balance 0)
    const creditCardRes = await client.query(`
      INSERT INTO public.cartoes (user_id, account_id, tipo, cardholder_name, card_number, masked_number, validade, cvv, credit_limit, current_balance, status)
      VALUES ($1, $2, 'credito', 'CLIENTE COMPRADOR', '5899123456789012', '•••• 9012', '12/30', '123', 5000.00, 0.00, 'active')
      RETURNING id;
    `, [userBId, customerAccId]);
    creditCardId = creditCardRes.rows[0].id;

    // Cria cartão expirado (validade 01/20)
    const expiredCardRes = await client.query(`
      INSERT INTO public.cartoes (user_id, account_id, tipo, cardholder_name, card_number, masked_number, validade, cvv, credit_limit, current_balance, status)
      VALUES ($1, $2, 'credito', 'CLIENTE EXPIRADO', '5899999999999999', '•••• 9999', '01/20', '999', 5000.00, 0.00, 'active')
      RETURNING id;
    `, [userBId, customerAccId]);
    expiredCardId = expiredCardRes.rows[0].id;
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });

  it('1. Migrations 100% aplicadas: todas as tabelas do schema real devem existir', async () => {
    const res = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    const tables = res.rows.map(r => r.table_name);
    expect(tables).toContain('accounts');
    expect(tables).toContain('transactions');
    expect(tables).toContain('cartoes');
    expect(tables).toContain('boletos');
    expect(tables).toContain('webhooks_config');
    expect(tables).toContain('webhooks_log');
    expect(tables).toContain('webhook_events');
    expect(tables).toContain('webhook_delivery_jobs');
    expect(tables).toContain('api_keys');
    expect(tables).toContain('api_idempotency_keys');
  });

  it('2. Cartão débito: deve debitar accounts.balance do pagador e gerar transactions card_payment out e in', async () => {
    await client.query(`SET ROLE service_role;`);
    const res = await client.query(`
      SELECT public.process_card_payment(
        p_merchant_account_id := $1,
        p_card_id := $2,
        p_card_number := '5898123456789012',
        p_cardholder_name := 'CLIENTE COMPRADOR',
        p_validade := '12/30',
        p_cvv := '123',
        p_amount := 100.00,
        p_tipo := 'debito',
        p_installments := 1,
        p_plan := 'ontime',
        p_description := 'Almoço Executivo',
        p_external_reference := 'PED-DEBIT-001',
        p_api_key_id := $3,
        p_idempotency_key := $4,
        p_request_hash := 'hash-debit-001'
      ) AS result;
    `, [merchantAccId, debitCardId, apiKeyId, cardDebitIdemp]);

    const result = res.rows[0].result;
    expect(result.success).toBe(true);
    expect(result.status).toBe('approved');
    expect(result.amount_gross).toBe(100.00);

    const customerAcc = await client.query(`SELECT balance FROM public.accounts WHERE id = $1`, [customerAccId]);
    expect(Number(customerAcc.rows[0].balance)).toBe(900.00);

    const txOut = await client.query(`SELECT * FROM public.transactions WHERE id = $1`, [result.transaction_out_id]);
    expect(txOut.rows.length).toBe(1);
    expect(txOut.rows[0].type).toBe('card_payment');
    expect(txOut.rows[0].direction).toBe('out');
    expect(Number(txOut.rows[0].amount)).toBe(100.00);
    expect(txOut.rows[0].real_money).toBe(false);
    expect(txOut.rows[0].environment).toBe('sandbox');

    const txIn = await client.query(`SELECT * FROM public.transactions WHERE id = $1`, [result.transaction_in_id]);
    expect(txIn.rows.length).toBe(1);
    expect(txIn.rows[0].type).toBe('card_payment');
    expect(txIn.rows[0].direction).toBe('in');
    expect(Number(txIn.rows[0].amount)).toBe(Number(result.amount_net));
  });

  it('3. Cartão crédito: deve incrementar cartoes.current_balance e gerar transactions card_payment out e in', async () => {
    await client.query(`SET ROLE service_role;`);
    const res = await client.query(`
      SELECT public.process_card_payment(
        p_merchant_account_id := $1,
        p_card_id := $2,
        p_card_number := '5899123456789012',
        p_cardholder_name := 'CLIENTE COMPRADOR',
        p_validade := '12/30',
        p_cvv := '123',
        p_amount := 200.00,
        p_tipo := 'credito',
        p_installments := 2,
        p_plan := 'standard',
        p_description := 'Jantar Completo 2x',
        p_external_reference := 'PED-CREDIT-001',
        p_api_key_id := $3,
        p_idempotency_key := $4,
        p_request_hash := 'hash-credit-001'
      ) AS result;
    `, [merchantAccId, creditCardId, apiKeyId, cardCreditIdemp]);

    const result = res.rows[0].result;
    expect(result.success).toBe(true);
    expect(result.status).toBe('approved');
    expect(result.amount_gross).toBe(200.00);

    const cardRes = await client.query(`SELECT current_balance, credit_limit FROM public.cartoes WHERE id = $1`, [creditCardId]);
    expect(Number(cardRes.rows[0].current_balance)).toBe(200.00);

    const txOut = await client.query(`SELECT * FROM public.transactions WHERE id = $1`, [result.transaction_out_id]);
    expect(txOut.rows[0].type).toBe('card_payment');
    expect(txOut.rows[0].direction).toBe('out');
    expect(Number(txOut.rows[0].amount)).toBe(200.00);

    const txIn = await client.query(`SELECT * FROM public.transactions WHERE id = $1`, [result.transaction_in_id]);
    expect(txIn.rows[0].type).toBe('card_payment');
    expect(txIn.rows[0].direction).toBe('in');
    expect(Number(txIn.rows[0].amount)).toBe(Number(result.amount_net));
  });

  it('4. Tipo/BIN incompatível rejeitado: cartão crédito solicitado como débito ou vice-versa', async () => {
    await client.query(`SET ROLE service_role;`);

    // Cartão de débito chamado com tipo 'credito' -> rejeitado
    await expect(
      client.query(`
        SELECT public.process_card_payment(
          p_merchant_account_id := $1,
          p_card_id := $2,
          p_card_number := '5898123456789012',
          p_validade := '12/30',
          p_cvv := '123',
          p_amount := 50.00,
          p_tipo := 'credito',
          p_api_key_id := $3
        );
      `, [merchantAccId, debitCardId, apiKeyId])
    ).rejects.toThrow(/ERRO 57: Tipo de cartão incompatível/);

    // Cartão de crédito chamado com tipo 'debito' -> rejeitado
    await expect(
      client.query(`
        SELECT public.process_card_payment(
          p_merchant_account_id := $1,
          p_card_id := $2,
          p_card_number := '5899123456789012',
          p_validade := '12/30',
          p_cvv := '123',
          p_amount := 50.00,
          p_tipo := 'debito',
          p_api_key_id := $3
        );
      `, [merchantAccId, creditCardId, apiKeyId])
    ).rejects.toThrow(/ERRO 57: Tipo de cartão incompatível/);
  });

  it('5. Lookup por quatro dígitos impossível: deve exigir número completo exato ou card_id', async () => {
    await client.query(`SET ROLE service_role;`);

    // Tentar localizar apenas pelos últimos 4 dígitos no número -> ERRO de prefixo ou não encontrado
    await expect(
      client.query(`
        SELECT public.process_card_payment(
          p_merchant_account_id := $1,
          p_card_number := '9012',
          p_validade := '12/30',
          p_cvv := '123',
          p_amount := 50.00,
          p_tipo := 'credito',
          p_api_key_id := $2
        );
      `, [merchantAccId, apiKeyId])
    ).rejects.toThrow(/ERRO 05|ERRO 14/);

    // Sem card_id e sem card_number -> ERRO 16
    await expect(
      client.query(`
        SELECT public.process_card_payment(
          p_merchant_account_id := $1,
          p_validade := '12/30',
          p_cvv := '123',
          p_amount := 50.00,
          p_tipo := 'credito',
          p_api_key_id := $2
        );
      `, [merchantAccId, apiKeyId])
    ).rejects.toThrow(/ERRO 16: É obrigatório informar o identificador do cartão ou o número completo/);

    // Com card_id mas número divergente -> ERRO 15
    await expect(
      client.query(`
        SELECT public.process_card_payment(
          p_merchant_account_id := $1,
          p_card_id := $2,
          p_card_number := '5899000000000000',
          p_validade := '12/30',
          p_cvv := '123',
          p_amount := 50.00,
          p_tipo := 'credito',
          p_api_key_id := $3
        );
      `, [merchantAccId, creditCardId, apiKeyId])
    ).rejects.toThrow(/ERRO 15: O número de cartão informado não corresponde ao cartão fornecido/);
  });

  it('6. CVV/validade ausentes ou incorretos rejeitados', async () => {
    await client.query(`SET ROLE service_role;`);

    // CVV ausente
    await expect(
      client.query(`
        SELECT public.process_card_payment(
          p_merchant_account_id := $1,
          p_card_id := $2,
          p_validade := '12/30',
          p_amount := 50.00,
          p_tipo := 'credito',
          p_api_key_id := $3
        );
      `, [merchantAccId, creditCardId, apiKeyId])
    ).rejects.toThrow(/ERRO 55: Código de segurança CVV é obrigatório/);

    // CVV incorreto
    await expect(
      client.query(`
        SELECT public.process_card_payment(
          p_merchant_account_id := $1,
          p_card_id := $2,
          p_cvv := '999',
          p_validade := '12/30',
          p_amount := 50.00,
          p_tipo := 'credito',
          p_api_key_id := $3
        );
      `, [merchantAccId, creditCardId, apiKeyId])
    ).rejects.toThrow(/ERRO 55: Código CVV incorreto/);

    // Validade ausente
    await expect(
      client.query(`
        SELECT public.process_card_payment(
          p_merchant_account_id := $1,
          p_card_id := $2,
          p_cvv := '123',
          p_amount := 50.00,
          p_tipo := 'credito',
          p_api_key_id := $3
        );
      `, [merchantAccId, creditCardId, apiKeyId])
    ).rejects.toThrow(/ERRO 54: Data de validade do cartão é obrigatória/);

    // Validade incorreta
    await expect(
      client.query(`
        SELECT public.process_card_payment(
          p_merchant_account_id := $1,
          p_card_id := $2,
          p_cvv := '123',
          p_validade := '11/30',
          p_amount := 50.00,
          p_tipo := 'credito',
          p_api_key_id := $3
        );
      `, [merchantAccId, creditCardId, apiKeyId])
    ).rejects.toThrow(/ERRO 54: Data de validade do cartão incorreta/);
  });

  it('7. Cartão expirado rejeitado', async () => {
    await client.query(`SET ROLE service_role;`);

    await expect(
      client.query(`
        SELECT public.process_card_payment(
          p_merchant_account_id := $1,
          p_card_id := $2,
          p_cvv := '999',
          p_validade := '01/20',
          p_amount := 50.00,
          p_tipo := 'credito',
          p_api_key_id := $3
        );
      `, [merchantAccId, expiredCardId, apiKeyId])
    ).rejects.toThrow(/ERRO 54: Cartão expirado/);
  });

  it('8. Pix cross-account e ator obrigatório rejeitados', async () => {
    await client.query(`SET ROLE service_role;`);

    // Ator NULL no service_role -> Rejeitado
    await expect(
      client.query(`
        SELECT public.transfer_pix(
          p_sender_account_id := $1,
          p_receiver_pix_key := $2,
          p_amount := 10.00,
          p_actor_user_id := NULL
        );
      `, [customerAccId, pixKeyMerchant])
    ).rejects.toThrow(/p_actor_user_id é obrigatório para transferências Pix via service_role/);

    // Ator que não é dono da conta pagadora -> Rejeitado
    await expect(
      client.query(`
        SELECT public.transfer_pix(
          p_sender_account_id := $1,
          p_receiver_pix_key := $2,
          p_amount := 10.00,
          p_actor_user_id := $3
        );
      `, [customerAccId, pixKeyMerchant, userAId]) // userAId é dono da conta merchant, não customer
    ).rejects.toThrow(/não é o proprietário da conta pagadora/);
  });

  it('9. Idempotência: mesma chave retorna mesmo resultado sem nova movimentação', async () => {
    await client.query(`SET ROLE service_role;`);

    // 1ª chamada Pix
    const res1 = await client.query(`
      SELECT public.transfer_pix(
        p_sender_account_id := $1,
        p_receiver_pix_key := $2,
        p_amount := 50.00,
        p_actor_user_id := $3,
        p_idempotency_key := $4,
        p_request_hash := 'hash-pix-repeat-001'
      ) AS result;
    `, [customerAccId, pixKeyMerchant, userBId, 'key-idemp-repeat-001']);

    expect(res1.rows[0].result.success).toBe(true);

    const balanceAfter1 = await client.query(`SELECT balance FROM public.accounts WHERE id = $1`, [customerAccId]);

    // 2ª chamada Pix idêntica
    const res2 = await client.query(`
      SELECT public.transfer_pix(
        p_sender_account_id := $1,
        p_receiver_pix_key := $2,
        p_amount := 50.00,
        p_actor_user_id := $3,
        p_idempotency_key := $4,
        p_request_hash := 'hash-pix-repeat-001'
      ) AS result;
    `, [customerAccId, pixKeyMerchant, userBId, 'key-idemp-repeat-001']);

    expect(res2.rows[0].result.success).toBe(true);
    expect(res2.rows[0].result.from_cache).toBe(true);

    const balanceAfter2 = await client.query(`SELECT balance FROM public.accounts WHERE id = $1`, [customerAccId]);
    expect(balanceAfter2.rows[0].balance).toBe(balanceAfter1.rows[0].balance);
  });

  it('10. Chamada concorrente: chave in_progress gera erro IDEMPOTENCY_IN_PROGRESS sem takeover', async () => {
    await client.query(`SET ROLE service_role;`);

    const inProgressKey = `key-in-progress-${Date.now()}`;

    // Insere manualmente uma chave como in_progress criada há mais de 3 minutos
    await client.query(`
      INSERT INTO public.api_idempotency_keys (
        account_id,
        operation,
        idempotency_key,
        request_hash,
        status,
        created_at,
        updated_at
      ) VALUES (
        $1,
        'cards:charge',
        $2,
        'hash-test-concurrency',
        'in_progress',
        now() - INTERVAL '3 minutes',
        now() - INTERVAL '3 minutes'
      );
    `, [merchantAccId, inProgressKey]);

    // Tentativa concorrente não assume o processamento: deve lançar IDEMPOTENCY_IN_PROGRESS
    await expect(
      client.query(`
        SELECT public.process_card_payment(
          p_merchant_account_id := $1,
          p_card_id := $2,
          p_card_number := '5899123456789012',
          p_validade := '12/30',
          p_cvv := '123',
          p_amount := 30.00,
          p_tipo := 'credito',
          p_api_key_id := $3,
          p_idempotency_key := $4,
          p_request_hash := 'hash-test-concurrency'
        );
      `, [merchantAccId, creditCardId, apiKeyId, inProgressKey])
    ).rejects.toThrow(/IDEMPOTENCY_IN_PROGRESS/);
  });

  it('11. Matriz MDR PostgreSQL = cardRules.ts para todas as combinações', async () => {
    const plans: SettlementPlanType[] = ['standard', 'd7', 'd15', 'due_date', 'ontime', 'nitro'];
    const tipos: ('debito' | 'credito')[] = ['credito', 'debito'];

    for (const tipo of tipos) {
      for (const plan of plans) {
        for (let inst = 1; inst <= 12; inst++) {
          if (tipo === 'debito' && inst > 1) continue;

          const tsFee = calculateCardFee(100, tipo, inst, plan);

          const sqlRes = await client.query(`
            SELECT public.calculate_card_mdr_rate($1, $2, $3) AS rate;
          `, [tipo, plan, inst]);

          const sqlRate = Number(sqlRes.rows[0].rate);
          expect(sqlRate).toBeCloseTo(tsFee.feePercent, 4);
        }
      }
    }
  });

  it('12. Webhook retry worker & single claim: dois workers simultâneos produzem apenas um claim', async () => {
    await client.query(`SET ROLE service_role;`);

    // Cria config de webhook
    const configRes = await client.query(`
      INSERT INTO public.webhooks_config (account_id, url, events, secret)
      VALUES ($1, 'https://example.com/webhook', ARRAY['card.paid'], 'whsec_test')
      RETURNING id;
    `, [merchantAccId]);
    const configId = configRes.rows[0].id;

    // Cria evento
    const eventRes = await client.query(`
      INSERT INTO public.webhook_events (account_id, event_type, resource_type, resource_id, idempotency_key, payload)
      VALUES ($1, 'card.paid', 'transaction', gen_random_uuid()::text, gen_random_uuid()::text, '{"test": true}'::jsonb)
      RETURNING id;
    `, [merchantAccId]);
    const eventId = eventRes.rows[0].id;

    // Cria delivery job com status 'retry' e vencido
    const jobRes = await client.query(`
      INSERT INTO public.webhook_delivery_jobs (event_id, webhook_config_id, status, attempt_count, next_attempt_at)
      VALUES ($1, $2, 'retry', 1, now() - INTERVAL '1 minute')
      RETURNING id;
    `, [eventId, configId]);
    const jobId = jobRes.rows[0].id;

    // 1. get_eligible_webhook_job_ids deve listar o job sem fazer lock
    const eligibleRes = await client.query(`
      SELECT id FROM public.get_eligible_webhook_job_ids(50);
    `);
    const eligibleIds = eligibleRes.rows.map(r => r.id);
    expect(eligibleIds).toContain(jobId);

    // O status ainda é 'retry' (sem lock prévio pelo worker)
    const checkJob = await client.query(`SELECT status FROM public.webhook_delivery_jobs WHERE id = $1`, [jobId]);
    expect(checkJob.rows[0].status).toBe('retry');

    // 2. Duas conexões pg.Client físicas e distintas disputam claim_single_webhook_job concorrentemente
    const clientAlpha = new Client({ connectionString: TEST_DB_URL });
    const clientBeta = new Client({ connectionString: TEST_DB_URL });
    await Promise.all([clientAlpha.connect(), clientBeta.connect()]);

    await Promise.all([
      clientAlpha.query(`SET ROLE service_role;`),
      clientBeta.query(`SET ROLE service_role;`),
    ]);

    const [claim1, claim2] = await Promise.all([
      clientAlpha.query(`SELECT * FROM public.claim_single_webhook_job($1, 'worker-alpha', false)`, [jobId]),
      clientBeta.query(`SELECT * FROM public.claim_single_webhook_job($1, 'worker-beta', false)`, [jobId]),
    ]);

    await Promise.all([clientAlpha.end(), clientBeta.end()]);

    const claimsCount = claim1.rows.length + claim2.rows.length;
    expect(claimsCount).toBe(1);

    const winnerWorker = claim1.rows.length === 1 ? claim1.rows[0].locked_by : claim2.rows[0].locked_by;
    expect(['worker-alpha', 'worker-beta']).toContain(winnerWorker);
  });

  it('13. Ciclo Completo de Retry no Banco: 1º envio resulta em 500, worker seleciona e 2º envio 200 entrega com logs imutáveis', async () => {
    await client.query(`SET ROLE service_role;`);

    // 1. Setup de webhook config e evento
    const configRes = await client.query(`
      INSERT INTO public.webhooks_config (account_id, url, events, secret)
      VALUES ($1, 'https://merchant-api.example.com/webhook', ARRAY['card.paid'], 'whsec_test_retry_123')
      RETURNING id;
    `, [merchantAccId]);
    const configId = configRes.rows[0].id;

    const eventRes = await client.query(`
      INSERT INTO public.webhook_events (account_id, event_type, resource_type, resource_id, idempotency_key, payload)
      VALUES ($1, 'card.paid', 'transaction', gen_random_uuid()::text, gen_random_uuid()::text, '{"orderId": "PED-RETRY-001", "amount": 120.0}'::jsonb)
      RETURNING id;
    `, [merchantAccId]);
    const eventId = eventRes.rows[0].id;

    const jobRes = await client.query(`
      INSERT INTO public.webhook_delivery_jobs (event_id, webhook_config_id, status, attempt_count, next_attempt_at)
      VALUES ($1, $2, 'pending', 0, now())
      RETURNING id;
    `, [eventId, configId]);
    const jobId = jobRes.rows[0].id;

    // 2. Primeira tentativa: claim atômico pelo dispatcher
    const claim1 = await client.query(`
      SELECT * FROM public.claim_single_webhook_job($1, 'dispatcher-node-1', false);
    `, [jobId]);
    expect(claim1.rows.length).toBe(1);
    expect(claim1.rows[0].status).toBe('delivering');

    // Simula resposta HTTP 500 na fronteira de transporte do webhook
    await client.query(`
      UPDATE public.webhook_delivery_jobs
      SET status = 'retry',
          attempt_count = 1,
          last_response_status = 500,
          last_error = 'HTTP 500 Internal Server Error',
          locked_at = null,
          locked_by = null,
          next_attempt_at = now() - INTERVAL '1 second'
      WHERE id = $1;
    `, [jobId]);

    await client.query(`
      INSERT INTO public.webhooks_log (
        user_id, webhook_config_id, event, payload, response_status, response_body, attempt_count, delivered_at
      ) VALUES (
        $1, $2, 'card.paid', '{"orderId": "PED-RETRY-001"}'::jsonb, 500, '{"error": "Internal Error"}', 1, now()
      );
    `, [userAId, configId]);

    // 3. Worker executa busca de jobs elegíveis: encontra o job com status 'retry' vencido
    const eligibleRes = await client.query(`
      SELECT id FROM public.get_eligible_webhook_job_ids(50);
    `);
    const eligibleIds = eligibleRes.rows.map((r) => r.id);
    expect(eligibleIds).toContain(jobId);

    // 4. Segunda tentativa (retry): claim atômico pelo dispatcher
    const claim2 = await client.query(`
      SELECT * FROM public.claim_single_webhook_job($1, 'dispatcher-node-2', false);
    `, [jobId]);
    expect(claim2.rows.length).toBe(1);
    expect(claim2.rows[0].status).toBe('delivering');

    // Simula resposta HTTP 200 na fronteira de transporte
    await client.query(`
      UPDATE public.webhook_delivery_jobs
      SET status = 'delivered',
          attempt_count = 2,
          last_response_status = 200,
          last_error = null,
          locked_at = null,
          locked_by = null
      WHERE id = $1;
    `, [jobId]);

    await client.query(`
      INSERT INTO public.webhooks_log (
        user_id, webhook_config_id, event, payload, response_status, response_body, attempt_count, delivered_at
      ) VALUES (
        $1, $2, 'card.paid', '{"orderId": "PED-RETRY-001"}'::jsonb, 200, '{"received": true}', 2, now()
      );
    `, [userAId, configId]);

    // 5. Verificação final dos dados no PostgreSQL
    const finalJob = await client.query(`SELECT status, attempt_count, last_response_status FROM public.webhook_delivery_jobs WHERE id = $1`, [jobId]);
    expect(finalJob.rows[0].status).toBe('delivered');
    expect(finalJob.rows[0].attempt_count).toBe(2);
    expect(finalJob.rows[0].last_response_status).toBe(200);

    // Valida os logs imutáveis: exatamente 2 registros de auditoria (1 falha 500 e 1 sucesso 200)
    const logs = await client.query(`
      SELECT attempt_count, response_status
      FROM public.webhooks_log
      WHERE webhook_config_id = $1
      ORDER BY attempt_count ASC;
    `, [configId]);
    expect(logs.rows.length).toBe(2);
    expect(logs.rows[0].response_status).toBe(500);
    expect(logs.rows[1].response_status).toBe(200);
  });
});
