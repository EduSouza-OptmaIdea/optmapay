import crypto from 'node:crypto';
import https from 'node:https';
import { getSupabaseAdmin } from './supabaseAdmin';
import { validateWebhookUrlSsrf } from './ssrf';
import { deriveWebhookSecret, signWebhookPayload } from './webhookSigner';

export interface DispatchJobResult {
  jobId: string;
  status: 'delivered' | 'retry' | 'dead' | 'delivering';
  httpStatus?: number;
  deliveryId: string;
  attemptNo: number;
  errorMessage?: string;
}

const RETRY_DELAYS_SECONDS = [
  0,        // attempt 1 (imediato)
  60,       // attempt 2 (+1m)
  300,      // attempt 3 (+5m)
  900,      // attempt 4 (+15m)
  3600,     // attempt 5 (+60m)
];

export async function dispatchWebhookJob(
  jobId: string,
  isManualRetry: boolean = false
): Promise<DispatchJobResult> {
  const supabase = getSupabaseAdmin();
  const deliveryId = crypto.randomUUID();
  const requestTimestamp = new Date();

  // 1. Claim atômico do job antes de qualquer envio
  const { data: claimedRows, error: claimErr } = await supabase.rpc('claim_single_webhook_job', {
    p_job_id: jobId,
    p_locked_by: `dispatcher-${deliveryId}`,
    p_force_retry: isManualRetry,
  });

  if (claimErr || !claimedRows || claimedRows.length === 0) {
    // Não conseguiu claim (outro worker já capturou ou já foi entregue)
    return {
      jobId,
      status: 'delivering',
      deliveryId,
      attemptNo: 0,
      errorMessage: 'Job não elegível para envio ou já em processamento concorrente.',
    };
  }

  const job = claimedRows[0];

  // 2. Carrega o evento e a configuração do webhook
  const [eventRes, configRes] = await Promise.all([
    supabase.from('webhook_events').select('*').eq('id', job.event_id).single(),
    supabase.from('webhooks_config').select('*').eq('id', job.webhook_config_id).single(),
  ]);

  if (eventRes.error || !eventRes.data) {
    throw new Error(`Evento do webhook não encontrado (id: ${job.event_id}).`);
  }
  if (configRes.error || !configRes.data) {
    throw new Error(`Configuração do webhook não encontrada (id: ${job.webhook_config_id}).`);
  }

  const event = eventRes.data;
  const config = configRes.data;
  const attemptNo = job.attempt_count + 1;
  const startTime = Date.now();

  // 3. Validação SSRF server-side com resolução DNS
  const ssrfValidation = await validateWebhookUrlSsrf(config.url);
  if (!ssrfValidation.valid) {
    const durationMs = Date.now() - startTime;
    const errorMsg = `[SSRF Bloqueado] ${ssrfValidation.reason}`;

    // Atualiza o job para dead
    await supabase
      .from('webhook_delivery_jobs')
      .update({
        status: 'dead',
        attempt_count: attemptNo,
        last_response_status: 400,
        last_error: errorMsg,
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    // Registra tentativa imutável em webhooks_log
    await supabase.from('webhooks_log').insert({
      user_id: config.user_id,
      webhook_config_id: config.id,
      event_id: event.id,
      delivery_job_id: job.id,
      delivery_id: deliveryId,
      attempt_no: attemptNo,
      event: event.event_type,
      payload: event.payload,
      response_status: 400,
      response_body: JSON.stringify({
        error: errorMsg,
        realMoney: false,
        environment: 'sandbox',
      }),
      attempt_count: attemptNo,
      duration_ms: durationMs,
      outcome: 'failed',
      error_code: 'SSRF_BLOCKED',
      is_manual_retry: isManualRetry,
      request_timestamp: requestTimestamp.toISOString(),
      delivered_at: new Date().toISOString(),
    });

    return {
      jobId,
      status: 'dead',
      httpStatus: 400,
      deliveryId,
      attemptNo,
      errorMessage: errorMsg,
    };
  }

  // 4. Derivação do segredo e assinatura HMAC-SHA256 v1
  const derivedSecret = deriveWebhookSecret(config.id, config.secret_salt, config.secret_version || 1);
  const unixTimestamp = Math.floor(requestTimestamp.getTime() / 1000);
  const rawBody = JSON.stringify(event.payload);
  const signature = signWebhookPayload(derivedSecret.publicSecret, unixTimestamp, event.id, rawBody);

  // 5. Disparo seguro com DNS Pinning (anti-rebinding): conecta diretamente ao IP público validado
  const targetUrl = new URL(config.url);
  const pinnedIp = ssrfValidation.resolvedIps && ssrfValidation.resolvedIps.length > 0
    ? ssrfValidation.resolvedIps[0]
    : targetUrl.hostname;

  let responseStatus = 0;
  let responseBody = '';
  let outcome: 'success' | 'failed' = 'failed';
  let errorCode: string | undefined = undefined;

  try {
    const postResult = await new Promise<{ status: number; text: string }>((resolve, reject) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(rawBody).toString(),
        'Host': targetUrl.host,
        'x-optmapay-event': event.event_type,
        'x-optmapay-event-id': event.id,
        'x-optmapay-delivery-id': deliveryId,
        'x-optmapay-attempt': String(attemptNo),
        'x-optmapay-timestamp': String(unixTimestamp),
        'x-optmapay-signature': signature,
        'x-optmapay-real-money': 'false',
        'x-optmapay-environment': 'sandbox',
      };

      const req = https.request(
        {
          protocol: 'https:',
          host: pinnedIp, // Conecta diretamente ao IP previamente validado (anti DNS-rebinding)
          servername: targetUrl.hostname, // Preserva TLS SNI para o hostname original
          port: targetUrl.port ? parseInt(targetUrl.port, 10) : 443,
          method: 'POST',
          path: targetUrl.pathname + targetUrl.search,
          headers,
          timeout: 5000,
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            if (text.length < 4096) {
              text += chunk;
            }
          });
          res.on('end', () => {
            resolve({
              status: res.statusCode || 0,
              text: text.slice(0, 4096),
            });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error('TIMEOUT'));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(rawBody);
      req.end();
    });

    responseStatus = postResult.status;
    responseBody = postResult.text;

    if (responseStatus >= 200 && responseStatus < 300) {
      outcome = 'success';
    } else {
      errorCode = `HTTP_${responseStatus}`;
    }
  } catch (err: any) {
    outcome = 'failed';
    if (err.message === 'TIMEOUT' || err.name === 'AbortError') {
      responseStatus = 504;
      responseBody = 'Timeout de conexão (limite de 5000ms excedido)';
      errorCode = 'TIMEOUT';
    } else {
      responseStatus = 502;
      responseBody = `Falha de rede/transporte: ${err.message || 'Erro desconhecido'}`;
      errorCode = 'NETWORK_ERROR';
    }
  }

  const durationMs = Date.now() - startTime;

  // 6. Política de retry
  // Retry apenas para: timeout, network error, 408, 425, 429, 5xx
  const isRetryable =
    responseStatus === 408 ||
    responseStatus === 425 ||
    responseStatus === 429 ||
    responseStatus >= 500 ||
    errorCode === 'TIMEOUT' ||
    errorCode === 'NETWORK_ERROR';

  let nextStatus: 'delivered' | 'retry' | 'dead';
  let nextAttemptAt: Date | null = null;

  if (outcome === 'success') {
    nextStatus = 'delivered';
  } else if (isRetryable && attemptNo < 5) {
    nextStatus = 'retry';
    const delaySeconds = RETRY_DELAYS_SECONDS[attemptNo] || 3600;
    nextAttemptAt = new Date(Date.now() + delaySeconds * 1000);
  } else {
    // 4xx definitivo ou 5ª falha esgotada
    nextStatus = 'dead';
  }

  // 7. Atualização do job
  await supabase
    .from('webhook_delivery_jobs')
    .update({
      status: nextStatus,
      attempt_count: attemptNo,
      next_attempt_at: nextAttemptAt ? nextAttemptAt.toISOString() : null,
      last_response_status: responseStatus,
      last_error: outcome === 'failed' ? responseBody.slice(0, 500) : null,
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  // 8. Registro de auditoria imutável em webhooks_log
  await supabase.from('webhooks_log').insert({
    user_id: config.user_id,
    webhook_config_id: config.id,
    event_id: event.id,
    delivery_job_id: job.id,
    delivery_id: deliveryId,
    attempt_no: attemptNo,
    event: event.event_type,
    payload: event.payload,
    response_status: responseStatus,
    response_body: responseBody,
    attempt_count: attemptNo,
    duration_ms: durationMs,
    outcome,
    error_code: errorCode || null,
    is_manual_retry: isManualRetry,
    request_timestamp: requestTimestamp.toISOString(),
    delivered_at: new Date().toISOString(),
  });

  return {
    jobId,
    status: nextStatus,
    httpStatus: responseStatus,
    deliveryId,
    attemptNo,
    errorMessage: outcome === 'failed' ? responseBody : undefined,
  };
}

/**
 * Dispara jobs pendentes associados a um evento recém-gerado.
 */
export async function dispatchEventJobs(eventId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: jobs } = await supabase
      .from('webhook_delivery_jobs')
      .select('id')
      .eq('event_id', eventId)
      .eq('status', 'pending');

    if (jobs && jobs.length > 0) {
      for (const job of jobs) {
        dispatchWebhookJob(job.id, false).catch((err) => {
          console.warn(`[Dispatcher Background Error for Job ${job.id}]`, err);
        });
      }
    }
  } catch (err) {
    console.warn('[Dispatch Event Jobs Error]', err);
  }
}
