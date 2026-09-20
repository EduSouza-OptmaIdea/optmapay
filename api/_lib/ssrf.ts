import dns from 'node:dns/promises';
import net from 'node:net';

export interface SsrValidationResult {
  valid: boolean;
  reason?: string;
  resolvedIps?: string[];
}

function ipv4ToLong(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

function isIpInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);

  const ipLong = ipv4ToLong(ip);
  const rangeLong = ipv4ToLong(range);

  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipLong & mask) === (rangeLong & mask);
}

const BLOCKED_IPV4_CIDRS = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '224.0.0.0/4',
  '240.0.0.0/4',
  '255.255.255.255/32',
];

export function isBlockedIp(ip: string): boolean {
  const cleanIp = ip.trim();
  const version = net.isIP(cleanIp);

  if (version === 4) {
    for (const cidr of BLOCKED_IPV4_CIDRS) {
      if (isIpInCidr(cleanIp, cidr)) {
        return true;
      }
    }
    return false;
  }

  if (version === 6) {
    const lower = cleanIp.toLowerCase();

    // Check IPv4-mapped IPv6 (::ffff:192.168.1.1)
    if (lower.startsWith('::ffff:')) {
      const mappedIpv4 = lower.slice(7);
      if (net.isIP(mappedIpv4) === 4) {
        return isBlockedIp(mappedIpv4);
      }
    }

    // Unspecified :: or ::0
    if (lower === '::' || lower === '::0' || lower === '0:0:0:0:0:0:0:0') return true;

    // Loopback ::1
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;

    // Unique local fc00::/7 (fc00... to fdff...)
    if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return true;

    // Link-local fe80::/10 (fe80... to febf...)
    if (/^fe[89ab][0-9a-f]:/i.test(lower)) return true;

    // Multicast ff00::/8
    if (/^ff[0-9a-f]{2}:/i.test(lower)) return true;

    return false;
  }

  // Not a valid IP
  return true;
}

export async function validateWebhookUrlSsrf(urlString: string): Promise<SsrValidationResult> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, reason: 'URL inválida ou malformada.' };
  }

  // 1. Apenas protocolo https:
  if (url.protocol !== 'https:') {
    return {
      valid: false,
      reason: `Protocolo "${url.protocol}" não permitido. Webhooks aceitam exclusivamente "https:".`,
    };
  }

  // 2. Bloqueio de porta diferente de 443
  if (url.port && url.port !== '443') {
    return {
      valid: false,
      reason: `Porta "${url.port}" não permitida. Webhooks devem operar na porta padrão 443.`,
    };
  }

  // 3. Bloqueio de credenciais embutidas na URL
  if (url.username || url.password) {
    return {
      valid: false,
      reason: 'Credenciais embutidas (username:password) na URL não são permitidas.',
    };
  }

  const hostname = url.hostname.toLowerCase();

  // 4. Nomes de hosts reservados / locais
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return {
      valid: false,
      reason: `Host "${hostname}" pertence a rede interna/local e está bloqueado por política SSRF.`,
    };
  }

  // Se o hostname for diretamente um IP literal
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      return {
        valid: false,
        reason: `IP "${hostname}" é reservado/privado e está bloqueado por política SSRF.`,
        resolvedIps: [hostname],
      };
    }
    return { valid: true, resolvedIps: [hostname] };
  }

  // 5. Resolução de DNS A e AAAA antes do disparo
  const resolvedIps: string[] = [];

  try {
    const lookupResults = await dns.lookup(hostname, { all: true });
    for (const entry of lookupResults) {
      resolvedIps.push(entry.address);
    }
  } catch (dnsErr: any) {
    return {
      valid: false,
      reason: `Falha na resolução DNS do host "${hostname}": ${dnsErr.message || 'Host não encontrado'}`,
    };
  }

  if (resolvedIps.length === 0) {
    return {
      valid: false,
      reason: `Nenhum endereço IP resolvido para o host "${hostname}".`,
    };
  }

  // 6. Rejeição se QUALQUER endereço IP resolvido for reservado/privado
  for (const ip of resolvedIps) {
    if (isBlockedIp(ip)) {
      return {
        valid: false,
        reason: `O host "${hostname}" resolve para o endereço privado/reservado ${ip}, bloqueado por política SSRF.`,
        resolvedIps,
      };
    }
  }

  return { valid: true, resolvedIps };
}
