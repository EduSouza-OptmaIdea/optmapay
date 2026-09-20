import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import {
  deriveWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
} from '../api/_lib/webhookSigner';

describe('Webhook HMAC-SHA256 v1 & Anti-Replay', () => {
  beforeAll(() => {
    process.env.OPTMAPAY_WEBHOOK_MASTER_KEY =
      process.env.OPTMAPAY_WEBHOOK_MASTER_KEY ||
      '1120dca10ff3e2431842f68255ba32958f868c78ed7391c95254ac7d5b66c66c';
  });

  const secret = 'whsec_optmapay_test_secret_for_unit_tests_2026';
  const timestamp = 1789876543;
  const eventId = '7d6e5c4b-3a21-4f9e-8d7c-1b2a3c4d5e6f';
  const rawBody = JSON.stringify({
    id: eventId,
    event: 'pix.paid',
    createdAt: '2026-09-19T21:00:00.000Z',
    realMoney: false,
    environment: 'sandbox',
    data: { amount: 150.0, txId: 'tx_123' },
  });

  // Cálculo canônico esperado para este vetor fixo:
  const signingInput = `${timestamp}.${eventId}.${rawBody}`;
  const expectedHmac = crypto.createHmac('sha256', secret).update(signingInput).digest('hex').toLowerCase();
  const expectedSignature = `v1=${expectedHmac}`;

  it('deve gerar exatamente a assinatura esperada para o vetor fixo canônico', () => {
    const signature = signWebhookPayload(secret, timestamp, eventId, rawBody);
    expect(signature).toBe(expectedSignature);
    expect(signature.startsWith('v1=')).toBe(true);
    expect(signature.length).toBe(67); // 'v1=' (3) + 64 hex chars
  });

  it('deve reproduzir a mesma assinatura para o mesmo conteúdo', () => {
    const sig1 = signWebhookPayload(secret, timestamp, eventId, rawBody);
    const sig2 = signWebhookPayload(secret, timestamp, eventId, rawBody);
    expect(sig1).toBe(sig2);
  });

  it('deve gerar assinatura diferente se alterar 1 byte do corpo', () => {
    const alteredBody = rawBody.replace('150', '151');
    const alteredSig = signWebhookPayload(secret, timestamp, eventId, alteredBody);
    expect(alteredSig).not.toBe(expectedSignature);
  });

  it('deve gerar assinatura diferente se alterar o timestamp', () => {
    const alteredTimestamp = timestamp + 1;
    const alteredSig = signWebhookPayload(secret, alteredTimestamp, eventId, rawBody);
    expect(alteredSig).not.toBe(expectedSignature);
  });

  it('deve gerar assinatura diferente se alterar o eventId', () => {
    const alteredEventId = '8e7f6a5b-4b32-5a0f-9e8d-2c3b4d5e6f7a';
    const alteredSig = signWebhookPayload(secret, timestamp, alteredEventId, rawBody);
    expect(alteredSig).not.toBe(expectedSignature);
  });

  describe('verifyWebhookSignature', () => {
    it('deve validar positivamente assinatura legítima dentro da janela de tolerância', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const signature = signWebhookPayload(secret, currentTimestamp, eventId, rawBody);

      const verification = verifyWebhookSignature({
        webhookSecret: secret,
        signatureHeader: signature,
        timestampHeader: currentTimestamp,
        eventId,
        rawBody,
        toleranceSeconds: 300,
      });

      expect(verification.isValid).toBe(true);
      expect(verification.isExpired).toBe(false);
    });

    it('deve rejeitar requisição com timestamp antigo (> 300 segundos - replay attack)', () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 301;
      const signature = signWebhookPayload(secret, oldTimestamp, eventId, rawBody);

      const verification = verifyWebhookSignature({
        webhookSecret: secret,
        signatureHeader: signature,
        timestampHeader: oldTimestamp,
        eventId,
        rawBody,
        toleranceSeconds: 300,
      });

      expect(verification.isValid).toBe(false);
      expect(verification.isExpired).toBe(true);
      expect(verification.reason).toContain('replay');
    });

    it('deve rejeitar requisição com segredo errado', () => {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const signature = signWebhookPayload('whsec_optmapay_outro_secret', currentTimestamp, eventId, rawBody);

      const verification = verifyWebhookSignature({
        webhookSecret: secret,
        signatureHeader: signature,
        timestampHeader: currentTimestamp,
        eventId,
        rawBody,
      });

      expect(verification.isValid).toBe(false);
    });
  });

  describe('deriveWebhookSecret', () => {
    it('deve derivar segredo determinístico e prefixado com whsec_optmapay_', () => {
      const configId = 'cfg_12345678-1234-1234-1234-123456789abc';
      const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
      const version = 1;

      const derived1 = deriveWebhookSecret(configId, salt, version);
      const derived2 = deriveWebhookSecret(configId, salt, version);

      expect(derived1.publicSecret).toBe(derived2.publicSecret);
      expect(derived1.publicSecret.startsWith('whsec_optmapay_')).toBe(true);
      expect(derived1.last4).toBe(derived1.publicSecret.slice(-4));
    });

    it('deve alterar o segredo quando o salt ou versão forem modificados', () => {
      const configId = 'cfg_12345678';
      const v1 = deriveWebhookSecret(configId, 'salt_1', 1);
      const v2 = deriveWebhookSecret(configId, 'salt_2', 1);
      const v3 = deriveWebhookSecret(configId, 'salt_1', 2);

      expect(v1.publicSecret).not.toBe(v2.publicSecret);
      expect(v1.publicSecret).not.toBe(v3.publicSecret);
    });
  });
});
