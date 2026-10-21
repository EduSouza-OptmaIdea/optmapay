import { describe, expect, it } from 'vitest';
import {
  isAllowedRetentionMethod,
  isAuthorizedRetentionRequest,
} from '../supabase/functions/_shared/retentionAuthorization';

describe('Retention worker — privileged authorization', () => {
  const internal = 'synthetic-internal-token-for-ci';
  const service = 'synthetic-service-role-key-for-ci';

  const request = (headers: Record<string, string> = {}, method = 'POST') =>
    new Request('https://example.test/functions/v1/retention-worker', {
      method,
      headers,
    });

  it('permite a credencial interna exata', () => {
    expect(isAuthorizedRetentionRequest(
      request({ 'x-optmapay-internal-token': internal, authorization: 'Bearer anon-key' }),
      internal, service,
    )).toBe(true);
  });

  it('permite a service_role exata no Bearer', () => {
    expect(isAuthorizedRetentionRequest(
      request({ authorization: `Bearer ${service}` }), internal, service,
    )).toBe(true);
  });

  it('nega JWT comum e a chave pública anon mesmo que o gateway aceite o JWT', () => {
    for (const authorization of ['Bearer anon-key', 'Bearer user-jwt', 'Bearer ']) {
      expect(isAuthorizedRetentionRequest(request({ authorization }), internal, service)).toBe(false);
    }
  });

  it('nega token parcial, concatenado ou cabeçalho malformado', () => {
    const invalid = [
      { authorization: `Bearer prefix-${service}` },
      { authorization: `Bearer ${service}-suffix` },
      { authorization: `Basic ${service}` },
      { authorization: service },
      { 'x-optmapay-internal-token': `prefix-${internal}` },
      { 'x-optmapay-internal-token': `${internal}-suffix` },
    ];
    for (const headers of invalid) {
      expect(isAuthorizedRetentionRequest(request(headers), internal, service)).toBe(false);
    }
  });

  it('nega requisições sem credenciais ou quando segredos estão ausentes', () => {
    expect(isAuthorizedRetentionRequest(request(), internal, service)).toBe(false);
    expect(isAuthorizedRetentionRequest(request({ authorization: `Bearer ${service}` }), undefined, undefined)).toBe(false);
    expect(isAuthorizedRetentionRequest(request({ 'x-optmapay-internal-token': internal }), '', '')).toBe(false);
  });

  it('permite somente POST para iniciar a purga, não GET/PUT/DELETE', () => {
    expect(isAllowedRetentionMethod('POST')).toBe(true);
    for (const method of ['GET', 'PUT', 'DELETE', 'HEAD', 'PATCH']) {
      expect(isAllowedRetentionMethod(method)).toBe(false);
    }
  });
});
