import { describe, it, expect, vi } from 'vitest';
import { validateWebhookUrlSsrf } from '../api/_lib/ssrf';
import { validateDenoSsrf } from '../supabase/functions/_shared/webhookSecurity';
import dns from 'node:dns/promises';

describe('SSRF Fail-Closed & DNS Pinning Security Tests', () => {
  it('deve bloquear fail-closed quando o DNS não puder ser resolvido (nunca retornar valid: true)', async () => {
    // Mock do dns.lookup para simular retorno vazio ou erro
    vi.spyOn(dns, 'lookup').mockResolvedValueOnce([] as any);

    const result = await validateWebhookUrlSsrf('https://nonexistent-webhook-domain-test-1234.com/hook');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Nenhum endereço IP resolvido');
  });

  it('deve bloquear fail-closed quando o dns.lookup lançar exceção', async () => {
    vi.spyOn(dns, 'lookup').mockRejectedValueOnce(new Error('ENOTFOUND'));

    const result = await validateWebhookUrlSsrf('https://broken-dns-server-test.com/hook');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Falha na resolução DNS');
  });

  it('deve bloquear fail-closed na função Deno quando nenhum IP A/AAAA for retornado', async () => {
    // Simula ambiente onde resolveDns não retorna nenhum registro
    const result = await validateDenoSsrf('https://unknown-dns-entry.internal-test.com/hook');
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('deve extrair e pinar o IP público validado para a conexão de transporte', async () => {
    // Simula resolução de um IP público legítimo
    vi.spyOn(dns, 'lookup').mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
    ] as any);

    const result = await validateWebhookUrlSsrf('https://example.com/api/webhook');
    expect(result.valid).toBe(true);
    expect(result.resolvedIps).toBeDefined();
    expect(result.resolvedIps).toContain('93.184.216.34');

    // O IP de transporte deve ser pinado para este valor específico
    const pinnedIp = result.resolvedIps![0];
    expect(pinnedIp).toBe('93.184.216.34');
  });

  it('deve rejeitar qualquer domínio que resolva para IP privado (anti-DNS rebinding)', async () => {
    // Simula domínio público que resolve para IP da AWS Metadata ou loopback
    vi.spyOn(dns, 'lookup').mockResolvedValueOnce([
      { address: '169.254.169.254', family: 4 },
    ] as any);

    const result = await validateWebhookUrlSsrf('https://rebinding-attack.evil.com/hook');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('bloqueado por política SSRF');
  });
});
