import { supabase } from '../lib/supabase';
import type { EffectiveBankPolicy } from './sandboxDepositService';

const call = async <T>(fn: string, args: Record<string,unknown> = {}): Promise<T> => {
  const {data,error}=await supabase.rpc(fn,args);
  if(error) throw new Error(error.message);
  return data as T;
};

export type BankProfile = 'customer'|'merchant';
export interface BankTypePolicy {
  account_type: BankProfile;
  deposit_min: number; deposit_max: number; pix_daily_limit: number; pix_night_limit: number;
  deposit_free_monthly: number; deposit_excess_fee: number;
  card_credit_limit: number; service_monthly_fee: number;
}
export interface BankAccountSummary {
  id: string; name: string; type: BankProfile; user_id: string;
  email: string|null; has_override: boolean; created_at: string;
}
export interface BankAccountOverride {
  account_id?: string;
  deposit_min?: number|null; deposit_max?: number|null;
  pix_daily_limit?: number|null; pix_night_limit?: number|null;
  deposit_free_monthly?: number|null; deposit_excess_fee?: number|null;
  card_credit_limit?: number|null; service_monthly_fee?: number|null;
  reason?: string; valid_until?: string|null; updated_at?: string;
}
export interface PixLimitSnapshot extends EffectiveBankPolicy {
  date: string; is_night:boolean;
  used_daily:number; used_night:number; remaining_daily:number; remaining_night:number;
  active_remaining:number;
}
export interface PixLimitRequest {
  id:string; account_id?:string; user_id?:string; account_name?:string;account_type?:string;customer_email?:string;
  requested_daily_limit:number;requested_night_limit:number;
  reason:string;status:'pending'|'approved'|'rejected';
  review_note:string|null;reviewed_at:string|null;created_at:string;
}
export interface BankMessage {
  id:string;account_id:string|null;category:string;title:string;body:string;
  created_at:string;read_at:string|null;
}
export const getTypePolicies = (): Promise<BankTypePolicy[]> =>
  call('platform_type_policies_list');
export const saveTypePolicy = (policy:BankTypePolicy,start:number,end:number):Promise<BankTypePolicy> =>
  call('platform_type_policy_save_v2',{
    p_account_type:policy.account_type,p_deposit_min:policy.deposit_min,p_deposit_max:policy.deposit_max,
    p_pix_daily_limit:policy.pix_daily_limit,p_pix_night_limit:policy.pix_night_limit,
    p_pix_night_start_hour:start,p_pix_night_end_hour:end,
    p_deposit_free_monthly:policy.deposit_free_monthly,p_deposit_excess_fee:policy.deposit_excess_fee,
    p_card_credit_limit:policy.card_credit_limit,p_service_monthly_fee:policy.service_monthly_fee,
  });
export const findAccounts = (query:string):Promise<BankAccountSummary[]> =>
  call('platform_accounts_search',{p_query:query,p_limit:100});
export const getAccountOverride = (id:string):Promise<BankAccountOverride> =>
  call('platform_account_override_get',{p_account_id:id});
export const saveAccountOverride = (
  id:string,override:BankAccountOverride,reason:string,validUntil:string|null,
):Promise<EffectiveBankPolicy> =>
  call('platform_account_override_save_v2',{
    p_account_id:id,p_deposit_min:override.deposit_min??null,p_deposit_max:override.deposit_max??null,
    p_pix_daily_limit:override.pix_daily_limit??null,p_pix_night_limit:override.pix_night_limit??null,
    p_reason:reason,p_valid_until:validUntil,
    p_deposit_free_monthly:override.deposit_free_monthly??null,
    p_deposit_excess_fee:override.deposit_excess_fee??null,
    p_card_credit_limit:override.card_credit_limit??null,
    p_service_monthly_fee:override.service_monthly_fee??null,
  });
export const getPixSnapshot = (id:string):Promise<PixLimitSnapshot> =>
  call('platform_pix_limit_snapshot',{p_account_id:id});
export const getMyPixRequests = (id:string):Promise<PixLimitRequest[]> =>
  call('platform_limit_requests_my',{p_account_id:id});
export const sendPixLimitRequest = (id:string,daily:number,night:number,reason:string):Promise<{id:string;status:string}> =>
  call('platform_limit_request_create',{
    p_account_id:id,p_requested_daily_limit:daily,p_requested_night_limit:night,p_reason:reason,
  });
export const getAdminPixRequests = (status:'pending'|'all'|'approved'|'rejected'='pending'):Promise<PixLimitRequest[]> =>
  call('platform_limit_requests_admin',{p_status:status});
export const reviewPixLimitRequest = (
  id:string,decision:'approved'|'rejected',note:string,
):Promise<{id:string;status:string;policy:EffectiveBankPolicy|null}> =>
  call('platform_limit_request_review',{p_request_id:id,p_decision:decision,p_review_note:note});
export const getMyBankMessages = ():Promise<BankMessage[]> =>
  call('platform_messages_my',{p_limit:60});
export const markBankMessageRead = (id:string):Promise<boolean> =>
  call('platform_message_mark_read',{p_id:id});

export async function dispatchQueuedBankEmails(requestId:string):Promise<void> {
  const session=(await supabase.auth.getSession()).data.session;
  if(!session?.access_token) return;
  try {
    await fetch('/api/v1/notifications/dispatch',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
      body:JSON.stringify({requestId}),
    });
  }catch(e){console.warn('E-mails permanecem na fila para reenvio autorizado:',e);}
}
