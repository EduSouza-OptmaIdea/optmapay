import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateCardFee } from '../src/lib/cardRules';
import cardChargeHandler from '../api/sandbox/v1/cards/charge';

describe('Financial Hardening & Invariant Tests', () => {
  function createMockRes() {
    const res: any = {
      statusCode: 200,
      jsonBody: null,
      headers: {},
      setHeader(name: string, value: string) {
        this.headers[name] = value;
        return this;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.jsonBody = data;
        return this;
      },
    };
    return res;
  }

  beforeEach(async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-123';

    vi.spyOn(await import('../api/_lib/supabaseAdmin'), 'getSupabaseAdmin').mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'idemp-rec-1' }, error: null }),
          }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({
        data: { success: true, transaction_in_id: 'tx-123', fee_percent: 2.99, fee_amount: 2.99, amount_net: 97.01 },
        error: null,
      }),
    } as any);
  });

  describe('Invariant: net_amount <= gross_amount', () => {
    const testAmounts = [10.0, 99.99, 1000.5, 5000.0, 0.01];
    const plans: ('standard' | 'accelerated_1d' | 'instant')[] = ['standard', 'accelerated_1d', 'instant'];
    const types: ('debito' | 'credito')[] = ['debito', 'credito'];

    testAmounts.forEach((amount) => {
      plans.forEach((plan) => {
        types.forEach((tipo) => {
          const installments = tipo === 'credito' ? 3 : 1;
          it(`garante net <= gross para valor ${amount}, tipo ${tipo}, plano ${plan}`, () => {
            const fee = calculateCardFee(amount, tipo, installments, plan);
            expect(fee.feeAmount).toBeGreaterThanOrEqual(0);
            expect(fee.netAmount).toBeLessThanOrEqual(amount);
            expect(fee.netAmount).toBe(Number((amount - fee.feeAmount).toFixed(2)));
          });
        });
      });
    });
  });

  describe('Mandatory Card Details Validation (no mock fallbacks)', () => {
    it('deve rejeitar transação sem expirationDate informado', async () => {
      const req: any = {
        method: 'POST',
        headers: { 'idempotency-key': 'idem-test-1', 'x-api-key': 'optmapay_test_key' },
        body: {
          orderId: 'ORD-123',
          cardNumber: '5555444433332222',
          cvv: '123',
          amount: 100.0,
          // expirationDate ausente propositalmente
        },
      };
      const res = createMockRes();

      vi.spyOn(await import('../api/_lib/apiKeyAuth'), 'authenticateApiKey').mockResolvedValue({
        accountId: 'acc-123',
        key: { id: 'key-123', accountId: 'acc-123' },
      } as any);

      await cardChargeHandler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody?.error?.code).toBe('MISSING_EXPIRATION_DATE');
    });

    it('deve rejeitar transação sem CVV ou com CVV inválido', async () => {
      const req: any = {
        method: 'POST',
        headers: { 'idempotency-key': 'idem-test-2', 'x-api-key': 'optmapay_test_key' },
        body: {
          orderId: 'ORD-124',
          cardNumber: '5555444433332222',
          expirationDate: '12/28',
          cvv: '', // CVV vazio
          amount: 100.0,
        },
      };
      const res = createMockRes();

      vi.spyOn(await import('../api/_lib/apiKeyAuth'), 'authenticateApiKey').mockResolvedValue({
        accountId: 'acc-123',
        key: { id: 'key-123', accountId: 'acc-123' },
      } as any);

      await cardChargeHandler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody?.error?.code).toBe('INVALID_CVV');
    });

    it('deve rejeitar transação se amount for menor ou igual a zero', async () => {
      const req: any = {
        method: 'POST',
        headers: { 'idempotency-key': 'idem-test-3', 'x-api-key': 'optmapay_test_key' },
        body: {
          orderId: 'ORD-125',
          cardNumber: '5899000011112222',
          expirationDate: '12/28',
          cvv: '123',
          amount: -50.0,
        },
      };
      const res = createMockRes();

      vi.spyOn(await import('../api/_lib/apiKeyAuth'), 'authenticateApiKey').mockResolvedValue({
        accountId: 'acc-123',
        key: { id: 'key-123', accountId: 'acc-123' },
      } as any);

      await cardChargeHandler(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody?.error?.code).toBe('INVALID_AMOUNT');
    });
  });
});
