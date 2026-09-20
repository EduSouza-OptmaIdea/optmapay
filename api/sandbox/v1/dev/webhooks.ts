import crypto from 'node:crypto';
import { getSupabaseAdmin, getSupabaseUserClient } from '../../../_lib/supabaseAdmin';
import { deriveWebhookSecret } from '../../../_lib/webhookSigner';
import { dispatchWebhookJob } from '../../../_lib/dispatcher';
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
  const action = (req.query?.action as string) || (req.body?.action as string) || 'list';

  // 0. INTERNAL-DISPATCH: Rota interna segura consumida por Edge Functions via token interno
  if (action === 'internal-dispatch' && req.method === 'POST') {
    const expectedToken = process.env.OPTMAPAY_INTERNAL_DISPATCH_TOKEN;
    const internalToken =
      req.headers['x-optmapay-internal-token'] ||
      (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');

    if (!expectedToken || !internalToken || internalToken !== expectedToken) {
      return sendError(res, 401, 'UNAUTHORIZED', 'Token interno de dispatch ausente ou inválido.');
    }

    const { jobId, isManualRetry } = req.body || {};
    if (!jobId) {
      return sendError(res, 400, 'MISSING_JOB_ID', 'jobId é obrigatório para disparo interno.');
    }

    try {
      const dispatchResult = await dispatchWebhookJob(jobId, Boolean(isManualRetry));
      return sendSuccess(res, 200, {
        success: dispatchResult.status === 'delivered',
        dispatchResult,
      });
    } catch (err: any) {
      return sendError(res, 500, 'DISPATCH_ERROR', err.message || 'Erro ao processar disparo interno.');
    }
  }

  const authInfo = await getAuthenticatedUser(req);
  if (!authInfo) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Sessão de usuário inválida ou expirada.');
  }

  const { user, token } = authInfo;
  const adminClient = getSupabaseAdmin();
  const userClient = getSupabaseUserClient(token);

  // 1. LIST: Listar webhooks de uma conta (com validação estrita de ownership)
  if (req.method === 'GET' || action === 'list') {
    const accountId = (req.query?.accountId as string) || (req.body?.accountId as string);

    if (accountId) {
      // Valida se a conta pertence ao usuário solicitante
      const { data: accCheck, error: accErr } = await userClient
        .from('accounts')
        .select('id')
        .eq('id', accountId)
        .maybeSingle();

      if (accErr || !accCheck) {
        return sendError(res, 403, 'FORBIDDEN_ACCOUNT', 'A conta indicada não pertence ao usuário autenticado.');
      }

      const { data: configs, error } = await userClient
        .from('webhooks_config')
        .select('id, account_id, url, events, active, secret_last4, requires_secret_rotation, created_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });

      if (error) {
        return sendError(res, 500, 'DATABASE_ERROR', 'Erro ao consultar configurações de webhooks.');
      }

      return sendSuccess(res, 200, {
        webhooks: (configs || []).map((c: any) => ({
          id: c.id,
          accountId: c.account_id,
          url: c.url,
          events: c.events || [],
          active: c.active,
          secretLast4: c.secret_last4,
          requiresSecretRotation: c.requires_secret_rotation,
          createdAt: c.created_at,
        })),
      });
    } else {
      // Filtra pelas contas do usuário logado
      const { data: userAccounts } = await userClient
        .from('accounts')
        .select('id');
      const accIds = (userAccounts || []).map((a: any) => a.id);

      const { data: configs, error } = await userClient
        .from('webhooks_config')
        .select('id, account_id, url, events, active, secret_last4, requires_secret_rotation, created_at')
        .in('account_id', accIds.length > 0 ? accIds : ['00000000-0000-0000-0000-000000000000'])
        .order('created_at', { ascending: false });

      if (error) {
        return sendError(res, 500, 'DATABASE_ERROR', 'Erro ao consultar configurações de webhooks.');
      }

      return sendSuccess(res, 200, {
        webhooks: (configs || []).map((c: any) => ({
          id: c.id,
          accountId: c.account_id,
          url: c.url,
          events: c.events || [],
          active: c.active,
          secretLast4: c.secret_last4,
          requiresSecretRotation: c.requires_secret_rotation,
          createdAt: c.created_at,
        })),
      });
    }
  }

  // 2. CREATE: Cadastrar novo webhook com segredo derivado estritamente via service_role
  if (action === 'create' && req.method === 'POST') {
    const { accountId, url, events } = req.body || {};

    if (!accountId || !url) {
      return sendError(res, 400, 'MISSING_FIELDS', 'accountId e url são obrigatórios.');
    }

    // Valida propriedade da conta usando o cliente do usuário
    const { data: account, error: accErr } = await userClient
      .from('accounts')
      .select('id')
      .eq('id', accountId)
      .maybeSingle();

    if (accErr || !account) {
      return sendError(res, 403, 'FORBIDDEN_ACCOUNT', 'A conta indicada não pertence ao usuário.');
    }

    const configId = crypto.randomUUID();
    const derived = deriveWebhookSecret(configId);

    const newConfigData = {
      id: configId,
      user_id: user.id,
      account_id: accountId,
      url: String(url).trim(),
      events: Array.isArray(events) && events.length > 0
        ? events
        : ['pix.paid', 'card.paid', 'payment.settled', 'order.paid'],
      secret_salt: derived.salt,
      secret_version: derived.version,
      secret_last4: derived.last4,
      requires_secret_rotation: false,
      active: true,
    };

    const { data: inserted, error } = await adminClient
      .from('webhooks_config')
      .insert(newConfigData)
      .select('*')
      .single();

    if (error || !inserted) {
      return sendError(res, 500, 'WEBHOOK_CREATION_FAILED', `Erro ao cadastrar endpoint de webhook: ${error?.message || ''}`);
    }

    // Retorna o segredo completo uma única vez
    return sendSuccess(res, 201, {
      id: inserted.id,
      accountId: inserted.account_id,
      url: inserted.url,
      events: inserted.events,
      active: inserted.active,
      webhookSecret: derived.publicSecret, // Exibido apenas na criação
      secretLast4: derived.last4,
      createdAt: inserted.created_at,
    });
  }

  // 3. ROTATE-SECRET: Rotacionar segredo de webhook via service_role com verificação de user_id
  if (action === 'rotate-secret' && req.method === 'POST') {
    const { configId } = req.body || {};

    if (!configId) {
      return sendError(res, 400, 'MISSING_CONFIG_ID', 'ID da configuração de webhook é obrigatório.');
    }

    const { data: config, error: findErr } = await adminClient
      .from('webhooks_config')
      .select('*')
      .eq('id', configId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (findErr || !config) {
      return sendError(res, 404, 'CONFIG_NOT_FOUND', 'Configuração de webhook não encontrada ou não pertence ao usuário.');
    }

    const nextVersion = (config.secret_version || 1) + 1;
    const derived = deriveWebhookSecret(config.id, undefined, nextVersion);

    const { error: updateErr } = await adminClient
      .from('webhooks_config')
      .update({
        secret_salt: derived.salt,
        secret_version: derived.version,
        secret_last4: derived.last4,
        requires_secret_rotation: false,
        active: true,
      })
      .eq('id', configId)
      .eq('user_id', user.id);

    if (updateErr) {
      return sendError(res, 500, 'ROTATION_FAILED', 'Erro ao rotacionar segredo do webhook.');
    }

    // Retorna o novo segredo gerado uma única vez
    return sendSuccess(res, 200, {
      id: config.id,
      webhookSecret: derived.publicSecret, // Exibido apenas na rotação
      secretLast4: derived.last4,
      version: derived.version,
      message: 'Segredo rotacionado com sucesso!',
    });
  }

  // 4. RETRY-DELIVERY: Reenvio manual validando estritamente que o job pertence ao usuário solicitante
  if (action === 'retry-delivery' && req.method === 'POST') {
    const { deliveryJobId } = req.body || {};

    if (!deliveryJobId) {
      return sendError(res, 400, 'MISSING_JOB_ID', 'deliveryJobId é obrigatório para reenvio.');
    }

    // Validação estrita: job -> config -> account/user pertence ao usuário
    const { data: job, error: jobErr } = await adminClient
      .from('webhook_delivery_jobs')
      .select(`
        id,
        webhook_config_id,
        webhooks_config (
          id,
          user_id,
          account_id
        )
      `)
      .eq('id', deliveryJobId)
      .maybeSingle();

    if (jobErr || !job || !job.webhooks_config) {
      return sendError(res, 404, 'JOB_NOT_FOUND', 'Job de entrega não encontrado.');
    }

    const configOwnerId = (job.webhooks_config as any).user_id;
    if (configOwnerId !== user.id) {
      return sendError(res, 403, 'FORBIDDEN_JOB', 'O job de entrega informado não pertence à sua conta.');
    }

    try {
      const dispatchResult = await dispatchWebhookJob(deliveryJobId, true);
      return sendSuccess(res, 200, {
        retryExecuted: true,
        dispatchResult,
      });
    } catch (err: any) {
      return sendError(res, 500, 'RETRY_DISPATCH_FAILED', err.message || 'Falha ao processar reenvio do webhook.');
    }
  }

  return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Ação ou método não suportado.`);
}
