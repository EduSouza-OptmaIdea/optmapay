import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executePixTransfer } from '../src/lib/pixService';
import { supabase } from '../src/lib/supabase';

// Mock do módulo supabase
vi.mock('../src/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      functions: {
        invoke: vi.fn(),
      },
      rpc: vi.fn(),
    },
  };
});

describe('Pix Hardening: Single Mutation & Resilient Retry', () => {
  const senderAccount = {
    id: 'acc-sender-111',
    user_id: 'user-111',
    balance: 500.0,
    name: 'Loja Origem',
    pix_key: 'origem@optmapay.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve simular "pagamento concluído + resposta perdida + retry" e garantir uma única movimentação', async () => {
    const input = {
      senderAccountId: senderAccount.id,
      destPixKeyOrPayload: 'destino@optmapay.com',
      amount: 100.0,
      description: 'Pagamento Teste Resiliência',
      externalReference: 'REF-PIX-RETRY-999',
    };

    let rpcCallCount = 0;

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'accounts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: senderAccount, error: null }),
            }),
          }),
        } as any;
      }

      if (table === 'transactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                ilike: vi.fn().mockReturnValue({
                  // Simula que a transação já foi processada e gravada no banco pelo servidor
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: 'txn-existing-12345',
                      amount: 100.0,
                      description: 'Transferência Pix Sandbox REF-PIX-RETRY-999',
                      created_at: new Date().toISOString(),
                      account_id: senderAccount.id,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        } as any;
      }

      return {} as any;
    });

    // Simula que a chamada de rede à Edge Function falhou (timeout ou perda de conexão na resposta)
    vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error('Network timeout / connection lost'));

    // Spy na RPC transfer_pix para garantir que o cliente NÃO executa uma segunda mutação por fallback
    vi.mocked(supabase.rpc).mockImplementation(async (fnName: string) => {
      if (fnName === 'transfer_pix') {
        rpcCallCount++;
      }
      return { data: null, error: null } as any;
    });

    // Executa a transferência
    const result = await executePixTransfer(input);

    // Validações
    expect(result.success).toBe(true);
    expect(result.transactionOutId).toBe('txn-existing-12345');
    // A RPC direta transfer_pix NUNCA deve ser chamada pelo browser como fallback
    expect(rpcCallCount).toBe(0);
    expect(result.message).toContain('Transferência Pix confirmada via conciliação');
  });

  it('deve falhar de forma segura quando a Edge Function falhar e a transação não existir', async () => {
    const input = {
      senderAccountId: senderAccount.id,
      destPixKeyOrPayload: 'destino@optmapay.com',
      amount: 100.0,
      description: 'Pagamento Inexistente',
      externalReference: 'REF-PIX-NOT-FOUND',
    };

    let rpcCallCount = 0;

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'accounts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: senderAccount, error: null }),
            }),
          }),
        } as any;
      }
      if (table === 'transactions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                ilike: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    vi.mocked(supabase.functions.invoke).mockRejectedValue(new Error('500 Internal Server Error'));
    vi.mocked(supabase.rpc).mockImplementation(async (fnName: string) => {
      if (fnName === 'transfer_pix') {
        rpcCallCount++;
      }
      return { data: null, error: null } as any;
    });

    await expect(executePixTransfer(input)).rejects.toThrow('Nenhuma movimentação duplicada foi executada');
    // RPC transfer_pix não pode ter sido invocada pelo cliente
    expect(rpcCallCount).toBe(0);
  });
});
