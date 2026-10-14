import { getSupabaseClient } from '../lib/supabase/client';

export interface SandboxDepositQuote {
  account_id: string;
  amount: number;
  fee_amount: number;
  net_amount: number;
  deposits_this_month: number;
  next_deposit_number: number;
  free_monthly: number;
  free_remaining: number;
  min_amount: number;
  max_amount: number;
  period: string;
  timezone: string;
  environment: 'sandbox';
  real_money: false;
}

export interface SandboxDepositReceipt {
  success: true;
  receipt_label: string;
  operation_id: string;
  account_id: string;
  transaction_id: string;
  fee_transaction_id: string | null;
  idempotency_key: string;
  description: string;
  amount: number;
  fee_amount: number;
  net_amount: number;
  new_balance: number;
  deposit_number: number;
  free_monthly: number;
  period: string;
  timezone: string;
  created_at: string;
  environment: 'sandbox';
  real_money: false;
  replayed: boolean;
  message: string;
}

export function newDepositIdempotencyKey(): string {
  if (!crypto?.getRandomValues) throw new Error('Este navegador não oferece geração segura de identificadores.');
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return 'dep_' + Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
}

export async function previewSandboxDeposit(accountId: string, amount: number): Promise<SandboxDepositQuote> {
  const {data,error} = await getSupabaseClient().rpc('sandbox_deposit_quote', {
    p_account_id: accountId,
    p_amount: amount,
  });
  if(error) throw new Error(error.message || 'Não foi possível calcular o depósito.');
  if(!data || typeof data !== 'object') throw new Error('Cotação de depósito indisponível.');
  return data as SandboxDepositQuote;
}

export async function confirmSandboxDeposit(
  accountId: string,
  amount: number,
  description: string,
  idempotencyKey: string,
  expectedFee: number,
): Promise<SandboxDepositReceipt> {
  const {data,error} = await getSupabaseClient().rpc('sandbox_deposit_confirm', {
    p_account_id: accountId,
    p_amount: amount,
    p_description: description,
    p_idempotency_key: idempotencyKey,
    p_expected_fee: expectedFee,
  });
  if(error) throw new Error(error.message || 'Depósito não concluído.');
  if(!data || data.success !== true || data.real_money !== false) throw new Error('Comprovante de depósito inválido.');
  return data as SandboxDepositReceipt;
}

export interface EffectiveBankPolicy {
  account_id: string;
  account_type: 'customer' | 'merchant';
  deposit_min: number;
  deposit_max: number;
  pix_daily_limit: number;
  pix_night_limit: number;
  pix_night_start_hour: number;
  pix_night_end_hour: number;
  timezone: string;
  has_override: boolean;
  valid_until: string | null;
}

export async function fetchEffectiveBankPolicy(accountId: string): Promise<EffectiveBankPolicy> {
  const {data,error} = await getSupabaseClient().rpc('platform_effective_policy',{p_account_id:accountId});
  if(error || !data) throw new Error(error?.message || 'Não foi possível consultar limites de sua conta.');
  return data as EffectiveBankPolicy;
}
