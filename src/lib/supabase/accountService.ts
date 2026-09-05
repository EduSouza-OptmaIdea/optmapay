import { getSupabaseClient, getStoredAnonKey } from './client';
import { SandboxAccount, AccountType } from '../../types/sandbox';

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  cpf_cnpj: string;
  phone?: string;
  initialBalance?: number;
  pixKey?: string;
}

export async function fetchUserAccounts(userId?: string): Promise<{ accounts: SandboxAccount[]; isUnauthorized: boolean }> {
  const client = getSupabaseClient();
  const anonKey = getStoredAnonKey();

  if (!anonKey) {
    return { accounts: [], isUnauthorized: true };
  }

  // Isolamento estrito: só busca contas do usuário autenticado logado
  if (!userId || userId.trim() === '' || userId === '00000000-0000-0000-0000-000000000001') {
    return { accounts: [], isUnauthorized: false };
  }

  try {
    const { data, error } = await client
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      if (error.code === 'PGRST301' || error.message?.includes('Invalid API key') || error.message?.includes('JWT')) {
        return { accounts: [], isUnauthorized: true };
      }
      console.warn('Erro ao buscar contas no Supabase:', error.message);
      return { accounts: [], isUnauthorized: false };
    }

    return { accounts: (data || []) as SandboxAccount[], isUnauthorized: false };
  } catch {
    return { accounts: [], isUnauthorized: true };
  }
}

export async function createBankAccount(userId: string | undefined, input: CreateAccountInput): Promise<SandboxAccount | null> {
  const client = getSupabaseClient();

  if (!userId || userId.trim() === '') {
    throw new Error('É necessário estar autenticado para criar uma conta bancária.');
  }

  const agency = '0001';
  const accountNumber = `${Math.floor(10000 + Math.random() * 90000)}-${Math.floor(1 + Math.random() * 9)}`;
  const defaultPixKey = input.pixKey && input.pixKey.trim() !== ''
    ? input.pixKey.trim()
    : input.type === 'merchant'
    ? `vendas@${input.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.fake`
    : `pix.${input.cpf_cnpj.replace(/[^0-9]/g, '')}@optmapay.fake`;

  const newAccount = {
    user_id: userId,
    name: input.name,
    type: input.type,
    cpf_cnpj: input.cpf_cnpj,
    phone: input.phone || '(11) 98888-7766',
    balance: input.initialBalance !== undefined ? input.initialBalance : input.type === 'merchant' ? 10000.00 : 2500.00,
    pix_key: defaultPixKey,
    agency,
    account_number: accountNumber,
    config: { created_via_onboarding: true },
  };

  const { data, error } = await client.from('accounts').insert([newAccount]).select().single();

  if (error || !data) {
    console.error('Erro ao criar conta bancária no Supabase:', error);
    throw new Error(error?.message || 'Falha ao registrar conta no Supabase');
  }

  return data as SandboxAccount;
}

/**
 * Exclui a conta e todos os dados relacionados em cascata via RPC no PostgreSQL
 */
export async function deleteSandboxAccountRPC(accountId: string): Promise<any> {
  const client = getSupabaseClient();
  
  const { data, error } = await client.rpc('delete_sandbox_account', {
    p_account_id: accountId,
  });

  if (error) {
    // Fallback client-side
    console.warn('RPC delete_sandbox_account não encontrada. Executando exclusão direta...', error.message);
    await client.from('transactions').delete().or(`account_id.eq.${accountId},counterparty_account_id.eq.${accountId}`);
    await client.from('boletos').delete().eq('account_id', accountId);
    await client.from('cartoes').delete().eq('account_id', accountId);
    await client.from('webhooks_config').delete().eq('account_id', accountId);
    const { error: accErr } = await client.from('accounts').delete().eq('id', accountId);
    if (accErr) throw accErr;
    return { success: true, fallback: true };
  }

  return data;
}

/**
 * Exporta todos os dados da conta em formato estruturado JSON para backup (LGPD / Portabilidade)
 */
export async function exportAccountDataJson(accountId: string): Promise<any> {
  const client = getSupabaseClient();

  const { data, error } = await client.rpc('export_account_data_json', {
    p_account_id: accountId,
  });

  if (error || !data) {
    const { data: account } = await client.from('accounts').select('*').eq('id', accountId).single();
    const { data: transactions } = await client.from('transactions').select('*').eq('account_id', accountId);
    const { data: boletos } = await client.from('boletos').select('*').eq('account_id', accountId);
    const { data: cartoes } = await client.from('cartoes').select('*').eq('account_id', accountId);
    const { data: webhooks } = await client.from('webhooks_config').select('*').eq('account_id', accountId);

    return {
      export_version: '1.0.0',
      exported_at: new Date().toISOString(),
      environment: 'sandbox',
      realMoney: false,
      account,
      transactions: transactions || [],
      boletos: boletos || [],
      cartoes: cartoes || [],
      webhooks_config: webhooks || [],
    };
  }

  return data;
}

