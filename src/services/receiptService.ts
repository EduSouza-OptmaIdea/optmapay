import { supabase } from '../lib/supabase';

/** Contratos SQL permanecem em snake_case; o frontend utiliza interfaces tipadas. */
export type ReceiptKind = 'deposit' | 'pix_sent' | 'pix_received' | 'pix_refund';
export type ReceiptFilter = ReceiptKind | 'all';

export interface ReceiptSummary {
  receipt_id: string;
  kind: ReceiptKind;
  direction: 'in' | 'out';
  amount: number;
  created_at: string;
  description: string | null;
  status: 'completed' | 'refunded';
  counterparty_name: string | null;
  reference: string;
}

export interface ReceiptHistory {
  items: ReceiptSummary[];
  total: number;
  offset: number;
  has_more: boolean;
}

export interface DepositReceiptDetail {
  kind: 'deposit';
  receipt_id: string;
  receipt_label: string;
  operation_id: string;
  account_name: string;
  transaction_id: string;
  fee_transaction_id: string | null;
  description: string;
  amount: number;
  fee_amount: number;
  net_amount: number;
  new_balance: number;
  deposit_number: number;
  created_at: string;
  environment: 'sandbox';
  real_money: false;
}

export interface PixReceiptDetail {
  kind: Exclude<ReceiptKind, 'deposit'>;
  receipt_id: string;
  receipt_label: string;
  transaction_id: string;
  related_transaction_id: string | null;
  account_id: string;
  reference: string;
  amount: number;
  created_at: string;
  description: string | null;
  direction: 'in' | 'out';
  status: 'completed' | 'refunded';
  refunded_amount: number;
  sender_name: string;
  receiver_name: string;
  sender_pix_key: string | null;
  receiver_pix_key: string | null;
  pix_keys_are_current: true;
  environment: 'sandbox';
  real_money: false;
}

export type ReceiptDetail = DepositReceiptDetail | PixReceiptDetail;

export interface ReceiptQuery {
  accountId: string;
  kind: ReceiptFilter;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function fetchBankReceipts(query: ReceiptQuery): Promise<ReceiptHistory> {
  const { data, error } = await supabase.rpc('bank_receipts_list', {
    p_account_id: query.accountId,
    p_kind: query.kind,
    p_search: query.search?.trim() || '',
    p_from: query.from || null,
    p_to: query.to || null,
    p_limit: query.limit ?? 20,
    p_offset: query.offset ?? 0,
  });
  if (error) throw new Error(error.message || 'Não foi possível recuperar os comprovantes.');
  if (!data || !Array.isArray(data.items) || typeof data.total !== 'number') {
    throw new Error('O servidor retornou um histórico de comprovantes inválido.');
  }
  return data as ReceiptHistory;
}

export async function fetchBankReceipt(
  accountId: string,
  kind: ReceiptKind,
  receiptId: string,
): Promise<ReceiptDetail> {
  const { data, error } = await supabase.rpc('bank_receipt_get', {
    p_account_id: accountId,
    p_kind: kind,
    p_receipt_id: receiptId,
  });
  if (error) throw new Error(error.message || 'Não foi possível abrir o comprovante.');
  if (!data || data.kind !== kind || data.environment !== 'sandbox' || data.real_money !== false) {
    throw new Error('O documento recuperado não corresponde a um comprovante sandbox válido.');
  }
  return data as ReceiptDetail;
}
