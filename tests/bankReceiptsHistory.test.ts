import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_TEST_URL
  || 'postgresql://supabase_admin:postgres@127.0.0.1:54399/postgres';

describe('Histórico seguro de comprovantes bancários sandbox', () => {
  const db = new Client({ connectionString });
  let sender = '';
  let recipient = '';
  let senderAccount = '';
  let recipientAccount = '';

  beforeAll(async () => {
    await db.connect();
    const suffix = Math.floor(Math.random() * 89999999) + 10000000;
    sender = (await db.query(
      'INSERT INTO auth.users(email,email_confirmed_at) VALUES($1,now()) RETURNING id',
      [`receipt-sender-${suffix}@example.invalid`],
    )).rows[0].id;
    recipient = (await db.query(
      'INSERT INTO auth.users(email,email_confirmed_at) VALUES($1,now()) RETURNING id',
      [`receipt-receiver-${suffix}@example.invalid`],
    )).rows[0].id;
    senderAccount = (await db.query(
      "INSERT INTO public.accounts(user_id,name,type,cpf_cnpj,balance,pix_key,account_number) VALUES($1,'Comprovante Teste PF','customer',$2,2000,$3,$4) RETURNING id",
      [sender,`7${suffix}10`,`rec-sender-${suffix}@pix.invalid`,`RCS-${suffix}`],
    )).rows[0].id;
    recipientAccount = (await db.query(
      "INSERT INTO public.accounts(user_id,name,type,cpf_cnpj,balance,pix_key,account_number) VALUES($1,'Destino de Teste','merchant',$2,10000,$3,$4) RETURNING id",
      [recipient,`8${suffix}20`,`rec-receiver-${suffix}@pix.invalid`,`RCR-${suffix}`],
    )).rows[0].id;
  });

  afterAll(async () => {
    if(sender) await db.query('DELETE FROM auth.users WHERE id=$1', [sender]);
    if(recipient) await db.query('DELETE FROM auth.users WHERE id=$1', [recipient]);
    await db.end();
  });

  const asUser = async (id: string) => {
    await db.query('SET LOCAL ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [id]);
    await db.query("SELECT set_config('request.jwt.claim.role','authenticated',true)");
  };

  it('reabre o recibo original de depósito, sem expor chave de idempotência', async () => {
    await db.query('BEGIN');
    try {
      await asUser(sender);
      const quote = (await db.query(
        'SELECT public.sandbox_deposit_quote($1,10.05) AS q', [senderAccount],
      )).rows[0].q;
      const issued = (await db.query(
        'SELECT public.sandbox_deposit_confirm($1,10.05,$2,$3,$4) AS r',
        [senderAccount,'Teste seguro do recibo',`receipt-test-${sender}`,quote.fee_amount],
      )).rows[0].r;
      expect(issued.success).toBe(true);
      const listed = (await db.query(
        "SELECT public.bank_receipts_list($1,'deposit','',NULL,NULL,20,0) AS data",
        [senderAccount],
      )).rows[0].data;
      expect(listed.items.some((x: { receipt_id:string }) => x.receipt_id===issued.operation_id)).toBe(true);
      const receipt = (await db.query(
        "SELECT public.bank_receipt_get($1,'deposit',$2) AS r",
        [senderAccount,issued.operation_id],
      )).rows[0].r;
      expect(Number(receipt.amount)).toBe(10.05);
      expect(receipt.transaction_id).toBe(issued.transaction_id);
      expect(receipt.idempotency_key).toBeUndefined();
      expect(receipt.receipt_label).toContain('Comprovante fictício OptmaPay');
      expect(receipt.account_name).toBe('Comprovante Teste PF');
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('separa Pix enviado, recebido e devolução, paginando sem misturar contas', async () => {
    await db.query('BEGIN');
    try {
      const outId = (await db.query(
        "INSERT INTO public.transactions(user_id,account_id,counterparty_account_id,counterparty_name,type,direction,amount,description,external_reference,status,environment,real_money) VALUES($1,$2,$3,'Destino de Teste','pix','out',25.50,'Pix fictício de homologação','receipt-ref-unique-52','completed','sandbox',false) RETURNING id",
        [sender,senderAccount,recipientAccount],
      )).rows[0].id;
      const inId = (await db.query(
        "INSERT INTO public.transactions(user_id,account_id,counterparty_account_id,counterparty_name,type,direction,amount,description,external_reference,status,environment,real_money) VALUES($1,$2,$3,'Comprovante Teste PF','pix','in',25.50,'Pix fictício de homologação','receipt-ref-unique-52','completed','sandbox',false) RETURNING id",
        [recipient,recipientAccount,senderAccount],
      )).rows[0].id;
      const refundId = (await db.query(
        "INSERT INTO public.transactions(user_id,account_id,counterparty_account_id,counterparty_name,type,direction,amount,description,external_reference,status,environment,real_money,related_transaction_id) VALUES($1,$2,$3,'Destino de Teste','pix','out',5.00,'Devolução Pix fictícia','receipt-refund-unique','completed','sandbox',false,$4) RETURNING id",
        [sender,senderAccount,recipientAccount,outId],
      )).rows[0].id;
      await asUser(sender);
      const sent = (await db.query(
        "SELECT public.bank_receipts_list($1,'pix_sent','',NULL,NULL,1,0) AS r",
        [senderAccount],
      )).rows[0].r;
      expect(sent.items).toHaveLength(1);
      expect(sent.items[0].receipt_id).toBe(outId);
      const refunds = (await db.query(
        "SELECT public.bank_receipts_list($1,'pix_refund','',NULL,NULL,20,0) AS r",
        [senderAccount],
      )).rows[0].r;
      expect(refunds.items.some((x: {receipt_id:string})=>x.receipt_id===refundId)).toBe(true);
      const receipt = (await db.query(
        "SELECT public.bank_receipt_get($1,'pix_sent',$2) AS r",
        [senderAccount,outId],
      )).rows[0].r;
      expect(receipt.sender_name).toBe('Comprovante Teste PF');
      expect(receipt.receiver_name).toBe('Destino de Teste');
      expect(receipt.pix_keys_are_current).toBe(true);
      expect(receipt.reference).toBe('receipt-ref-unique-52');

      await db.query('SET LOCAL ROLE postgres');
      await asUser(recipient);
      const received = (await db.query(
        "SELECT public.bank_receipts_list($1,'pix_received','receipt-ref-unique-52',NULL,NULL,20,0) AS r",
        [recipientAccount],
      )).rows[0].r;
      expect(received.items.some((x:{receipt_id:string})=>x.receipt_id===inId)).toBe(true);
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('impede acesso de um correntista aos comprovantes de outra pessoa', async () => {
    await db.query('BEGIN');
    try {
      await asUser(recipient);
      await db.query('SAVEPOINT forbidden_list');
      await expect(db.query(
        "SELECT public.bank_receipts_list($1,'all','',NULL,NULL,20,0)",
        [senderAccount],
      )).rejects.toThrow(/Acesso negado/);
      await db.query('ROLLBACK TO SAVEPOINT forbidden_list');
      await db.query('SAVEPOINT forbidden_get');
      await expect(db.query(
        "SELECT public.bank_receipt_get($1,'deposit',$2)",
        [senderAccount,'00000000-0000-4000-8000-000000000001'],
      )).rejects.toThrow(/Acesso negado/);
      await db.query('ROLLBACK TO SAVEPOINT forbidden_get');
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('rejeita categorias e intervalos inválidos antes de consultar o histórico', async () => {
    await db.query('BEGIN');
    try {
      await asUser(sender);
      await db.query('SAVEPOINT invalid');
      await expect(db.query(
        "SELECT public.bank_receipts_list($1,'unknown','',NULL,NULL,20,0)",
        [senderAccount],
      )).rejects.toThrow(/Filtros/);
      await db.query('ROLLBACK TO SAVEPOINT invalid');
      await db.query('SAVEPOINT interval');
      await expect(db.query(
        "SELECT public.bank_receipts_list($1,'all','','2026-10-20'::date,'2026-10-01'::date,20,0)",
        [senderAccount],
      )).rejects.toThrow(/Filtros/);
      await db.query('ROLLBACK TO SAVEPOINT interval');
    } finally {
      await db.query('ROLLBACK');
    }
  });
});
