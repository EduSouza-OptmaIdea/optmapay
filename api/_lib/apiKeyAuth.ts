import crypto from 'node:crypto';
import { getSupabaseAdmin } from './supabaseAdmin';
import { sendError } from './http';

export interface AuthenticatedApiKey {
  id: string;
  userId: string | null;
  accountId: string;
  keyName: string;
  keyId: string;
  keyHash: string;
  keyPrefix: string;
  keyLast4: string;
  scopes: string[];
  active: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface GeneratedKeyResult {
  fullKey: string;
  keyId: string;
  keyHash: string;
  keyPrefix: string;
  keyLast4: string;
  scopes: string[];
}

export function generateApiKeyTokens(scopes: string[] = []): GeneratedKeyResult {
  const keyId = crypto.randomBytes(8).toString('hex');
  const secret = crypto.randomBytes(32).toString('base64url');
  const fullKey = `sk_test_optmapay_${keyId}_${secret}`;
  const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex').toLowerCase();
  const keyPrefix = `sk_test_optmapay_${keyId}`;
  const keyLast4 = secret.slice(-4);

  return {
    fullKey,
    keyId,
    keyHash,
    keyPrefix,
    keyLast4,
    scopes,
  };
}

export function parseApiKey(authHeader?: string): { keyId: string; fullKey: string } | null {
  if (!authHeader || typeof authHeader !== 'string') return null;

  let token = authHeader.trim();
  if (token.startsWith('Bearer ')) {
    token = token.slice(7).trim();
  }

  // Format: sk_test_optmapay_<16hex>_<secret>
  if (!token.startsWith('sk_test_optmapay_')) return null;

  const parts = token.split('_');
  // parts: ['sk', 'test', 'optmapay', '<keyId>', '<secret>']
  if (parts.length < 5) return null;

  const keyId = parts[3];
  if (!/^[0-9a-fA-F]{16}$/.test(keyId)) return null;

  return { keyId, fullKey: token };
}

export async function authenticateApiKey(
  req: any,
  res: any,
  requiredScope?: string
): Promise<{ key: AuthenticatedApiKey; accountId: string } | null> {
  const authHeader = req.headers['authorization'];
  const accountHeader = req.headers['x-optmapay-account-id'];

  if (!authHeader) {
    sendError(res, 401, 'MISSING_AUTHORIZATION', 'Header Authorization com Bearer sk_test_... é obrigatório.');
    return null;
  }

  if (!accountHeader || typeof accountHeader !== 'string' || !accountHeader.trim()) {
    sendError(res, 400, 'MISSING_ACCOUNT_HEADER', 'Header x-optmapay-account-id é obrigatório.');
    return null;
  }

  const parsed = parseApiKey(authHeader);
  if (!parsed) {
    sendError(res, 401, 'INVALID_API_KEY', 'API key inválida.');
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data: record, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key_id', parsed.keyId)
    .maybeSingle();

  if (error || !record || !record.key_hash) {
    sendError(res, 401, 'INVALID_API_KEY', 'API key inválida.');
    return null;
  }

  // Constant-time SHA-256 verification
  const computedHash = crypto.createHash('sha256').update(parsed.fullKey).digest('hex').toLowerCase();
  const expectedHash = record.key_hash.toLowerCase();

  const computedBuf = Buffer.from(computedHash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');

  if (computedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(computedBuf, expectedBuf)) {
    sendError(res, 401, 'INVALID_API_KEY', 'API key inválida.');
    return null;
  }

  if (!record.active || record.revoked_at !== null) {
    sendError(res, 401, 'REVOKED_API_KEY', 'API key inválida ou revogada.');
    return null;
  }

  if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) {
    sendError(res, 401, 'EXPIRED_API_KEY', 'API key expirada.');
    return null;
  }

  // Account binding
  const cleanAccountId = accountHeader.trim();
  if (record.account_id && record.account_id.toLowerCase() !== cleanAccountId.toLowerCase()) {
    sendError(
      res,
      403,
      'FORBIDDEN_ACCOUNT',
      'A conta informada no header x-optmapay-account-id não corresponde à conta vinculada a esta chave.'
    );
    return null;
  }

  // Scope check
  if (requiredScope) {
    const scopes: string[] = record.scopes || [];
    if (!scopes.includes(requiredScope) && !scopes.includes('*')) {
      sendError(
        res,
        403,
        'INSUFFICIENT_SCOPE',
        `Esta API key não possui o escopo necessário para esta operação (${requiredScope}).`
      );
      return null;
    }
  }

  // Fire-and-forget last_used_at update
  try {
    Promise.resolve(
      supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', record.id)
    ).catch(() => {});
  } catch {}

  const authenticatedKey: AuthenticatedApiKey = {
    id: record.id,
    userId: record.user_id,
    accountId: record.account_id || cleanAccountId,
    keyName: record.key_name,
    keyId: record.key_id,
    keyHash: record.key_hash,
    keyPrefix: record.key_prefix,
    keyLast4: record.key_last4,
    scopes: record.scopes || [],
    active: record.active,
    expiresAt: record.expires_at,
    revokedAt: record.revoked_at,
  };

  return { key: authenticatedKey, accountId: authenticatedKey.accountId };
}
