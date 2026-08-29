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

  try {
    let query = client.from('accounts').select('*');

    if (userId && userId.trim() !== '' && userId !== '00000000-0000-0000-0000-000000000001') {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) {
      if (error.code === 'PGRST301' || error.message?.includes('Invalid API key') || error.message?.includes('JWT')) {
        return { accounts: [], isUnauthorized: true };
      }
      console.warn('Erro ao buscar contas no Supabase:', error.message);
      return { accounts: [], isUnauthorized: false };
    }

    return { accounts: (data || []) as SandboxAccount[], isUnauthorized: false };
  } catch (err: any) {
    return { accounts: [], isUnauthorized: true };
  }
}

export async function createBankAccount(userId: string | undefined, input: CreateAccountInput): Promise<SandboxAccount | null> {
  const client = getSupabaseClient();

  const validUserId = (userId && userId.trim() !== '' && userId !== '00000000-0000-0000-0000-000000000001')
    ? userId
    : null;

  const agency = '0001';
  const accountNumber = `${Math.floor(10000 + Math.random() * 90000)}-${Math.floor(1 + Math.random() * 9)}`;
  const defaultPixKey = input.pixKey && input.pixKey.trim() !== ''
    ? input.pixKey.trim()
    : input.type === 'merchant'
    ? `vendas@${input.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.fake`
    : `pix.${input.cpf_cnpj.replace(/[^0-9]/g, '')}@optmapay.fake`;

  const newAccount = {
    user_id: validUserId,
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
