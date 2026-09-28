import { describe, expect, it } from 'vitest';
import {
  generateOptmaPayPixPayload,
  parsePixPayload,
} from '../src/lib/pixService';

describe('OptmaPay Pix instruction expiry contract', () => {
  it('gera cobrança dinâmica com emissão e expiração explícitas em milissegundos', () => {
    const issuedAtMs = 1_800_000_000_000;
    const expiresAtMs = issuedAtMs + 15 * 60 * 1000;

    const payload = generateOptmaPayPixPayload({
      receiverPixKey: 'merchant@optmapay.test',
      receiverName: 'Loja Teste',
      receiverAccountId: '11111111-1111-4111-8111-111111111111',
      amount: 3.75,
      orderId: 'PED-TESTE',
      issuedAtMs,
      expiresAtMs,
    });

    const parsed = parsePixPayload(payload);

    expect(parsed.isOptmaPayCode).toBe(true);
    expect(parsed.issuedAt).toBe(issuedAtMs);
    expect(parsed.expiresAt).toBe(expiresAtMs);
    expect(parsed.amount).toBe(3.75);
    expect(parsed.accId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('mantém código estático sem expiração', () => {
    const payload = generateOptmaPayPixPayload({
      receiverPixKey: 'static@optmapay.test',
      receiverName: 'Conta Estática',
      receiverAccountId: '22222222-2222-4222-8222-222222222222',
    });

    expect(payload).not.toContain('ts=');
    expect(payload).not.toContain('exp=');

    const parsed = parsePixPayload(payload);
    expect(parsed.expiresAt).toBeUndefined();
    expect(parsed.issuedAt).toBeUndefined();
  });

  it('interpreta o formato legado do OptmaMenu em segundos como expiração', () => {
    const legacyExpirySeconds = 1_800_000_900;
    const payload =
      'OPTMAPAY://PIX/v1?to=merchant%40optmapay.test&amount=3.75&ts=' +
      legacyExpirySeconds;

    const parsed = parsePixPayload(payload);
    expect(parsed.expiresAt).toBe(legacyExpirySeconds * 1000);
    expect(parsed.issuedAt).toBeUndefined();
  });

  it('mantém compatibilidade com cobrança antiga do OptmaPay baseada apenas em ts', () => {
    const legacyIssuedAtMs = 1_800_000_000_000;
    const payload =
      'OPTMAPAY://PIX/v1?to=merchant%40optmapay.test&amount=3.75&ts=' +
      legacyIssuedAtMs;

    const parsed = parsePixPayload(payload);
    expect(parsed.issuedAt).toBe(legacyIssuedAtMs);
    expect(parsed.expiresAt).toBe(legacyIssuedAtMs + 10 * 60 * 1000);
  });
});
