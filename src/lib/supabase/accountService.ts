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
    balance: input.type === 'customer' ? 2000.00 : (input.initialBalance !== undefined ? input.initialBalance : 10000.00),
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

  // Excluir uma conta é uma operação transacional: não tentar DML avulso no
  // navegador caso a RPC falhe (RLS, conflito, rede ou erro do banco).
  if (error || !data || data.success !== true) {
    throw new Error(error?.message || data?.message || 'Não foi possível excluir a conta sandbox.');
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
    throw new Error(error.message || 'Falha ao realizar aporte fictício no Sandbox.');
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

export interface SuperAdminUserMetrics {
  totalUsers: number;
  confirmedUsers: number;
  pendingConfirmation: number;
  signedInLast24h: number;
  customerAccounts: number;
  merchantAccounts: number;
}

export interface SuperAdminUserRow {
  user_id: string;
  email: string;
  display_name: string;
  account_type: string;
  created_at: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  status: 'active' | 'pending_confirmation' | 'blocked' | string;
  account_count: number;
  account_names: string;
  total_balance: number;
  transaction_count: number;
  card_count: number;
  boleto_count: number;
  last_activity_at: string;
}

export interface SuperAdminActivityRow {
  event_id: string;
  user_id: string | null;
  user_email: string | null;
  account_id: string | null;
  account_name: string | null;
  event_type: string;
  category: string;
  summary: string;
  amount: number | null;
  status: string | null;
  occurred_at: string;
}

export async function verifySuperAdminAccess(): Promise<boolean> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('is_optmapay_super_admin');
  if (error) {
    console.warn('[verifySuperAdminAccess] Falha ao validar autoridade:', error.message);
    return false;
  }
  return data === true;
}

export async function superAdminListUsers(
  search: string = '',
  limit: number = 200,
  offset: number = 0
): Promise<SuperAdminUserRow[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('super_admin_list_users', {
    p_search: search || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message || 'Falha ao listar usuários do OptmaPay.');
  return (data || []) as SuperAdminUserRow[];
}

export async function superAdminFetchUserMetrics(): Promise<SuperAdminUserMetrics> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('super_admin_user_metrics');
  if (error) throw new Error(error.message || 'Falha ao carregar métricas de usuários.');
  return {
    totalUsers: Number(data?.totalUsers || 0),
    confirmedUsers: Number(data?.confirmedUsers || 0),
    pendingConfirmation: Number(data?.pendingConfirmation || 0),
    signedInLast24h: Number(data?.signedInLast24h || 0),
    customerAccounts: Number(data?.customerAccounts || 0),
    merchantAccounts: Number(data?.merchantAccounts || 0),
  };
}

export async function superAdminFetchActivity(
  userId?: string | null,
  search: string = '',
  limit: number = 200,
  offset: number = 0
): Promise<SuperAdminActivityRow[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('super_admin_activity_feed', {
    p_user_id: userId || null,
    p_search: search || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message || 'Falha ao carregar atividades dos usuários.');
  return (data || []) as SuperAdminActivityRow[];
}

/**
 * Busca todas as contas do sistema registradas no banco (Visão Super Admin)
 */
export async function fetchAllAccountsAsSuperAdmin(): Promise<SandboxAccount[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('super_admin_list_accounts');

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
  const { data, error } = await client.rpc('super_admin_global_metrics');

  if (error) {
    throw new Error(error.message || 'Falha ao carregar métricas globais do banco.');
  }

  return {
    totalAccounts: Number(data?.totalAccounts || 0),
    totalBalanceCustodied: Number(data?.totalBalanceCustodied || 0),
    totalTransactionsCount: Number(data?.totalTransactionsCount || 0),
    totalVolumeTPV: Number(data?.totalVolumeTPV || 0),
    totalMdrRevenueCollected: Number(data?.totalMdrRevenueCollected || 0),
    totalPendingSettlements: Number(data?.totalPendingSettlements || 0),
    pendingTransactionsCount: Number(data?.pendingTransactionsCount || 0),
  };
}

/**
 * Provisiona um novo Tenant / Conta Bancária diretamente pelo Super Admin
 */
export async function superAdminCreateTenantAccount(
  ownerUserId: string,
  input: {
    name: string;
    type: 'merchant' | 'customer';
    cpf_cnpj: string;
    initialBalance?: number;
    pixKey?: string;
    role?: 'standard' | 'bank_manager' | 'super_admin';
  }
): Promise<SandboxAccount> {
  const client = getSupabaseClient();
  const agency = '0001';
  const accountNumber = `${Math.floor(10000 + Math.random() * 90000)}-${Math.floor(1 + Math.random() * 9)}`;
  const defaultPixKey = input.pixKey && input.pixKey.trim() !== ''
    ? input.pixKey.trim()
    : input.type === 'merchant'
    ? `vendas@${input.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.fake`
    : `pix.${input.cpf_cnpj.replace(/[^0-9]/g, '')}@optmapay.fake`;

  const newAccount = {
    user_id: ownerUserId,
    name: input.name,
    type: input.type,
    cpf_cnpj: input.cpf_cnpj,
    phone: '(11) 98888-7766',
    balance: input.type === 'customer' ? 2000.00 : (input.initialBalance !== undefined ? input.initialBalance : 10000.00),
    pix_key: defaultPixKey,
    agency,
    account_number: accountNumber,
    config: {
      role: input.role || 'standard',
      created_by_super_admin: true,
      created_at: new Date().toISOString(),
    },
  };

  const { data, error } = await client.from('accounts').insert([newAccount]).select().single();
  if (error || !data) {
    throw new Error(error?.message || 'Falha ao provisionar tenant no Supabase');
  }
  return data as SandboxAccount;
}

/**
 * Atualiza o papel / delegação de poderes de uma conta existente
 */
export async function superAdminUpdateAccountRole(
  accountId: string,
  role: 'standard' | 'bank_manager' | 'super_admin'
): Promise<void> {
  const client = getSupabaseClient();
  const { data: acc } = await client.from('accounts').select('config').eq('id', accountId).single();
  const existingConfig = acc?.config || {};
  const updatedConfig = { ...existingConfig, role };
  const { error } = await client.from('accounts').update({ config: updatedConfig, updated_at: new Date().toISOString() }).eq('id', accountId);
  if (error) throw error;
}

/**
 * Exclui uma conta sandbox e todos os seus dados correlacionados (ações do Super Admin)
 */
export async function superAdminDeleteAccount(accountId: string): Promise<void> {
  await deleteSandboxAccountRPC(accountId);
}

/**
 * Zera o extrato de testes de uma conta (apaga transações e boletos de teste) e restaura saldo padrão
 */
export async function superAdminResetAccountTransactions(
  accountId: string,
  resetBalanceTo: number = 10000.00
): Promise<void> {
  const client = getSupabaseClient();
  await client.from('transactions').delete().or(`account_id.eq.${accountId},counterparty_account_id.eq.${accountId}`);
  await client.from('boletos').delete().eq('account_id', accountId);
  const { error } = await client.from('accounts').update({
    balance: resetBalanceTo,
    updated_at: new Date().toISOString(),
  }).eq('id', accountId);
  if (error) throw error;
}


