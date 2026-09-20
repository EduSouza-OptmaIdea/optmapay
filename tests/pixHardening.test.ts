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
    let invokeCalls = 0;

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
      return {} as any;
    });

    // 1ª chamada falha (resposta de rede perdida).
    // 2ª chamada (retry automático com mesma chave) devolve a resposta cacheada pelo PostgreSQL.
    vi.mocked(supabase.functions.invoke).mockImplementation(async () => {
      invokeCalls++;
      if (invokeCalls === 1) {
        throw new Error('Network timeout / connection lost');
      }
      return {
        data: {
          success: true,
          from_cache: true,
          transactionOutId: 'txn-pix-cached-12345',
          transactionInId: 'txn-pix-in-67890',
          amount: 100.0,
          senderName: senderAccount.name,
          receiverName: 'Destinatário Pix',
          message: 'Transferência Pix concluída com sucesso!',
        },
        error: null,
      } as any;
    });

    // Spy na RPC transfer_pix para garantir que o cliente NUNCA executa fallback direto no banco
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
    expect(result.transactionOutId).toBe('txn-pix-cached-12345');
    // Duas tentativas HTTP foram executadas com a mesma chave de idempotência
    expect(invokeCalls).toBe(2);
    // A RPC direta transfer_pix NUNCA deve ser chamada pelo browser como fallback
    expect(rpcCallCount).toBe(0);
  });

  it('deve falhar de forma segura quando a Edge Function falhar e não recuperar no retry', async () => {
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