/**
 * Dispara um aporte / crédito simulado em conta via RPC
 */
export async function depositFundsRPC(accountId: string, amount: number, description?: string): Promise<any> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('deposit_funds', {
    p_account_id: accountId,
    p_amount: amount,
    p_description: description || 'Aporte Fictício Sandbox',
  });

  if (error) {
    const { data: acc } = await client.from('accounts').select('balance').eq('id', accountId).single();
    const newBal = (acc?.balance || 0) + amount;
    await client.from('accounts').update({ balance: newBal }).eq('id', accountId);
    await client.from('transactions').insert({
      account_id: accountId,
      type: 'deposit',
      direction: 'in',
      amount,
      description: description || 'Aporte Fictício Sandbox',
      status: 'completed',
      real_money: false,
      environment: 'sandbox',
    });
    return { success: true, new_balance: newBal };
  }

  return data;
}

export interface SuperAdminGlobalMetrics {
  totalAccounts: number;
  totalBalanceCustodied: number;
  totalTransactionsCount: number;
  totalVolumeTPV: number;
  totalMdrRevenueCollected: number;
  totalPendingSettlements: number;
  pendingTransactionsCount: number;
}

/**
 * Busca todas as contas do sistema registradas no banco (Visão Super Admin)
 */
export async function fetchAllAccountsAsSuperAdmin(): Promise<SandboxAccount[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('accounts')
    .select('*')
    .order('created_at', { ascending: true });

  if (error || !data) {
    console.warn('[fetchAllAccountsAsSuperAdmin] Falha ao listar contas gerais:', error?.message);
    return [];
  }
  return data as SandboxAccount[];
}

/**
 * Ajusta o saldo de qualquer conta no sistema como Super Admin
 */
export async function superAdminAdjustAccountBalance(
  accountId: string,
  newBalance: number,
  reason: string = 'Ajuste de Saldo Administrativo (Super Admin)'
): Promise<{ success: boolean; newBalance: number }> {
  const client = getSupabaseClient();
  const { data: acc } = await client.from('accounts').select('balance, user_id').eq('id', accountId).single();
  const oldBal = Number(acc?.balance || 0);
  const diff = Math.round((newBalance - oldBal) * 100) / 100;

  await client.from('accounts').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('id', accountId);

  if (diff !== 0) {
    await client.from('transactions').insert({
      account_id: accountId,
      user_id: acc?.user_id,
      type: 'adjustment',
      direction: diff > 0 ? 'in' : 'out',
      amount: Math.abs(diff),
      description: `[SUPER ADMIN] ${reason} (De R$ ${oldBal.toFixed(2)} para R$ ${newBalance.toFixed(2)})`,
      status: 'completed',
      real_money: false,
      environment: 'sandbox',
    });
  }

  return { success: true, newBalance };
}

/**
 * Calcula as métricas consolidadas do banco (Visão Master Super Admin)
 */
export async function superAdminFetchGlobalMetrics(): Promise<SuperAdminGlobalMetrics> {
  const client = getSupabaseClient();
  const { data: accounts } = await client.from('accounts').select('id, balance');
  const { data: transactions } = await client.from('transactions').select('amount, status, type, direction, description');

  const accs = accounts || [];
  const txs = transactions || [];

  const totalBalanceCustodied = accs.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const totalVolumeTPV = txs.reduce((sum, t) => sum + Number(t.amount || 0), 0);

  let totalPendingSettlements = 0;
  let pendingCount = 0;
  let mdrRevenue = 0;

  for (const t of txs) {
    if (t.status === 'pending') {
      totalPendingSettlements += Number(t.amount || 0);
      pendingCount++;
    }
    if (t.description?.includes('Taxa') || t.type === 'card_fee') {
      const match = t.description?.match(/Taxa[^:]*:\s*[-R$\s]*([\d,.]+)/i);
      if (match) {
        mdrRevenue += parseFloat(match[1].replace(',', '.')) || 0;
      }
    }
  }

  return {
    totalAccounts: accs.length,
    totalBalanceCustodied: Math.round(totalBalanceCustodied * 100) / 100,
    totalTransactionsCount: txs.length,
    totalVolumeTPV: Math.round(totalVolumeTPV * 100) / 100,
    totalMdrRevenueCollected: Math.round(mdrRevenue * 100) / 100,
    totalPendingSettlements: Math.round(totalPendingSettlements * 100) / 100,
    pendingTransactionsCount: pendingCount,
  };
}
