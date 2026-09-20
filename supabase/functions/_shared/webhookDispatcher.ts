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
  const nodeDispatcherUrl = Deno.env.get('OPTMAPAY_NODE_DISPATCHER_URL');
  const internalToken = Deno.env.get('OPTMAPAY_INTERNAL_DISPATCH_TOKEN');

  if (!nodeDispatcherUrl || !internalToken) {
    throw new Error(
      'Transporte Node não configurado: OPTMAPAY_NODE_DISPATCHER_URL e OPTMAPAY_INTERNAL_DISPATCH_TOKEN são obrigatórios para entrega autoritativa de webhooks.'
    );
  }

  const endpointUrl = `${nodeDispatcherUrl.replace(/\/$/, '')}/api/sandbox/v1/dev/webhooks?action=internal-dispatch`;

  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-optmapay-internal-token': internalToken,
    },
    body: JSON.stringify({ jobId, isManualRetry }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Falha no dispatcher Node (HTTP ${res.status}): ${errorText.slice(0, 300)}`);
  }

  const data = await res.json();
  if (!data.success) {
    const err = data.dispatchResult?.errorMessage || data.message || 'Falha ao despachar webhook via Node.';
    return {
      success: false,
      status: data.dispatchResult?.status || 'retry',
      error: err,
      jobId,
    };
  }

  return {
    success: true,
    status: data.dispatchResult?.status || 'delivered',
    jobId,
    deliveryId: data.dispatchResult?.deliveryId,
  };
}
