import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(filename: string) {
  try {
    const filePath = path.resolve(process.cwd(), filename);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const k = trimmed.slice(0, eqIdx).trim();
          const v = trimmed.slice(eqIdx + 1).trim();
          if (typeof process !== 'undefined' && process.env && !process.env[k]) {
            process.env[k] = v;
          }
        }
      }
    }
  } catch {}
}

export function getWebhookMasterKey(): string {
  let masterKey =
    (typeof process !== 'undefined' ? process.env?.OPTMAPAY_WEBHOOK_MASTER_KEY || process.env?.WEBHOOK_MASTER_KEY : undefined);

  if (!masterKey || masterKey.trim() === '') {
    loadEnvFile('.env.local');
    loadEnvFile('.env');
    masterKey = (typeof process !== 'undefined' ? process.env?.OPTMAPAY_WEBHOOK_MASTER_KEY || process.env?.WEBHOOK_MASTER_KEY : undefined);
  }

  if (!masterKey || masterKey.trim() === '') {
    throw new Error('CONFIG_ERROR: OPTMAPAY_WEBHOOK_MASTER_KEY não configurada no ambiente.');
  }

  return masterKey.trim();
}

export interface DerivedWebhookSecret {
  salt: string;
  version: number;
  last4: string;
  publicSecret: string;
  rawSecret: string;
}

/**
 * Deriva um segredo de webhook determinístico a partir da Master Key e metadados persistidos.
 */
export function deriveWebhookSecret(
  webhookConfigId: string,
  salt?: string,
  version: number = 1
): DerivedWebhookSecret {
  const masterKey = getWebhookMasterKey();
  const effectiveSalt = salt || crypto.randomBytes(16).toString('hex');
  const derivationMessage = `optmapay-webhook:${webhookConfigId}:v${version}:${effectiveSalt}`;

  const hmac = crypto.createHmac('sha256', masterKey);
  hmac.update(derivationMessage);
  const rawSecretBuffer = hmac.digest();

  const base64UrlSecret = rawSecretBuffer.toString('base64url');
  const publicSecret = `whsec_optmapay_${base64UrlSecret}`;
  const last4 = publicSecret.slice(-4);

  return {
    salt: effectiveSalt,
    version,
    last4,
    publicSecret,
    rawSecret: publicSecret,
  };
}

/**
 * Calcula a assinatura HMAC-SHA256 v1 oficial do OptmaPay Sandbox.
 * Input: <unix_timestamp>.<event_id>.<raw_body>
 * Output: v1=<64 lowercase hex chars>
 */
export function signWebhookPayload(
  webhookSecret: string,
  timestamp: number | string,
  eventId: string,
  rawBody: string
): string {
  const signingInput = `${timestamp}.${eventId}.${rawBody}`;
  const hmac = crypto.createHmac('sha256', webhookSecret);
  hmac.update(signingInput);
  const digest = hmac.digest('hex').toLowerCase();
  return `v1=${digest}`;
}

export interface VerifySignatureParams {
  webhookSecret: string;
  signatureHeader: string;
  timestampHeader: string | number;
  eventId: string;
  rawBody: string;
  toleranceSeconds?: number;
}

export interface VerifySignatureResult {
  isValid: boolean;
  isExpired: boolean;
  reason?: string;
}

/**
 * Verifica a assinatura HMAC-SHA256 com proteção contra replay.
 */
export function verifyWebhookSignature({
  webhookSecret,
  signatureHeader,
  timestampHeader,
  eventId,
  rawBody,
  toleranceSeconds = 300,
}: VerifySignatureParams): VerifySignatureResult {
  const timestampNum = typeof timestampHeader === 'string' ? parseInt(timestampHeader, 10) : timestampHeader;
  if (isNaN(timestampNum)) {
    return { isValid: false, isExpired: false, reason: 'Timestamp de assinatura inválido.' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const timeDifference = Math.abs(nowSeconds - timestampNum);

  if (timeDifference > toleranceSeconds) {
    return {
      isValid: false,
      isExpired: true,
      reason: `Assinatura expirada por política de replay (diferença de ${timeDifference}s, máx permitido: ${toleranceSeconds}s).`,
    };
  }

  if (!signatureHeader || !signatureHeader.startsWith('v1=')) {
    return { isValid: false, isExpired: false, reason: 'Header de assinatura malformado. Esperado prefixo v1=' };
  }

  const expectedSignature = signWebhookPayload(webhookSecret, timestampNum, eventId, rawBody);

  const providedHex = signatureHeader.slice(3).trim();
  const expectedHex = expectedSignature.slice(3).trim();

  if (providedHex.length !== expectedHex.length) {
    return { isValid: false, isExpired: false, reason: 'Tamanho de assinatura inválido.' };
  }

  const providedBuf = Buffer.from(providedHex, 'hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');

  const match = crypto.timingSafeEqual(providedBuf, expectedBuf);
  return {
    isValid: match,
    isExpired: false,
    reason: match ? undefined : 'Assinatura HMAC não confere.',
  };
}
