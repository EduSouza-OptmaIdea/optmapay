import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../src/lib/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc: db.rpc, from: db.from }),
  getStoredAnonKey: () => 'fake-anon-key-for-tests',
}));

import { deleteSandboxAccountRPC } from '../src/lib/supabase/accountService';

describe('Exclusão sandbox via RPC atômica (falha segura)', () => {
  const accountId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna o resultado original quando a exclusão transacional é confirmada', async () => {
    const receipt = {
      success: true,
      deleted_account_id: accountId,
      deleted_transactions: 2,
      deleted_boletos: 1,
    };
    db.rpc.mockResolvedValue({ data: receipt, error: null });

    await expect(deleteSandboxAccountRPC(accountId)).resolves.toEqual(receipt);
    expect(db.rpc).toHaveBeenCalledWith('delete_sandbox_account', {
      p_account_id: accountId,
    });
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.from).not.toHaveBeenCalled();
  });

  it('rejeita erro 42501 sem executar DELETE direto no navegador', async () => {
    db.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for function delete_sandbox_account' },
    });

    await expect(deleteSandboxAccountRPC(accountId)).rejects.toThrow('permission denied');
    expect(db.from).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  it('rejeita erro de rede ou conflito sem exclusões parciais', async () => {
    db.rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST000', message: 'database connection unavailable' },
    });

    await expect(deleteSandboxAccountRPC(accountId)).rejects.toThrow('database connection unavailable');
    expect(db.from).not.toHaveBeenCalled();
  });

  it('não declara sucesso quando a RPC retorna dados nulos ou success=false', async () => {
    db.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(deleteSandboxAccountRPC(accountId)).rejects.toThrow('Não foi possível excluir');

    db.rpc.mockResolvedValueOnce({
      data: { success: false, message: 'Exclusão não concluída' },
      error: null,
    });
    await expect(deleteSandboxAccountRPC(accountId)).rejects.toThrow('Exclusão não concluída');

    expect(db.rpc).toHaveBeenCalledTimes(2);
    expect(db.from).not.toHaveBeenCalled();
  });
});
