// Deno-compatible Webhook Security & SSRF Protection
/// <reference path="../deno.d.ts" />

export interface SsrfCheckResult {
  valid: boolean;
  reason?: string;
  resolvedIps?: string[];
}

const BLOCKED_IPV4_PREFIXES = [
  '0.',
  '10.',
  '127.',
  '169.254.',
  '192.168.',
];

function isBlockedIpv4(ip: string): boolean {
  for (const prefix of BLOCKED_IPV4_PREFIXES) {
    if (ip.startsWith(prefix)) return true;
  }
  // 172.16.0.0 - 172.31.255.255
  if (ip.startsWith('172.')) {
    const secondOctet = parseInt(ip.split('.')[1], 10);
    if (!isNaN(secondOctet) && secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }
  // 100.64.0.0/10 (100.64 - 100.127)
  if (ip.startsWith('100.')) {
    const secondOctet = parseInt(ip.split('.')[1], 10);
    if (!isNaN(secondOctet) && secondOctet >= 64 && secondOctet <= 127) {
      return true;
    }
  }
  // Multicast / Reserved 224-255
  const firstOctet = parseInt(ip.split('.')[0], 10);
  if (!isNaN(firstOctet) && firstOctet >= 224) {
    return true;
  }
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::0' || lower === '::1') return true;
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice(7);
    return isBlockedIpv4(mapped);
  }
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return true; // fc00::/7
  if (/^fe[89ab][0-9a-f]:/i.test(lower)) return true; // fe80::/10
  if (/^ff[0-9a-f]{2}:/i.test(lower)) return true;   // ff00::/8
  return false;
}

export async function validateDenoSsrf(urlString: string): Promise<SsrfCheckResult> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, reason: 'URL inválida ou malformada.' };
  }

  if (url.protocol !== 'https:') {
    return { valid: false, reason: `Protocolo "${url.protocol}" não permitido. Apenas "https:" é aceito.` };
  }

  if (url.port && url.port !== '443') {
    return { valid: false, reason: `Porta "${url.port}" não permitida. Webhooks devem operar na porta 443.` };
  }

  if (url.username || url.password) {
    return { valid: false, reason: 'Credenciais na URL não são permitidas.' };
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return { valid: false, reason: `Host "${hostname}" pertence a rede interna/local e está bloqueado.` };
  }

  // Se o hostname for IP literal
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isBlockedIpv4(hostname)) {
      return { valid: false, reason: `IP "${hostname}" é reservado/privado e está bloqueado por política SSRF.` };
    }
    return { valid: true, resolvedIps: [hostname] };
  }

  // Resolução DNS A / AAAA
  const resolvedIps: string[] = [];
  try {
    // @ts-ignore Deno.resolveDns
    if (typeof Deno !== 'undefined' && typeof (Deno as any).resolveDns === 'function') {
      try {
        const aRecords = await (Deno as any).resolveDns(hostname, 'A');
        for (const ip of aRecords) resolvedIps.push(ip);
      } catch {}
      try {
        const aaaaRecords = await (Deno as any).resolveDns(hostname, 'AAAA');
        for (const ip of aaaaRecords) resolvedIps.push(ip);
      } catch {}
    }
  } catch (dnsErr: any) {
    return { valid: false, reason: `Falha na resolução DNS de "${hostname}": ${dnsErr.message}` };
  }

  // Se nenhum IP foi resolvido, fail-closed obrigatório
  if (resolvedIps.length === 0) {
    return {
      valid: false,
      reason: `Nenhum endereço IP (A/AAAA) pôde ser resolvido para o host "${hostname}". Bloqueado fail-closed.`,
    };
  }

  for (const ip of resolvedIps) {
    if (ip.includes(':')) {
      if (isBlockedIpv6(ip)) {
        return { valid: false, reason: `Host "${hostname}" resolve para endereço IPv6 reservado (${ip}).` };
      }
    } else {
      if (isBlockedIpv4(ip)) {
        return { valid: false, reason: `Host "${hostname}" resolve para endereço IPv4 reservado (${ip}).` };
      }
    }
  }

  return { valid: true, resolvedIps };
}
