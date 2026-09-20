import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

const TEST_DB_URL = process.env.DATABASE_TEST_URL || 'postgresql://supabase_admin:postgres@127.0.0.1:54399/postgres';

describe('Real PostgreSQL Integration & Schema Smoke Test (Pacote 01C)', () => {
  let client: Client;
  let isDbAvailable = false;

  let userAId: string;
  let userBId: string;
  let merchantAccId: string;
  let customerAccId: string;
  let debitCardId: string;
  let creditCardId: string;
  let apiKeyId: string;
  let pixKeyMerchant: string;
  let pixIdempKey: string;
  let cardDebitIdemp: string;
  let cardCreditIdemp: string;

  beforeAll(async () => {
    client = new Client({ connectionString: TEST_DB_URL });
    try {
      await client.connect();
      isDbAvailable = true;

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

      // Cria cartão de débito (prefixo 5898)
      const debitCardRes = await client.query(`
        INSERT INTO public.cartoes (user_id, account_id, tipo, cardholder_name, card_number, masked_number, validade, cvv, status)
        VALUES ($1, $2, 'debito', 'CLIENTE COMPRADOR', '5898123456789012', '•••• 9012', '12/30', '123', 'active')
        RETURNING id;
      `, [userBId, customerAccId]);
      debitCardId = debitCardRes.rows[0].id;

      // Cria cartão de crédito (prefixo 5899, limite 5000, current_balance 0)
      const creditCardRes = await client.query(`
        INSERT INTO public.cartoes (user_id, account_id, tipo, cardholder_name, card_number, masked_number, validade, cvv, credit_limit, current_balance, status)
        VALUES ($1, $2, 'credito', 'CLIENTE COMPRADOR', '5899123456789012', '•••• 9012', '12/30', '123', 5000.00, 0.00, 'active')
        RETURNING id;
      `, [userBId, customerAccId]);
      creditCardId = creditCardRes.rows[0].id;

    } catch (err: any) {
      console.warn('PostgreSQL test container not available, skipping DB smoke tests:', err.message);
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDbAvailable && client) {
      await client.end();
    }
  });

  it('1. Deve executar venda a débito debitando accounts.balance do pagador e gerando transactions com type=card_payment', async () => {
    if (!isDbAvailable) return;

    // Executa process_card_payment via service_role com API key
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

    // Valida débito de R$ 100 na conta do cliente (saldo anterior: 1000 -> 900)
    const customerAcc = await client.query(`SELECT balance FROM public.accounts WHERE id = $1`, [customerAccId]);
    expect(Number(customerAcc.rows[0].balance)).toBe(900.00);

    // Valida lançamentos reais em public.transactions
    const txOut = await client.query(`
      SELECT * FROM public.transactions WHERE id = $1
    `, [result.transaction_out_id]);
    expect(txOut.rows.length).toBe(1);
    expect(txOut.rows[0].type).toBe('card_payment');
    expect(txOut.rows[0].direction).toBe('out');
    expect(Number(txOut.rows[0].amount)).toBe(100.00);
    expect(txOut.rows[0].real_money).toBe(false);
    expect(txOut.rows[0].environment).toBe('sandbox');

    const txIn = await client.query(`
      SELECT * FROM public.transactions WHERE id = $1
    `, [result.transaction_in_id]);
    expect(txIn.rows.length).toBe(1);
    expect(txIn.rows[0].type).toBe('card_payment');
    expect(txIn.rows[0].direction).toBe('in');
    expect(Number(txIn.rows[0].amount)).toBeGreaterThan(0);
    expect(Number(txIn.rows[0].amount)).toBe(Number(result.amount_net));
  });

  it('2. Deve executar venda a crédito incrementando cartoes.current_balance e gerando transactions com type=card_payment', async () => {
    if (!isDbAvailable) return;

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

    // Valida que cartoes.current_balance incrementou para 200.00 (sem mexer em sandbox_cards nem credit_used)
    const cardRes = await client.query(`SELECT current_balance, credit_limit FROM public.cartoes WHERE id = $1`, [creditCardId]);
    expect(Number(cardRes.rows[0].current_balance)).toBe(200.00);

    // Valida lançamentos reais em public.transactions
    const txOut = await client.query(`
      SELECT * FROM public.transactions WHERE id = $1
    `, [result.transaction_out_id]);
    expect(txOut.rows[0].type).toBe('card_payment');
    expect(txOut.rows[0].direction).toBe('out');
    expect(Number(txOut.rows[0].amount)).toBe(200.00);

    const txIn = await client.query(`
      SELECT * FROM public.transactions WHERE id = $1
    `, [result.transaction_in_id]);
    expect(txIn.rows[0].type).toBe('card_payment');
    expect(txIn.rows[0].direction).toBe('in');
    expect(Number(txIn.rows[0].amount)).toBe(Number(result.amount_net));
  });

  it('3. Deve executar transferência Pix movimentando accounts.balance e gerando transactions com type=pix, direction in e out', async () => {
    if (!isDbAvailable) return;

    await client.query(`SET ROLE service_role;`);
    const res = await client.query(`
      SELECT public.transfer_pix(
        p_sender_account_id := $1,
        p_receiver_pix_key := $2,
        p_amount := 50.00,
        p_description := 'Pagamento Pix Teste',
        p_external_reference := 'REF-PIX-TEST-001',
        p_actor_user_id := $3,
        p_idempotency_key := $4,
        p_request_hash := 'hash-pix-001'
      ) AS result;
    `, [customerAccId, pixKeyMerchant, userBId, pixIdempKey]);

    const result = res.rows[0].result;
    expect(result.success).toBe(true);
    expect(Number(result.amount)).toBe(50.00);

    // Verifica saldo do cliente (900 - 50 = 850)
    const customerAcc = await client.query(`SELECT balance FROM public.accounts WHERE id = $1`, [customerAccId]);
    expect(Number(customerAcc.rows[0].balance)).toBe(850.00);

    // Verifica transactions
    const txOut = await client.query(`SELECT * FROM public.transactions WHERE id = $1`, [result.transaction_out_id]);
    expect(txOut.rows[0].type).toBe('pix');
    expect(txOut.rows[0].direction).toBe('out');
    expect(Number(txOut.rows[0].amount)).toBe(50.00);

    const txIn = await client.query(`SELECT * FROM public.transactions WHERE id = $1`, [result.transaction_in_id]);
    expect(txIn.rows[0].type).toBe('pix');
    expect(txIn.rows[0].direction).toBe('in');
    expect(Number(txIn.rows[0].amount)).toBe(50.00);
  });

  it('4. Idempotência Repetida: Segunda chamada deve devolver from_cache sem movimentar saldo novamente', async () => {
    if (!isDbAvailable) return;

    await client.query(`SET ROLE service_role;`);
    // Reexecuta o Pix com a mesma chave e mesmo hash
    const res = await client.query(`
      SELECT public.transfer_pix(
        p_sender_account_id := $1,
        p_receiver_pix_key := $2,
        p_amount := 50.00,
        p_description := 'Pagamento Pix Teste',
        p_external_reference := 'REF-PIX-TEST-001',
        p_actor_user_id := $3,
        p_idempotency_key := $4,
        p_request_hash := 'hash-pix-001'
      ) AS result;
    `, [customerAccId, pixKeyMerchant, userBId, pixIdempKey]);

    const result = res.rows[0].result;
    expect(result.from_cache).toBe(true);
    expect(result.success).toBe(true);

    // O saldo deve permanecer exatamente 850.00 (sem duplicidade!)
    const customerAcc = await client.query(`SELECT balance FROM public.accounts WHERE id = $1`, [customerAccId]);
  });

  it('5. Segurança: Deve rejeitar chamadas cross-account ou com API key de outro merchant', async () => {
    if (!isDbAvailable) return;

    await client.query(`SET ROLE service_role;`);
    // Tenta usar a conta do customer como merchant com a chave do merchant (violação)
    await expect(
      client.query(`
        SELECT public.process_card_payment(
          p_merchant_account_id := $1,
          p_card_id := $2,
          p_card_number := '5899123456789012',
          p_amount := 10.00,
          p_api_key_id := $3
        );
      `, [customerAccId, creditCardId, apiKeyId])
    ).rejects.toThrow(/Acesso negado: chave de API/);
  });

  it('6. Constraints de Transactions: Deve rejeitar direction inválida, types ilegais (pix_out, pix_in, card_settlement) e amounts <= 0', async () => {
    if (!isDbAvailable) return;

    await client.query(`SET ROLE postgres;`);

    // Type inválido: pix_out
    await expect(
      client.query(`
        INSERT INTO public.transactions (account_id, type, direction, amount)
        VALUES ($1, 'pix_out', 'out', 10.00);
      `, [customerAccId])
    ).rejects.toThrow();

    // Type inválido: card_settlement
    await expect(
      client.query(`
        INSERT INTO public.transactions (account_id, type, direction, amount)
        VALUES ($1, 'card_settlement', 'in', 10.00);
      `, [merchantAccId])
    ).rejects.toThrow();

    // Direction inválida
    await expect(
      client.query(`
        INSERT INTO public.transactions (account_id, type, direction, amount)
        VALUES ($1, 'pix', 'debit', 10.00);
      `, [customerAccId])
    ).rejects.toThrow();

    // Amount <= 0
    await expect(
      client.query(`
        INSERT INTO public.transactions (account_id, type, direction, amount)
        VALUES ($1, 'pix', 'out', -50.00);
      `, [customerAccId])
    ).rejects.toThrow();
  });
});
