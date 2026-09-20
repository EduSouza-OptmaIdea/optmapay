import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hashRequestBody,
  processIdempotency,
  completeIdempotency,
} from '../api/_lib/idempotency';
import * as supabaseAdminModule from '../api/_lib/supabaseAdmin';

describe('Server-Side Idempotency Control', () => {
  describe('hashRequestBody', () => {
    it('deve produzir o mesmo hash independentemente da ordem das chaves no objeto', () => {
      const bodyA = { amount: 100.0, orderId: 'PED-123', tipo: 'credito' };
      const bodyB = { tipo: 'credito', amount: 100.0, orderId: 'PED-123' };

      expect(hashRequestBody(bodyA)).toBe(hashRequestBody(bodyB));
    });

    it('deve produzir hashes diferentes para corpos com valores distintos', () => {
      const bodyA = { amount: 10.0, orderId: 'PED-123' };
      const bodyB = { amount: 11.0, orderId: 'PED-123' };

      expect(hashRequestBody(bodyA)).not.toBe(hashRequestBody(bodyB));
    });
  });

  describe('processIdempotency workflow', () => {
    let mockSupabase: any;
    const accountId = 'acc_123';
    const apiKeyId = 'key_123';
    const operation = 'cards:charge';
    const idempotencyKey = 'idemp_unique_key_001';

    beforeEach(() => {
      mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn(),
        update: vi.fn().mockReturnThis(),
      };
      vi.spyOn(supabaseAdminModule, 'getSupabaseAdmin').mockReturnValue(mockSupabase);
    });

    const createMockRes = () => {
      const res: any = {
        statusCode: 200,
        headers: {},
        jsonData: null,
        setHeader(k: string, v: string) {
          res.headers[k] = v;
        },
        status(code: number) {
          res.statusCode = code;
          return res;
        },
        json(data: any) {
          res.jsonData = data;
          return res;
        },
      };
      return res;
    };

    it('requisição sem header Idempotency-Key -> 400 MISSING_IDEMPOTENCY_KEY', async () => {
      const res = createMockRes();
      const check = await processIdempotency(res, accountId, apiKeyId, operation, undefined, { amount: 10 });

      expect(check.action).toBe('error');
      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error.code).toBe('MISSING_IDEMPOTENCY_KEY');
    });

    it('primeira chamada válida -> action proceed com recordId criado', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null }); // Não existe ainda
      mockSupabase.single.mockResolvedValueOnce({ data: { id: 'idemp_record_uuid_1' }, error: null });

      const res = createMockRes();
      const body = { amount: 10.0, orderId: 'PED-1' };

      const check = await processIdempotency(res, accountId, apiKeyId, operation, idempotencyKey, body);

      expect(check.action).toBe('proceed');
      expect(check.recordId).toBe('idemp_record_uuid_1');
    });

    it('segunda chamada com MESMA Idempotency-Key e MESMO corpo -> retorna resposta em cache', async () => {
      const body = { amount: 10.0, orderId: 'PED-1' };
      const reqHash = hashRequestBody(body);

      const cachedBody = {
        success: true,
        data: { transactionId: 'tx_card_9999', amountGross: 10.0 },
      };

      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'idemp_record_uuid_1',
          status: 'completed',
          request_hash: reqHash,
          response_status: 200,
          response_body: cachedBody,
        },
        error: null,
      });

      const res = createMockRes();
      const check = await processIdempotency(res, accountId, apiKeyId, operation, idempotencyKey, body);

      expect(check.action).toBe('return_cached');
      expect(check.cachedResponse?.status).toBe(200);
      expect(check.cachedResponse?.body.data.transactionId).toBe('tx_card_9999');
    });

    it('mesma Idempotency-Key com corpo diferente (R$ 10 depois R$ 11) -> 409 IDEMPOTENCY_KEY_REUSED', async () => {
      const originalBody = { amount: 10.0, orderId: 'PED-1' };
      const originalHash = hashRequestBody(originalBody);

      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'idemp_record_uuid_1',
          status: 'completed',
          request_hash: originalHash,
          response_status: 200,
        },
        error: null,
      });

      const differentBody = { amount: 11.0, orderId: 'PED-1' }; // Alterado para 11
      const res = createMockRes();

      const check = await processIdempotency(res, accountId, apiKeyId, operation, idempotencyKey, differentBody);

      expect(check.action).toBe('error');
      expect(res.statusCode).toBe(409);
      expect(res.jsonData.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('chamada concorrente enquanto primeira está in_progress -> 409 IDEMPOTENCY_IN_PROGRESS', async () => {
      const body = { amount: 10.0, orderId: 'PED-1' };
      const reqHash = hashRequestBody(body);

      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'idemp_record_uuid_1',
          status: 'in_progress', // Ainda processando
          request_hash: reqHash,
        },
        error: null,
      });

      const res = createMockRes();
      const check = await processIdempotency(res, accountId, apiKeyId, operation, idempotencyKey, body);

      expect(check.action).toBe('error');
      expect(res.statusCode).toBe(409);
      expect(res.jsonData.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
    });
  });
});
