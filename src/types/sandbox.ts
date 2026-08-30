export type AccountType = 'merchant' | 'customer';

export interface SandboxAccount {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  cpf_cnpj: string;
  phone?: string;
  balance: number;
  pix_key: string;
  agency: string;
  account_number: string;
  config?: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export type TransactionType = 'deposit' | 'withdraw' | 'transfer' | 'pix' | 'boleto_payment' | 'card_payment';
export type TransactionDirection = 'in' | 'out';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface SandboxTransaction {
  id: string;
  user_id: string;
  account_id: string;
  counterparty_account_id?: string;
  counterparty_name?: string;
  type: TransactionType;
  direction: TransactionDirection;
  amount: number;
  description?: string;
  external_reference?: string; // Order ID / Duplicata ID
  status: TransactionStatus;
  refunded_amount?: number;
  related_transaction_id?: string;
  real_money: boolean; // Golden Rule: always false
  environment: string; // Golden Rule: always 'sandbox'
  created_at: string;
}

export interface SandboxBoleto {
  id: string;
  user_id: string;
  account_id: string;
  amount: number;
  due_date: string;
  barcode: string;
  linha_digitavel: string;
  status: 'pending' | 'paid' | 'canceled';
  payer_name: string;
  payer_cpf: string;
  external_reference?: string;
  paid_at?: string;
  created_at: string;
}

export interface SandboxCard {
  id: string;
  user_id: string;
  account_id: string;
  tipo: 'debito' | 'credito';
  cardholder_name: string;
  masked_number: string;
  validade: string;
  cvv: string;
  credit_limit: number;
  current_balance: number;
  status: 'active' | 'blocked';
  created_at: string;
}

export interface SandboxWebhookConfig {
  id: string;
  user_id: string;
  account_id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  created_at: string;
}

export interface SandboxWebhookLog {
  id: string;
  user_id: string;
  webhook_config_id: string;
  event: string;
  payload: Record<string, any>;
  response_status?: number;
  response_body?: string;
  attempt_count: number;
  delivered_at: string;
}

export interface SandboxApiKey {
  id: string;
  user_id: string;
  key_name: string;
  api_key: string;
  active: boolean;
  last_used_at?: string;
  created_at: string;
}
