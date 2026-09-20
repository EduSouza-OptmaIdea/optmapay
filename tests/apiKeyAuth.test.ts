import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  generateApiKeyTokens,
  parseApiKey,
  authenticateApiKey,
} from '../api/_lib/apiKeyAuth';
import * as supabaseAdminModule from '../api/_lib/supabaseAdmin';

describe('API Key Authentication & Security Hardening', () => {
  describe('generateApiKeyTokens & parseApiKey', () => {
    it('deve gerar chave no formato oficial sk_test_optmapay_<keyId>_<secret> com CSPRNG', () => {
      const scopes = ['account:read', 'cards:charge'];
      const tokens = generateApiKeyTokens(scopes);

      expect(tokens.fullKey.startsWith('sk_test_optmapay_')).toBe(true);
      expect(tokens.keyId).toMatch(/^[0-9a-f]{16}$/); // 8 bytes aleatórios -> 16 hex chars
      expect(tokens.keyPrefix).toBe(`sk_test_optmapay_${tokens.keyId}`);
      expect(tokens.keyLast4.length).toBe(4);

      // Confirma que o hash persistido é SHA-256 da chave completa em hexadecimal lowercase
      const computedHash = crypto.createHash('sha256').update(tokens.fullKey).digest('hex').toLowerCase();
      expect(tokens.keyHash).toBe(computedHash);

      const parsed = parseApiKey(`Bearer ${tokens.fullKey}`);
      expect(parsed).not.toBeNull();
      expect(parsed?.keyId).toBe(tokens.keyId);
      expect(parsed?.fullKey).toBe(tokens.fullKey);
    });

    it('deve rejeitar chave malformada', () => {
      expect(parseApiKey('')).toBeNull();
      expect(parseApiKey('Bearer invalid_token')).toBeNull();
      expect(parseApiKey('Bearer sk_test_optmapay_curta')).toBeNull();
      expect(parseApiKey('Bearer sk_test_optmapay_nothexchar12345_secret')).toBeNull();
    });
  });

  describe('authenticateApiKey middleware unit testing', () => {
    let mockSupabase: any;

    const mockAccount = 'acc_12345678-1234-1234-1234-123456789abc';
    const tokens = generateApiKeyTokens(['account:read', 'cards:charge']);

    const validRecord = {
      id: 'key_record_id_1',
      user_id: 'user_123',
      account_id: mockAccount,
      key_name: 'Chave Teste',
      key_id: tokens.keyId,
      key_hash: tokens.keyHash,
      key_prefix: tokens.keyPrefix,
      key_last4: tokens.keyLast4,
      scopes: ['account:read', 'cards:charge'],
      active: true,
      expires_at: null,
      revoked_at: null,
    };

    beforeEach(() => {
      mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: validRecord, error: null }),
        then: (fn: any) => Promise.resolve({ data: validRecord, error: null }).then(fn),
      };
      // Permite encadeamento de eq() retornando thenable
      mockSupabase.eq.mockReturnValue(mockSupabase);
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

    it('sem Authorization header -> 401 MISSING_AUTHORIZATION', async () => {
      const req = { headers: { 'x-optmapay-account-id': mockAccount } };
      const res = createMockRes();

      const auth = await authenticateApiKey(req, res, 'account:read');
      expect(auth).toBeNull();
      expect(res.statusCode).toBe(401);
      expect(res.jsonData.error.code).toBe('MISSING_AUTHORIZATION');
    });

    it('chave malformada -> 401 INVALID_API_KEY', async () => {
      const req = {
        headers: {
          authorization: 'Bearer sk_test_chave_invalida',
          'x-optmapay-account-id': mockAccount,
        },
      };
      const res = createMockRes();

      const auth = await authenticateApiKey(req, res, 'account:read');
      expect(auth).toBeNull();
      expect(res.statusCode).toBe(401);
      expect(res.jsonData.error.code).toBe('INVALID_API_KEY');
    });

    it('chave não encontrada no banco -> 401 INVALID_API_KEY', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const req = {
        headers: {
          authorization: `Bearer ${tokens.fullKey}`,
          'x-optmapay-account-id': mockAccount,
        },
      };
      const res = createMockRes();

      const auth = await authenticateApiKey(req, res, 'account:read');
      expect(auth).toBeNull();
      expect(res.statusCode).toBe(401);
      expect(res.jsonData.error.code).toBe('INVALID_API_KEY');
    });

    it('hash errado (token forjado com key_id existente) -> 401 INVALID_API_KEY', async () => {
      const fakeSecretKey = `sk_test_optmapay_${tokens.keyId}_wrongSecretString9999999999999999999999`;
      const req = {
        headers: {
          authorization: `Bearer ${fakeSecretKey}`,
          'x-optmapay-account-id': mockAccount,
        },
      };
      const res = createMockRes();

      const auth = await authenticateApiKey(req, res, 'account:read');
      expect(auth).toBeNull();
      expect(res.statusCode).toBe(401);
      expect(res.jsonData.error.code).toBe('INVALID_API_KEY');
    });

    it('chave revogada (active = false ou revoked_at preenchido) -> 401 REVOKED_API_KEY', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { ...validRecord, active: false, revoked_at: new Date().toISOString() },
        error: null,
      });

      const req = {
        headers: {
          authorization: `Bearer ${tokens.fullKey}`,
          'x-optmapay-account-id': mockAccount,
        },
      };
      const res = createMockRes();

      const auth = await authenticateApiKey(req, res, 'account:read');
      expect(auth).toBeNull();
      expect(res.statusCode).toBe(401);
      expect(res.jsonData.error.code).toBe('REVOKED_API_KEY');
    });

    it('chave expirada -> 401 EXPIRED_API_KEY', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { ...validRecord, expires_at: new Date(Date.now() - 10000).toISOString() },
        error: null,
      });

      const req = {
        headers: {
          authorization: `Bearer ${tokens.fullKey}`,
          'x-optmapay-account-id': mockAccount,
        },
      };
      const res = createMockRes();

      const auth = await authenticateApiKey(req, res, 'account:read');
      expect(auth).toBeNull();
      expect(res.statusCode).toBe(401);
      expect(res.jsonData.error.code).toBe('EXPIRED_API_KEY');
    });

    it('conta do header diferente da conta vinculada à chave -> 403 FORBIDDEN_ACCOUNT', async () => {
      const req = {
        headers: {
          authorization: `Bearer ${tokens.fullKey}`,
          'x-optmapay-account-id': 'acc_outra_conta_hacker',
        },
      };
      const res = createMockRes();

      const auth = await authenticateApiKey(req, res, 'account:read');
      expect(auth).toBeNull();
      expect(res.statusCode).toBe(403);
      expect(res.jsonData.error.code).toBe('FORBIDDEN_ACCOUNT');
    });

    it('escopo ausente para a operação -> 403 INSUFFICIENT_SCOPE', async () => {
      const req = {
        headers: {
          authorization: `Bearer ${tokens.fullKey}`,
          'x-optmapay-account-id': mockAccount,
        },
      };
      const res = createMockRes();

      // Solicita escopo 'pix:transfer' mas a chave possui apenas account:read e cards:charge
      const auth = await authenticateApiKey(req, res, 'pix:transfer');
      expect(auth).toBeNull();
      expect(res.statusCode).toBe(403);
      expect(res.jsonData.error.code).toBe('INSUFFICIENT_SCOPE');
    });

    it('chave válida, ativa e com escopo correto -> 200 sucesso', async () => {
      const req = {
        headers: {
          authorization: `Bearer ${tokens.fullKey}`,
          'x-optmapay-account-id': mockAccount,
        },
      };
      const res = createMockRes();

      const auth = await authenticateApiKey(req, res, 'cards:charge');
      expect(auth).not.toBeNull();
      expect(auth?.accountId).toBe(mockAccount);
      expect(auth?.key.keyId).toBe(tokens.keyId);
    });
  });
});
