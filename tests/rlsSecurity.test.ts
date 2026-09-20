import { describe, it, expect, vi } from 'vitest';
import apiKeyHandler from '../api/sandbox/v1/dev/api-keys';
import webhookHandler from '../api/sandbox/v1/dev/webhooks';

// Simulação de ambiente e mocks para teste de RLS / Ownership entre múltiplos usuários
describe('RLS & Ownership Isolation Security Tests', () => {
  const userA = { id: 'user-aaa-1111', email: 'userA@optmapay.com' };
  const userB = { id: 'user-bbb-2222', email: 'userB@optmapay.com' };

  const accountA = { id: 'acc-aaa-1111', user_id: userA.id, name: 'Conta Usuário A' };
  const accountB = { id: 'acc-bbb-2222', user_id: userB.id, name: 'Conta Usuário B' };

  function createMockRes() {
    const res: any = {
      statusCode: 200,
      jsonBody: null,
      headers: {},
      setHeader(name: string, value: string) {
        this.headers[name] = value;
        return this;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.jsonBody = data;
        return this;
      },
    };
    return res;
  }

  it('deve bloquear Usuário A de criar API Key associada à conta B do Usuário B', async () => {
    // Mock do request autenticado como Usuário A
    const req: any = {
      method: 'POST',
      headers: { authorization: 'Bearer token-user-a' },
      body: {
        accountId: accountB.id, // Tentativa maliciosa de criar chave para Conta B
        keyName: 'Chave Invadida',
      },
    };
    const res = createMockRes();

    // Mock do Supabase
    vi.spyOn(await import('../api/_lib/supabaseAdmin'), 'getSupabaseAdmin').mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: userA }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: new Error('RLS Blocked') }),
          }),
        }),
      }),
    } as any);

    vi.spyOn(await import('../api/_lib/supabaseAdmin'), 'getSupabaseUserClient').mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                // Usuário A consultando Conta B com RLS retorna nulo/não autorizado
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        return {} as any;
      }),
    } as any);

    await apiKeyHandler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.jsonBody?.error?.code).toBe('FORBIDDEN_ACCOUNT');
  });

  it('deve bloquear Usuário A de revogar API Key que pertence ao Usuário B', async () => {
    const req: any = {
      method: 'DELETE',
      headers: { authorization: 'Bearer token-user-a' },
      body: {
        id: 'key-of-user-b',
      },
    };
    const res = createMockRes();

    vi.spyOn(await import('../api/_lib/supabaseAdmin'), 'getSupabaseAdmin').mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: userA }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              // Busca chave onde id=key-of-user-b E user_id=userA.id -> retorna null
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as any);

    await apiKeyHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.jsonBody?.error?.code).toBe('KEY_NOT_FOUND');
  });

  it('deve bloquear Usuário A de cadastrar Webhook na conta B do Usuário B', async () => {
    const req: any = {
      method: 'POST',
      headers: { authorization: 'Bearer token-user-a' },
      body: {
        action: 'create',
        accountId: accountB.id,
        url: 'https://webhook.site/teste',
      },
    };
    const res = createMockRes();

    vi.spyOn(await import('../api/_lib/supabaseAdmin'), 'getSupabaseAdmin').mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: userA }, error: null }),
      },
    } as any);

    vi.spyOn(await import('../api/_lib/supabaseAdmin'), 'getSupabaseUserClient').mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        return {} as any;
      }),
    } as any);

    await webhookHandler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.jsonBody?.error?.code).toBe('FORBIDDEN_ACCOUNT');
  });

  it('deve bloquear Usuário A de dar retry manual em job de webhook de outro usuário', async () => {
    const req: any = {
      method: 'POST',
      headers: { authorization: 'Bearer token-user-a' },
      body: {
        action: 'retry-delivery',
        deliveryJobId: 'job-of-user-b',
      },
    };
    const res = createMockRes();

    vi.spyOn(await import('../api/_lib/supabaseAdmin'), 'getSupabaseAdmin').mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: userA }, error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === 'webhook_delivery_jobs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'job-of-user-b',
                    webhooks_config: { user_id: userB.id, account_id: accountB.id },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {} as any;
      }),
    } as any);

    await webhookHandler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.jsonBody?.error?.code).toBe('FORBIDDEN_JOB');
  });
});
