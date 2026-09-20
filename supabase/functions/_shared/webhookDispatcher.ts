// Deno Webhook Dispatcher Core
/// <reference path="../deno.d.ts" />
import { validateDenoSsrf } from './webhookSecurity.ts';

async function hmacSha256(keyStr: string, messageStr: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyStr);
  const msgData = encoder.encode(messageStr);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return new Uint8Array(signature);
}

function bufferToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bufferToBase64Url(buf: Uint8Array): string {
  const binString = Array.from(buf, (ch) => String.fromCharCode(ch)).join('');
  return btoa(binString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function deriveSecretDeno(
  webhookConfigId: string,
  salt?: string,
  version: number = 1
): Promise<{ publicSecret: string; salt: string; version: number }> {
  const masterKey = Deno.env.get('OPTMAPAY_WEBHOOK_MASTER_KEY');
  if (!masterKey || masterKey.trim() === '') {
    throw new Error('CONFIG_ERROR: OPTMAPAY_WEBHOOK_MASTER_KEY não configurada no ambiente Deno.');
  }
  const effectiveSalt = salt || bufferToHex(crypto.getRandomValues(new Uint8Array(16)));
  const msg = `optmapay-webhook:${webhookConfigId}:v${version}:${effectiveSalt}`;

  const rawBytes = await hmacSha256(masterKey, msg);
  const publicSecret = `whsec_optmapay_${bufferToBase64Url(rawBytes)}`;

  return {
    publicSecret,
    salt: effectiveSalt,
    version,
  };
}

export async function signPayloadDeno(
  webhookSecret: string,
  timestamp: number | string,
  eventId: string,
  rawBody: string
): Promise<string> {
  const signingInput = `${timestamp}.${eventId}.${rawBody}`;
  const sigBytes = await hmacSha256(webhookSecret, signingInput);
  return `v1=${bufferToHex(sigBytes)}`;
}

export async function processJobDispatch(supabase: any, jobId: string, isManualRetry = false) {
  const deliveryId = crypto.randomUUID();
  const requestTimestamp = new Date();

  const { data: job, error: jobErr } = await supabase
    .from('webhook_delivery_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) {
    throw new Error(`Job de entrega não encontrado (${jobId}).`);
  }

  if (job.status === 'delivered' && !isManualRetry) {
    return { success: true, status: 'delivered', jobId };
  }

  const [eventRes, configRes] = await Promise.all([
    supabase.from('webhook_events').select('*').eq('id', job.event_id).single(),
    supabase.from('webhooks_config').select('*').eq('id', job.webhook_config_id).single(),
  ]);

  if (eventRes.error || !eventRes.data) throw new Error('Evento de webhook não encontrado.');
  if (configRes.error || !configRes.data) throw new Error('Configuração de webhook não encontrada.');

  const event = eventRes.data;
  const config = configRes.data;
  const attemptNo = job.attempt_count + 1;

  await supabase
    .from('webhook_delivery_jobs')
    .update({ status: 'delivering', locked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', jobId);

  const startTime = Date.now();

  // SSRF Check
  const ssrf = await validateDenoSsrf(config.url);
  if (!ssrf.valid) {
    const errorMsg = `[SSRF Bloqueado] ${ssrf.reason}`;
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
      response_body: JSON.stringify({ error: errorMsg, realMoney: false, environment: 'sandbox' }),
      attempt_count: attemptNo,
      duration_ms: Date.now() - startTime,
      outcome: 'failed',
      error_code: 'SSRF_BLOCKED',
      is_manual_retry: isManualRetry,
      request_timestamp: requestTimestamp.toISOString(),
      delivered_at: new Date().toISOString(),
    });

    return { success: false, status: 'dead', error: errorMsg };
  }

  // HMAC v1
  const derived = await deriveSecretDeno(config.id, config.secret_salt, config.secret_version || 1);
  const unixTimestamp = Math.floor(requestTimestamp.getTime() / 1000);
  const rawBody = JSON.stringify(event.payload);
  const signature = await signPayloadDeno(derived.publicSecret, unixTimestamp, event.id, rawBody);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  let responseStatus = 0;
  let responseBody = '';
  let outcome: 'success' | 'failed' = 'failed';
  let errorCode: string | null = null;

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-optmapay-event': event.event_type,
        'x-optmapay-event-id': event.id,
        'x-optmapay-delivery-id': deliveryId,
        'x-optmapay-attempt': String(attemptNo),
        'x-optmapay-timestamp': String(unixTimestamp),
        'x-optmapay-signature': signature,
        'x-optmapay-real-money': 'false',
        'x-optmapay-environment': 'sandbox',
      },
      body: rawBody,
      redirect: 'manual',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    responseStatus = res.status;
    const text = await res.text();
    responseBody = text.slice(0, 4096);

    if (responseStatus >= 200 && responseStatus < 300) {
      outcome = 'success';
    } else {
      errorCode = `HTTP_${responseStatus}`;
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    outcome = 'failed';
    if (err.name === 'AbortError') {
      responseStatus = 504;
      responseBody = 'Timeout de conexão (limite de 5000ms excedido)';
      errorCode = 'TIMEOUT';
    } else {
      responseStatus = 502;
      responseBody = `Falha de rede: ${err.message}`;
      errorCode = 'NETWORK_ERROR';
    }
  }

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
    const delays = [0, 60, 300, 900, 3600];
    const delay = delays[attemptNo] || 3600;
    nextAttemptAt = new Date(Date.now() + delay * 1000);
  } else {
    nextStatus = 'dead';
  }

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
    duration_ms: Date.now() - startTime,
    outcome,
    error_code: errorCode,
    is_manual_retry: isManualRetry,
    request_timestamp: requestTimestamp.toISOString(),
    delivered_at: new Date().toISOString(),
  });

  return {
    success: outcome === 'success',
    status: nextStatus,
    httpStatus: responseStatus,
    deliveryId,
    attemptNo,
  };
}
