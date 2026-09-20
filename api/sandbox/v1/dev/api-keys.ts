import { getSupabaseAdmin, getSupabaseUserClient } from '../../../_lib/supabaseAdmin';
import { generateApiKeyTokens } from '../../../_lib/apiKeyAuth';
import { sendError, sendSuccess } from '../../../_lib/http';

async function getAuthenticatedUser(req: any) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7).trim();
  const supabase = getSupabaseAdmin();
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return { user, token };
}

export default async function handler(req: any, res: any) {
  const authInfo = await getAuthenticatedUser(req);
  if (!authInfo) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Sessão de usuário inválida ou expirada.');
  }

  const { user, token } = authInfo;
  const adminClient = getSupabaseAdmin();
  const userClient = getSupabaseUserClient(token);

  // 1. GET: Listar chaves do usuário (apenas metadados)
  if (req.method === 'GET') {
    const accountId = req.query?.accountId as string;

    let query = userClient
      .from('api_keys')
      .select('id, account_id, key_name, key_prefix, key_last4, scopes, active, last_used_at, created_at')
      .eq('user_id', user.id);

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data: keys, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return sendError(res, 500, 'DATABASE_ERROR', 'Erro ao consultar chaves de API.');
    }

    return sendSuccess(res, 200, {
      keys: (keys || []).map((k: any) => ({
        id: k.id,
        accountId: k.account_id,
        keyName: k.key_name,
        prefix: k.key_prefix,
        last4: k.key_last4,
        scopes: k.scopes || [],
        active: k.active,
        lastUsedAt: k.last_used_at,
        createdAt: k.created_at,
      })),
    });
  }

  // 2. POST: Gerar nova chave de API (CSPRNG, persiste SHA-256 e entrega fullKey UMA ÚNICA VEZ)
  if (req.method === 'POST') {
    const { accountId, keyName, scopes } = req.body || {};

    if (!accountId) {
      return sendError(res, 400, 'MISSING_ACCOUNT_ID', 'O accountId é obrigatório para geração da chave.');
    }

    // Confirma se accountId pertence ao usuário da sessão usando o token do usuário
    const { data: account, error: accErr } = await userClient
      .from('accounts')
      .select('id')
      .eq('id', accountId)
      .maybeSingle();

    if (accErr || !account) {
      return sendError(res, 403, 'FORBIDDEN_ACCOUNT', 'A conta indicada não pertence ao usuário autenticado.');
    }

    const effectiveScopes =
      Array.isArray(scopes) && scopes.length > 0
        ? scopes
        : ['account:read', 'transactions:read', 'cards:charge', 'pix:transfer', 'refunds:create'];

    const tokens = generateApiKeyTokens(effectiveScopes);

    // Tenta primeiro via RPC segura
    const { data: rpcRes, error: rpcErr } = await userClient.rpc('create_sandbox_api_key', {
      p_account_id: accountId,
      p_key_name: keyName ? String(keyName).trim() : 'Chave Sandbox API',
      p_key_id: tokens.keyId,
      p_key_hash: tokens.keyHash,
      p_key_prefix: tokens.keyPrefix,
      p_key_last4: tokens.keyLast4,
      p_scopes: effectiveScopes,
    });

    let insertedId: string | null = null;
    let createdAt: string = new Date().toISOString();

    if (!rpcErr && rpcRes && rpcRes.success) {
      insertedId = rpcRes.id;
      createdAt = rpcRes.created_at;
    } else {
      // Fallback: inserção direta via adminClient ou userClient
      let insertRes = await adminClient
        .from('api_keys')
        .insert({
          user_id: user.id,
          account_id: accountId,
          key_name: keyName ? String(keyName).trim() : 'Chave Sandbox API',
          key_id: tokens.keyId,
          key_hash: tokens.keyHash,
          key_prefix: tokens.keyPrefix,
          key_last4: tokens.keyLast4,
          scopes: effectiveScopes,
          active: true,
          created_by: user.id,
        })
        .select('id, created_at')
        .single();

      if (insertRes.error) {
        insertRes = await userClient
          .from('api_keys')
          .insert({
            user_id: user.id,
            account_id: accountId,
            key_name: keyName ? String(keyName).trim() : 'Chave Sandbox API',
            key_id: tokens.keyId,
            key_hash: tokens.keyHash,
            key_prefix: tokens.keyPrefix,
            key_last4: tokens.keyLast4,
            scopes: effectiveScopes,
            active: true,
            created_by: user.id,
          })
          .select('id, created_at')
          .single();
      }

      if (insertRes.error || !insertRes.data) {
        return sendError(res, 500, 'KEY_GENERATION_FAILED', `Erro ao salvar a nova chave de API: ${insertRes.error?.message || ''}`);
      }

      insertedId = insertRes.data.id;
      createdAt = insertRes.data.created_at;
    }

    // Retorna a chave completa UMA ÚNICA VEZ
    return sendSuccess(res, 201, {
      id: insertedId,
      accountId,
      keyName: keyName || 'Chave Sandbox API',
      fullKey: tokens.fullKey, // Exibida apenas neste retorno
      prefix: tokens.keyPrefix,
      last4: tokens.keyLast4,
      scopes: effectiveScopes,
      active: true,
      createdAt,
    });
  }

  // 3. DELETE: Revogação lógica da chave (active=false, revoked_at=now())
  if (req.method === 'DELETE') {
    const keyId = (req.query?.id as string) || req.body?.id;

    if (!keyId) {
      return sendError(res, 400, 'MISSING_KEY_ID', 'ID da chave a ser revogada é obrigatório.');
    }

    let revokeErr: any = null;
    const { error: rpcErr } = await userClient.rpc('revoke_sandbox_api_key', { p_key_id: keyId });
    if (rpcErr) {
      const adminRes = await adminClient
        .from('api_keys')
        .update({
          active: false,
          revoked_at: new Date().toISOString(),
        })
        .eq('id', keyId)
        .eq('user_id', user.id);

      if (adminRes.error) {
        const userRes = await userClient
          .from('api_keys')
          .update({
            active: false,
            revoked_at: new Date().toISOString(),
          })
          .eq('id', keyId)
          .eq('user_id', user.id);
        revokeErr = userRes.error;
      }
    }

    if (revokeErr) {
      return sendError(res, 500, 'REVOCATION_FAILED', 'Erro ao revogar chave de API.');
    }

    return sendSuccess(res, 200, {
      revoked: true,
      message: 'Chave revogada com sucesso.',
    });
  }

  return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Método ${req.method} não suportado.`);
}
