import { describe, it, expect, vi } from 'vitest';
import dns from 'node:dns/promises';
import { validateWebhookUrlSsrf, isBlockedIp } from '../api/_lib/ssrf';

describe('SSRF Protection Policy', () => {
  describe('isBlockedIp', () => {
    it('deve bloquear loopback IPv4 (127.0.0.1)', () => {
      expect(isBlockedIp('127.0.0.1')).toBe(true);
      expect(isBlockedIp('127.1.2.3')).toBe(true);
    });

    it('deve bloquear redes privadas RFC 1918 (10.x, 172.16-31.x, 192.168.x)', () => {
      expect(isBlockedIp('10.0.0.1')).toBe(true);
      expect(isBlockedIp('10.254.0.1')).toBe(true);
      expect(isBlockedIp('172.16.0.1')).toBe(true);
      expect(isBlockedIp('172.31.255.254')).toBe(true);
      expect(isBlockedIp('192.168.0.1')).toBe(true);
      expect(isBlockedIp('192.168.1.100')).toBe(true);
    });

    it('deve bloquear link-local e cloud metadata (169.254.169.254)', () => {
      expect(isBlockedIp('169.254.169.254')).toBe(true);
      expect(isBlockedIp('169.254.0.1')).toBe(true);
    });

    it('deve bloquear loopback IPv6 (::1) e unspecified (::)', () => {
      expect(isBlockedIp('::1')).toBe(true);
      expect(isBlockedIp('::')).toBe(true);
    });

    it('deve bloquear ULA IPv6 (fc00::/7)', () => {
      expect(isBlockedIp('fc00::1')).toBe(true);
      expect(isBlockedIp('fd12:3456:789a::1')).toBe(true);
    });

    it('deve bloquear link-local IPv6 (fe80::/10)', () => {
      expect(isBlockedIp('fe80::1')).toBe(true);
    });

    it('deve bloquear IPv4-mapped IPv6 para endereços privados', () => {
      expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
      expect(isBlockedIp('::ffff:192.168.1.1')).toBe(true);
      expect(isBlockedIp('::ffff:169.254.169.254')).toBe(true);
    });

    it('deve permitir IPs públicos legítimos', () => {
      expect(isBlockedIp('8.8.8.8')).toBe(false);
      expect(isBlockedIp('1.1.1.1')).toBe(false);
      expect(isBlockedIp('93.184.216.34')).toBe(false); // example.com
      expect(isBlockedIp('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
    });
  });

  describe('validateWebhookUrlSsrf', () => {
    it('deve rejeitar protocolo não-HTTPS (http://...)', async () => {
      const res = await validateWebhookUrlSsrf('http://webhook.meusite.com/api');
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Protocolo');
    });

    it('deve rejeitar porta diferente de 443', async () => {
      const res = await validateWebhookUrlSsrf('https://webhook.meusite.com:8443/api');
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Porta');
    });

    it('deve rejeitar credenciais embutidas na URL (username:password)', async () => {
      const res = await validateWebhookUrlSsrf('https://admin:senha123@webhook.meusite.com/api');
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Credenciais');
    });

    it('deve rejeitar https://localhost/', async () => {
      const res = await validateWebhookUrlSsrf('https://localhost/api');
      expect(res.valid).toBe(false);
    });

    it('deve rejeitar https://127.0.0.1/', async () => {
      const res = await validateWebhookUrlSsrf('https://127.0.0.1/webhook');
      expect(res.valid).toBe(false);
    });

    it('deve rejeitar https://10.0.0.1/', async () => {
      const res = await validateWebhookUrlSsrf('https://10.0.0.1/webhook');
      expect(res.valid).toBe(false);
    });

    it('deve rejeitar https://172.16.0.1/', async () => {
      const res = await validateWebhookUrlSsrf('https://172.16.0.1/webhook');
      expect(res.valid).toBe(false);
    });

    it('deve rejeitar https://192.168.1.1/', async () => {
      const res = await validateWebhookUrlSsrf('https://192.168.1.1/webhook');
      expect(res.valid).toBe(false);
    });

    it('deve rejeitar https://169.254.169.254/ (cloud metadata)', async () => {
      const res = await validateWebhookUrlSsrf('https://169.254.169.254/latest/meta-data');
      expect(res.valid).toBe(false);
    });

    it('deve rejeitar https://[::1]/', async () => {
      const res = await validateWebhookUrlSsrf('https://[::1]/webhook');
      expect(res.valid).toBe(false);
    });

    it('deve rejeitar host público caso DNS resolva para IP privado (DNS Rebinding)', async () => {
      const spy = vi.spyOn(dns, 'lookup').mockResolvedValueOnce([
        { address: '192.168.1.50', family: 4 },
      ] as any);

      const res = await validateWebhookUrlSsrf('https://malicious-public-domain.com/webhook');
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('privado/reservado');

      spy.mockRestore();
    });

    it('deve aceitar host público legítimo com porta 443', async () => {
      const spy = vi.spyOn(dns, 'lookup').mockResolvedValueOnce([
        { address: '93.184.216.34', family: 4 },
      ] as any);

      const res = await validateWebhookUrlSsrf('https://optmapay.optmaidea.com.br/api/webhooks');
      expect(res.valid).toBe(true);

      spy.mockRestore();
    });
  });
});
