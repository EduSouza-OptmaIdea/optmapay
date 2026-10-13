import { supabase } from '../lib/supabase';

export type PlatformRole = 'owner' | 'admin' | 'user';
export interface PlatformIdentity {
  is_staff: boolean;
  role: PlatformRole | null;
  permissions: string[];
}
export interface PlatformOperator {
  user_id: string;
  email: string;
  role: PlatformRole;
  permissions: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}
export interface PlatformCustomerRow {
  user_id: string;
  email: string;
  created_at: string;
  account_count: number;
  pf_accounts: number;
  pj_accounts: number;
}

export const PLATFORM_PERMISSION_OPTIONS = [
  { value: 'customers.read', label: 'Consultar correntistas' },
  { value: 'customers.manage', label: 'Gerenciar relacionamento com correntistas' },
  { value: 'accounts.read', label: 'Consultar contas' },
  { value: 'limits.manage', label: 'Gerenciar limites' },
  { value: 'fees.manage', label: 'Gerenciar tarifas' },
  { value: 'rates.manage', label: 'Gerenciar taxas e juros' },
  { value: 'system.configure', label: 'Configurar sistema' },
  { value: 'messages.send', label: 'Enviar mensagens' },
  { value: 'education.manage', label: 'Gerenciar educação' },
  { value: 'investments.manage', label: 'Gerenciar investimentos simulados' },
  { value: 'shop.manage', label: 'Gerenciar loja fictícia' },
  { value: 'reports.read', label: 'Consultar relatórios' },
  { value: 'audit.read', label: 'Consultar auditoria' },
] as const;
export const OPERATIONAL_PERMISSION_CODES = ['customers.read','accounts.read','messages.send','reports.read'];

export async function getPlatformIdentity(): Promise<PlatformIdentity> {
  const { data, error } = await supabase.rpc('platform_staff_me');
  if (error) {
    // Fail closed while migrations or server permissions are unavailable.
    console.warn('Não foi possível verificar a identidade administrativa:', error.message);
    return { is_staff: false, role: null, permissions: [] };
  }
  const value = data as Partial<PlatformIdentity> | null;
  return {
    is_staff: value?.is_staff === true,
    role: value?.role === 'owner' || value?.role === 'admin' || value?.role === 'user' ? value.role : null,
    permissions: Array.isArray(value?.permissions) ? value.permissions.filter((v): v is string => typeof v === 'string') : [],
  };
}

export async function getPlatformOperators(): Promise<PlatformOperator[]> {
  const { data, error } = await supabase.rpc('platform_staff_list');
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as PlatformOperator[]) : [];
}

export async function savePlatformOperator(input: {email: string; role: 'admin' | 'user'; permissions: string[]; enabled: boolean}): Promise<void> {
  const { error } = await supabase.rpc('platform_staff_save',{
    p_email: input.email,
    p_role: input.role,
    p_permissions: input.permissions,
    p_enabled: input.enabled,
  });
  if (error) throw new Error(error.message);
}

export async function changePlatformOperatorEnabled(userId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('platform_staff_set_enabled', {
    p_user_id: userId, p_enabled: enabled,
  });
  if (error) throw new Error(error.message);
}

export async function getPlatformCustomers(search = ''): Promise<PlatformCustomerRow[]> {
  const { data, error } = await supabase.rpc('platform_staff_customers',{
    p_search: search || null, p_limit: 100,
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as PlatformCustomerRow[]) : [];
}
