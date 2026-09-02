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
  card_number?: string;
  masked_number: string;
  brand?: string;
  pin?: string;
  validade: string;
  cvv: string;
  credit_limit: number;
  current_balance: number;
  due_day?: number; // Dia de vencimento da fatura (ex: 01, 05, 10, 15, 20, 25)
  auto_debit?: boolean; // Débito automático em conta
  status: 'active' | 'blocked';
  is_virtual?: boolean;
  created_at: string;
}

export interface CardInvoiceInfo {
  cardId: string;
  totalLimit: number;
  usedLimit: number; // fatura atual
  availableLimit: number;
  dueDay: number;
  dueDateStr: string; // Ex: 10/10/2026
  closingDay: number; // Exatamente 7 dias antes do vencimento
  closingDateStr: string; // Ex: 03/10/2026
  bestDayToBuy: number; // Dia seguinte ao fechamento
  bestDayStr: string; // Ex: 04/10/2026
  autoDebit: boolean;
  invoiceStatus: 'open' | 'closed' | 'paid';
}

export type SettlementPlanType =
  | 'ontime'
  | 'standard'
  | 'nitro'
  | 'd1'
  | 'd7'
  | 'd15'
  | 'due_date';

export interface OverdueChargesInfo {
  principalAmount: number;
  daysOverdue: number;
  lateFeePercent: number; // 2.0%
  lateFeeAmount: number;
  monthlyMoraRate: number; // 1.0% a.m.
  moraAmount: number;
  monthlyRotativoRate: number; // 14.5% a.m.
  rotativoAmount: number;
  totalCharges: number;
  totalDueAmount: number;
  isBlockedByOverdue: boolean; // >= 7 dias de atraso
}

export interface InstallmentReceivable {
  installmentNumber: number;
  totalInstallments: number;
  dueDate: string;
  grossAmount: number;
  feePercent: number;
  feeAmount: number;
  netAmount: number;
  status: 'pending' | 'settled' | 'anticipated';
  daysRemaining: number;
  anticipationFeePercent?: number;
  anticipationFeeAmount?: number;
  anticipatedNetAmount?: number;
}

export interface CardFeeRates {
  debit: number;
  credit1x: number;
  credit2x: number;
  credit3x: number;
  credit4x: number;
  credit5x: number;
  credit6x: number;
  credit7x: number;
  credit8x: number;
  credit9x: number;
  credit10x: number;
  credit11x: number;
  credit12x: number;
}

export interface CardPaymentInput {
  merchantAccountId: string;
  cardId?: string;
  cardNumber: string;
  cardholderName: string;
  validade: string;
  cvv: string;
  amount: number;
  tipo: 'debito' | 'credito';
  installments?: number;
  plan?: SettlementPlanType;
  description?: string;
  orderId?: string;
  pin?: string;
}

export interface CardPaymentResult {
  success: boolean;
  status: 'approved' | 'declined';
  message: string;
  amountGross: number;
  feePercent: number;
  feeAmount: number;
  amountNet: number;
  installments: number;
  plan: SettlementPlanType;
  tipo: 'debito' | 'credito';
  cardId?: string;
  cardBrand: string;
  cardMasked: string;
  cardholderName: string;
  payerAccountId?: string;
  payerName?: string;
  merchantAccountId: string;
  merchantName: string;
  nsu: string;
  authorizationCode: string;
  tid: string;
  transactionOutId?: string;
  transactionInId?: string;
  webhooksDispatched: number;
  createdAt: string;
  realMoney: boolean;
  environment: string;
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
