import crypto from 'node:crypto';
import { getSupabaseAdmin } from './supabaseAdmin';
import { sendError } from './http';

export interface IdempotencyCheckResult {
  action: 'proceed' | 'return_cached' | 'error';
  recordId?: string;
  cachedResponse?: {
    status: number;
    body: any;
  };
}

export function hashRequestBody(body: any): string {
  if (!body) return crypto.createHash('sha256').update('').digest('hex');
  // Ordena chaves para garantir serialização canônica e estável
  const canonicalString = JSON.stringify(body, Object.keys(body).sort());
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

export async function processIdempotency(
  res: any,
  accountId: string,
  apiKeyId: string,
  operation: string,
  idempotencyKeyHeader?: string,
  body?: any
): Promise<IdempotencyCheckResult> {
  if (!idempotencyKeyHeader || typeof idempotencyKeyHeader !== 'string') {
    sendError(res, 400, 'MISSING_IDEMPOTENCY_KEY', 'Header Idempotency-Key é obrigatório para operações de mutação.');
    return { action: 'error' };
  }

  const idempotencyKey = idempotencyKeyHeader.trim();
  if (idempotencyKey.length < 1 || idempotencyKey.length > 128) {
    sendError(res, 400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key deve conter entre 1 e 128 caracteres.');
    return { action: 'error' };
  }

  const requestHash = hashRequestBody(body);
  const supabase = getSupabaseAdmin();

  // 1. Busca registro existente
  const { data: existing, error: selectErr } = await supabase
    .from('api_idempotency_keys')
    .select('*')
    .eq('account_id', accountId)
    .eq('operation', operation)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (selectErr) {
    console.error('[Idempotency Select Error]', selectErr);
  }

  if (existing) {
    // Mesma key, body diferente -> 409
    if (existing.request_hash !== requestHash) {
      sendError(
        res,
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'A chave de idempotência informada já foi utilizada para uma requisição com corpo/parâmetros distintos.'
      );
      return { action: 'error' };
    }

    // Chamada concorrente ainda em processamento -> 409
    if (existing.status === 'in_progress') {
      sendError(
        res,
        409,
        'IDEMPOTENCY_IN_PROGRESS',
        'Uma requisição com esta mesma chave de idempotência já está em processamento no momento.'
      );
      return { action: 'error' };
    }

    // Já concluída com sucesso -> retorna resposta cacheada
    if (existing.status === 'completed') {
      return {
        action: 'return_cached',
        cachedResponse: {
          status: existing.response_status || 200,
          body: existing.response_body,
        },
      };
    }
  }

  // 2. Cria registro inicial in_progress
  const { data: inserted, error: insertErr } = await supabase
    .from('api_idempotency_keys')
    .insert({
      account_id: accountId,
      api_key_id: apiKeyId,
      operation,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
      status: 'in_progress',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();

  if (insertErr) {
    // Caso de corrida (race condition) onde outra requisição acabou de inserir a mesma chave
    if (insertErr.code === '23505') {
      sendError(
        res,
        409,
        'IDEMPOTENCY_IN_PROGRESS',
        'Requisição concorrente detectada com a mesma chave de idempotência.'
      );
      return { action: 'error' };
    }

    console.error('[Idempotency Insert Error]', insertErr);
    sendError(res, 500, 'IDEMPOTENCY_STORAGE_ERROR', 'Erro interno ao inicializar controle de idempotência.');
    return { action: 'error' };
  }

  return {
    action: 'proceed',
    recordId: inserted?.id,
  };
}

export async function completeIdempotency(
  recordId: string,
  responseStatus: number,
  responseBody: any,
  resourceType?: string,
  resourceId?: string
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase
      .from('api_idempotency_keys')
      .update({
        status: 'completed',
        response_status: responseStatus,
        response_body: responseBody,
        resource_type: resourceType || null,
        resource_id: resourceId || null,
      })
      .eq('id', recordId);
  } catch (err) {
    console.error('[Complete Idempotency Error]', err);
  }
}
