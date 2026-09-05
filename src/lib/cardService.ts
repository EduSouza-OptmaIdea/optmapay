import { supabase } from './supabase';
import { triggerWebhookEvents } from './webhookEngine';
import {
  CardFeeRates,
  CardInvoiceInfo,
  CardPaymentInput,
  CardPaymentResult,
  InstallmentReceivable,
  OverdueChargesInfo,
  SandboxCard,
  SettlementPlanType,
} from '../types/sandbox';

// ==============================================================================
// 1. TABELAS OFICIAIS DE TAXAS MDR (D+0 ONTIME, D+1, D+7, D+15 E VENCIMENTO)
// ==============================================================================

/**
 * Plano Padrão (Recebimento D+1 / 1 dia útil) - Base de cálculo
 */
export const STANDARD_FEE_RATES: CardFeeRates = {
  debit: 0.85,
  credit1x: 2.89,
  credit2x: 4.22,
  credit3x: 4.83,
  credit4x: 5.44,
  credit5x: 6.05,
  credit6x: 6.64,
  credit7x: 7.24,
  credit8x: 7.82,
  credit9x: 8.41,
  credit10x: 8.98,
  credit11x: 9.56,
  credit12x: 10.12,
};

/**
 * Plano D+7 (Recebimento em 7 dias úteis - 3% de desconto sobre a taxa do D+1)
 */
export const D7_FEE_RATES: CardFeeRates = {
  debit: 0.8245,
  credit1x: 2.8033,
  credit2x: 4.0934,
  credit3x: 4.6851,
  credit4x: 5.2768,
  credit5x: 5.8685,
  credit6x: 6.4408,
  credit7x: 7.0228,
  credit8x: 7.5854,
  credit9x: 8.1577,
  credit10x: 8.7106,
  credit11x: 9.2732,
  credit12x: 9.8164,
};

/**
 * Plano D+15 (Recebimento em 15 dias úteis - 5% de desconto sobre a taxa do D+1)
 */
export const D15_FEE_RATES: CardFeeRates = {
  debit: 0.8075,
  credit1x: 2.7455,
  credit2x: 4.0090,
  credit3x: 4.5885,
  credit4x: 5.1680,
  credit5x: 5.7475,
  credit6x: 6.3080,
  credit7x: 6.8780,
  credit8x: 7.4290,
  credit9x: 7.9895,
  credit10x: 8.5310,
  credit11x: 9.0820,
  credit12x: 9.6140,
};

/**
 * Plano OnTime (Recebimento na Hora / D+0) - ⚡ OnTime
 */
export const ONTIME_FEE_RATES: CardFeeRates = {
  debit: 1.99,
  credit1x: 5.99,
  credit2x: 11.39,
  credit3x: 12.49,
  credit4x: 13.09,
  credit5x: 13.79,
  credit6x: 14.49,
  credit7x: 15.49,
  credit8x: 16.09,
  credit9x: 16.69,
  credit10x: 17.39,
  credit11x: 18.39,
  credit12x: 18.79,
};

/**
 * Taxa do Plano Receber no Vencimento (10% de desconto sobre o crédito 1x)
 */
export const DUE_DATE_FEE_PERCENT = 2.601; // 2.89 * 0.90

export const NITRO_FEE_RATES = ONTIME_FEE_RATES;
export const OPTMAPAY_BIN_PREFIX = '5899';
export const OPTMAPAY_DEBIT_BIN_PREFIX = '5898';

// ==============================================================================
// 2. VALIDAÇÃO ESTREITA DE BANDEIRAS E PREFIXO BIN
// ==============================================================================

export interface CardBinValidationResult {
  isValid: boolean;
  isRealCardBlocked: boolean;
  brandName: string;
  detectedType?: 'debito' | 'credito';
  errorMessage?: string;
}

export function validateCardBin(rawCardNumber: string): CardBinValidationResult {
  const cleanNumber = rawCardNumber.replace(/\D/g, '');

  if (!cleanNumber) {
    return {
      isValid: false,
      isRealCardBlocked: false,
      brandName: 'Desconhecida',
      errorMessage: 'Número do cartão não informado.',
    };
  }

  // 1. Detecção e Bloqueio de Cartões Reais
  if (cleanNumber.startsWith('4')) {
    return {
      isValid: false,
      isRealCardBlocked: true,
      brandName: 'Visa (Real)',
      errorMessage: 'Operação Recusada: Cartão real Visa não permitido no Sandbox. Use apenas cartões fictícios OptmaPay (prefixo 5899).',
    };
  }

  if (/^(5[1-5]|2[2-7])/.test(cleanNumber)) {
    return {
      isValid: false,
      isRealCardBlocked: true,
      brandName: 'Mastercard (Real)',
      errorMessage: 'Operação Recusada: Cartão real Mastercard não permitido no Sandbox. Use apenas cartões fictícios OptmaPay (prefixo 5899).',
    };
  }

  if (/^(34|37)/.test(cleanNumber)) {
    return {
      isValid: false,
      isRealCardBlocked: true,
      brandName: 'American Express (Real)',
      errorMessage: 'Operação Recusada: Cartão real Amex não permitido no Sandbox. Use apenas cartões fictícios OptmaPay (prefixo 5899).',
    };
  }

  if (/^(606282|637095)/.test(cleanNumber)) {
    return {
      isValid: false,
      isRealCardBlocked: true,
      brandName: 'Hipercard (Real)',
      errorMessage: 'Operação Recusada: Cartão real Hipercard não permitido no Sandbox. Use apenas cartões fictícios OptmaPay (prefixo 5899).',
    };
  }

  if (/^(4011|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(cleanNumber)) {
    return {
      isValid: false,
      isRealCardBlocked: true,
      brandName: 'Elo (Real)',
      errorMessage: 'Operação Recusada: Cartão real Elo não permitido no Sandbox. Use apenas cartões fictícios OptmaPay (prefixo 5899).',
    };
  }

  // 2. Validação do Prefixo Exclusivo OptmaPay Sandbox
  if (cleanNumber.startsWith(OPTMAPAY_BIN_PREFIX)) {
    return {
      isValid: true,
      isRealCardBlocked: false,
      brandName: 'OptmaCard Crédito',
      detectedType: 'credito',
    };
  }

  if (cleanNumber.startsWith(OPTMAPAY_DEBIT_BIN_PREFIX)) {
    return {
      isValid: true,
      isRealCardBlocked: false,
      brandName: 'OptmaCard Débito',
      detectedType: 'debito',
    };
  }

  return {
    isValid: false,
    isRealCardBlocked: true,
    brandName: 'Bandeira Desconhecida',
    errorMessage: `Prefixo não autorizado. O OptmaPay Sandbox aceita somente cartões fictícios gerados no sistema iniciando com ${OPTMAPAY_BIN_PREFIX} ou ${OPTMAPAY_DEBIT_BIN_PREFIX}.`,
  };
}

// ==============================================================================
// 3. CÁLCULO DE TAXAS MDR & PARCELAS PARA TODOS OS PLANOS
// ==============================================================================

export interface CardFeeCalculation {
  feePercent: number;
  feeAmount: number;
  netAmount: number;
  installmentAmount: number;
  totalInstallments: number;
  plan: SettlementPlanType;
}

export function getRatesForPlan(plan: SettlementPlanType): CardFeeRates {
  switch (plan) {
    case 'ontime':
    case 'nitro':
      return ONTIME_FEE_RATES;
    case 'd7':
      return D7_FEE_RATES;
    case 'd15':
      return D15_FEE_RATES;
    case 'd1':
    case 'standard':
    default:
      return STANDARD_FEE_RATES;
  }
}

export function calculateCardFee(
  amount: number,
  tipo: 'debito' | 'credito',
  installments: number = 1,
  plan: SettlementPlanType = 'standard'
): CardFeeCalculation {
  const numInstallments = Math.max(1, Math.min(12, installments));

  let feePercent = 0;

  if (plan === 'due_date' && tipo === 'credito') {
    // Plano Vencimento: cada parcela tem 10% de desconto sobre o crédito 1x
    feePercent = DUE_DATE_FEE_PERCENT;
  } else {
    const rates = getRatesForPlan(plan);
    if (tipo === 'debito') {
      feePercent = rates.debit;
    } else {
      switch (numInstallments) {
        case 1: feePercent = rates.credit1x; break;
        case 2: feePercent = rates.credit2x; break;
        case 3: feePercent = rates.credit3x; break;
        case 4: feePercent = rates.credit4x; break;
        case 5: feePercent = rates.credit5x; break;
        case 6: feePercent = rates.credit6x; break;
        case 7: feePercent = rates.credit7x; break;
        case 8: feePercent = rates.credit8x; break;
        case 9: feePercent = rates.credit9x; break;
        case 10: feePercent = rates.credit10x; break;
        case 11: feePercent = rates.credit11x; break;
        case 12: feePercent = rates.credit12x; break;
        default: feePercent = rates.credit1x; break;
      }
    }
  }

  const feeAmount = Math.round((amount * (feePercent / 100)) * 100) / 100;
  const netAmount = Math.max(0, Math.round((amount - feeAmount) * 100) / 100);
  const installmentAmount = Math.round((amount / numInstallments) * 100) / 100;

  return {
    feePercent,
    feeAmount,
    netAmount,
    installmentAmount,
    totalInstallments: numInstallments,
    plan,
  };
}

/**
 * Calcula o cronograma de parcelas e simulação de antecipação pro-rata no plano Receber no Vencimento.
 */
export function calculateInstallmentsReceivables(
  totalAmount: number,
  installments: number,
  saleDate: Date = new Date()
): InstallmentReceivable[] {
  const count = Math.max(1, Math.min(12, installments));
  const baseInstallmentGross = Math.round((totalAmount / count) * 100) / 100;
  const results: InstallmentReceivable[] = [];

  const baseRate = ONTIME_FEE_RATES.credit1x; // 5.99% a.m. (base OnTime 1x para evitar arbitragem)
  const discountedRate = DUE_DATE_FEE_PERCENT; // 2.601%

  for (let i = 1; i <= count; i++) {
    const dueDate = new Date(saleDate);
    dueDate.setDate(dueDate.getDate() + i * 30);

    const now = new Date();
    const diffTime = dueDate.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    const feeAmount = Math.round(baseInstallmentGross * (discountedRate / 100) * 100) / 100;
    const netAmount = baseInstallmentGross - feeAmount;

    // Antecipação pro-rata: taxa base sem desconto proporcional aos dias restantes
    const anticipationFeePercent = Math.round(((baseRate / 30) * Math.min(30, daysRemaining)) * 10000) / 10000;
    const anticipationFeeAmount = Math.round(baseInstallmentGross * (anticipationFeePercent / 100) * 100) / 100;
    const anticipatedNetAmount = Math.max(0, baseInstallmentGross - anticipationFeeAmount);

    results.push({
      installmentNumber: i,
      totalInstallments: count,
      dueDate: dueDate.toLocaleDateString('pt-BR'),
      grossAmount: baseInstallmentGross,
      feePercent: discountedRate,
      feeAmount,
      netAmount,
      status: 'pending',
      daysRemaining,
      anticipationFeePercent,
      anticipationFeeAmount,
      anticipatedNetAmount,
    });
  }

  return results;
}

// ==============================================================================
// 4. GERADOR DE CARTÕES FICTÍCIOS COM PREFIXO OPTMAPAY
// ==============================================================================

export function generateOptmaCardNumber(tipo: 'debito' | 'credito'): {
  cardNumber: string;
  maskedNumber: string;
  validade: string;
  cvv: string;
  pin: string;
} {
  const prefix = tipo === 'credito' ? OPTMAPAY_BIN_PREFIX : OPTMAPAY_DEBIT_BIN_PREFIX;
  const block2 = String(Math.floor(1000 + Math.random() * 9000));
  const block3 = String(Math.floor(1000 + Math.random() * 9000));
  const block4 = String(Math.floor(1000 + Math.random() * 9000));

  const fullNumber = `${prefix}${block2}${block3}${block4}`;
  const maskedNumber = `${prefix} **** **** ${block4}`;

  const now = new Date();
  const expMonth = String(now.getMonth() + 1).padStart(2, '0');
  const expYear = String(now.getFullYear() + 4).slice(-2);
  const validade = `${expMonth}/${expYear}`;

  const cvv = String(Math.floor(100 + Math.random() * 900));
  const pin = '1234';

  return {
    cardNumber: fullNumber,
    maskedNumber,
    validade,
    cvv,
    pin,
  };
}

// ==============================================================================
// 5. PROCESSAMENTO DE TRANSAÇÃO (VIA RPC + WEBHOOK ENGINE)
// ==============================================================================

export async function executeCardPayment(input: CardPaymentInput): Promise<CardPaymentResult> {
  const {
    merchantAccountId,
    cardId,
    cardNumber,
    cardholderName,
    validade,
    cvv,
    amount,
    tipo,
    installments = 1,
    plan = 'standard',
    description = 'Venda Cartão OptmaPay Sandbox',
    orderId,
    pin,
  } = input;

  if (!merchantAccountId) {
    throw new Error('Conta do estabelecimento não informada.');
  }

  if (isNaN(amount) || amount <= 0) {
    throw new Error('Valor da venda inválido. Deve ser maior que zero.');
  }

  // 1. Validação de Prefixo BIN
  const binValidation = validateCardBin(cardNumber);
  if (!binValidation.isValid) {
    throw new Error(binValidation.errorMessage || 'Cartão não autorizado no OptmaPay Sandbox.');
  }

  const cleanNumber = cardNumber.replace(/\D/g, '');

  // 2. Cálculo das Taxas MDR
  const feeCalc = calculateCardFee(amount, tipo, installments, plan);

  // 3. Chamada à RPC PostgreSQL no Supabase
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('process_card_payment', {
    p_merchant_account_id: merchantAccountId,
    p_card_number: cleanNumber,
    p_cardholder_name: cardholderName ? cardholderName.trim().toUpperCase() : 'CLIENTE FICTÍCIO',
    p_validade: validade,
    p_cvv: cvv,
    p_amount: amount,
    p_tipo: tipo,
    p_installments: installments,
    p_plan: plan,
    p_fee_percent: feeCalc.feePercent,
    p_fee_amount: feeCalc.feeAmount,
    p_net_amount: feeCalc.netAmount,
    p_description: description,
    p_external_reference: orderId || null,
    p_pin: pin || null,
    p_card_id: cardId || null,
  });

  if (rpcErr) {
    throw new Error(rpcErr.message || 'Erro ao processar transação de cartão no servidor.');
  }

  if (!rpcResult || !rpcResult.success) {
    throw new Error(rpcResult?.message || 'Falha ao autorizar pagamento com cartão.');
  }

  // 4. Disparo de Webhooks para o Estabelecimento
  let webhooksDispatched = 0;
  try {
    const { data: merchantAcc } = await supabase
      .from('accounts')
      .select('user_id')
      .eq('id', merchantAccountId)
      .single();

    webhooksDispatched = await triggerWebhookEvents({
      userId: merchantAcc?.user_id || '',
      accountId: merchantAccountId,
      event: 'card.paid',
      payloadData: {
        transactionId: rpcResult.transaction_in_id || `tx_card_${Date.now()}`,
        orderId: orderId || rpcResult.tid,
        externalReference: orderId || rpcResult.tid,
        amountGross: amount,
        feePercent: feeCalc.feePercent,
        feeAmount: feeCalc.feeAmount,
        amountNet: feeCalc.netAmount,
        installments: feeCalc.totalInstallments,
        plan,
        tipo,
        status: 'paid',
        authorizationCode: rpcResult.authorization_code,
        nsu: rpcResult.nsu,
        tid: rpcResult.tid,
        cardMasked: rpcResult.card_masked,
        cardBrand: rpcResult.card_brand || 'OptmaCard',
        cardholderName: rpcResult.cardholder_name,
        merchantName: rpcResult.merchant_name,
        payerName: rpcResult.payer_name,
        realMoney: false,
        environment: 'sandbox',
        paidAt: new Date().toISOString(),
      },
    });

    await triggerWebhookEvents({
      userId: merchantAcc?.user_id || '',
      accountId: merchantAccountId,
      event: 'order.paid',
      payloadData: {
        orderId: orderId || rpcResult.tid,
        amount: amount,
        netAmount: feeCalc.netAmount,
        status: 'paid',
        paymentMethod: 'card',
        cardType: tipo,
        cardMasked: rpcResult.card_masked,
        nsu: rpcResult.nsu,
        realMoney: false,
        environment: 'sandbox',
      },
    });
  } catch (whErr) {
    console.warn('[Card Webhook Dispatch Warning]', whErr);
  }

  return {
    success: true,
    status: rpcResult.status === 'scheduled' ? 'declined' : 'approved',
    message: rpcResult.message || 'Transação aprovada com sucesso!',
    amountGross: amount,
    feePercent: feeCalc.feePercent,
    feeAmount: feeCalc.feeAmount,
    amountNet: feeCalc.netAmount,
    installments: feeCalc.totalInstallments,
    plan,
    tipo,
    cardId: rpcResult.card_id,
    cardBrand: rpcResult.card_brand || 'OptmaCard',
    cardMasked: rpcResult.card_masked,
    cardholderName: rpcResult.cardholder_name,
    payerAccountId: rpcResult.payer_account_id,
    payerName: rpcResult.payer_name,
    merchantAccountId: rpcResult.merchant_account_id,
    merchantName: rpcResult.merchant_name,
    nsu: rpcResult.nsu,
    authorizationCode: rpcResult.authorization_code,
    tid: rpcResult.tid,
    transactionOutId: rpcResult.transaction_out_id,
    transactionInId: rpcResult.transaction_in_id,
    webhooksDispatched,
    createdAt: rpcResult.created_at || new Date().toISOString(),
    realMoney: false,
    environment: 'sandbox',
  };
}

// ==============================================================================
// 6. FATURAS, ENCARGOS POR ATRASO E BLOQUEIO APÓS 7 DIAS
// ==============================================================================

export const INVOICE_DUE_DAYS = [1, 5, 10, 15, 20, 25];

export function calculateInvoiceInfo(card: SandboxCard): CardInvoiceInfo {
  const dueDay = card.due_day || 10;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let dueDate = new Date(currentYear, currentMonth, dueDay);
  if (now.getDate() > dueDay) {
    dueDate = new Date(currentYear, currentMonth + 1, dueDay);
  }

  const closingDate = new Date(dueDate);
  closingDate.setDate(dueDate.getDate() - 7);

  const bestDate = new Date(closingDate);
  bestDate.setDate(closingDate.getDate() + 1);

  const used = Number(card.current_balance) || 0;
  const total = Number(card.credit_limit) || 0;
  const available = Math.max(0, total - used);

  const isClosed = now >= closingDate;
  const invoiceStatus = used === 0 ? 'paid' : isClosed ? 'closed' : 'open';

  const fmt = (d: Date) => d.toLocaleDateString('pt-BR');

  return {
    cardId: card.id,
    totalLimit: total,
    usedLimit: used,
    availableLimit: available,
    dueDay,
    dueDateStr: fmt(dueDate),
    closingDay: closingDate.getDate(),
    closingDateStr: fmt(closingDate),
    bestDayToBuy: bestDate.getDate(),
    bestDayStr: fmt(bestDate),
    autoDebit: !!card.auto_debit,
    invoiceStatus,
  };
}

/**
 * Calcula encargos de atraso com multa de 2%, juros de mora (1% a.m.) e rotativo de mercado (14.5% a.m.)
 * Bloqueia o cartão automaticamente se o atraso for >= 7 dias.
 */
export function calculateOverdueCharges(principalAmount: number, daysOverdue: number): OverdueChargesInfo {
  const principal = Math.max(0, principalAmount);
  const days = Math.max(0, daysOverdue);

  if (days === 0 || principal === 0) {
    return {
      principalAmount: principal,
      daysOverdue: 0,
      lateFeePercent: 2.0,
      lateFeeAmount: 0,
      monthlyMoraRate: 1.0,
      moraAmount: 0,
      monthlyRotativoRate: 14.5,
      rotativoAmount: 0,
      totalCharges: 0,
      totalDueAmount: principal,
      isBlockedByOverdue: false,
    };
  }

  const lateFeeAmount = Math.round(principal * 0.02 * 100) / 100;
  const moraAmount = Math.round(principal * (0.01 / 30) * days * 100) / 100;
  const rotativoAmount = Math.round(principal * (0.145 / 30) * days * 100) / 100;
  const totalCharges = Math.round((lateFeeAmount + moraAmount + rotativoAmount) * 100) / 100;
  const totalDueAmount = Math.round((principal + totalCharges) * 100) / 100;
  const isBlockedByOverdue = days >= 7;

  return {
    principalAmount: principal,
    daysOverdue: days,
    lateFeePercent: 2.0,
    lateFeeAmount,
    monthlyMoraRate: 1.0,
    moraAmount,
    monthlyRotativoRate: 14.5,
    rotativoAmount,
    totalCharges,
    totalDueAmount,
    isBlockedByOverdue,
  };
}

/**
 * Bloqueia o cartão após 3 tentativas de senha incorreta.
 */
export async function blockCardByPinAttempts(cardNumber: string, cardId?: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('block_card_pin_attempts', {
    p_card_id: cardId || null,
    p_card_number: cardNumber,
  });

  if (error) {
    console.warn('Erro ao bloquear cartão por tentativas de PIN:', error);
    return false;
  }
  return data?.success || false;
}

/**
 * Bloqueia o cartão por inadimplência (> 7 dias de atraso na fatura).
 */
export async function blockOverdueCard(cardId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('block_overdue_card', {
    p_card_id: cardId,
  });

  if (error) {
    console.warn('Erro ao bloquear cartão por atraso:', error);
    return false;
  }
  return data?.success || false;
}

export async function payCreditCardInvoice(cardId: string, amount?: number): Promise<{
  success: boolean;
  message: string;
  amountPaid: number;
  availableCreditLimit: number;
}> {
  const { data, error } = await supabase.rpc('pay_credit_card_invoice', {
    p_card_id: cardId,
    p_amount: amount || null,
  });

  if (error) {
    throw new Error(error.message || 'Falha ao processar pagamento da fatura.');
  }

  return {
    success: true,
    message: data?.message || 'Fatura paga com sucesso!',
    amountPaid: data?.amount_paid || 0,
    availableCreditLimit: data?.available_credit_limit || 0,
  };
}

export async function releaseD1Settlement(transactionId: string, accountId: string): Promise<{
  success: boolean;
  message: string;
  amountCredited: number;
}> {
  const { data, error } = await supabase.rpc('release_d1_settlement', {
    p_transaction_id: transactionId,
    p_account_id: accountId,
  });

  if (error) {
    console.warn('[releaseD1Settlement] RPC falhou ou não existe, executando liquidação via fallback direto:', error.message);
    // 1. Busca a transação
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('account_id', accountId)
      .single();

    if (txErr || !tx) {
      throw new Error(txErr?.message || 'Transação não encontrada para liquidação.');
    }

    if (tx.status === 'completed') {
      return { success: true, message: 'Transação já havia sido liquidada.', amountCredited: Number(tx.amount || 0) };
    }

    // 2. Busca conta para somar saldo
    const { data: acc, error: accErr } = await supabase
      .from('accounts')
      .select('balance')
      .eq('id', accountId)
      .single();

    if (accErr || !acc) {
      throw new Error(accErr?.message || 'Conta não encontrada.');
    }

    const newBalance = Number(acc.balance || 0) + Number(tx.amount || 0);

    // 3. Atualiza saldo da conta
    const { error: updAccErr } = await supabase
      .from('accounts')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', accountId);

    if (updAccErr) throw updAccErr;

    // 4. Atualiza transação para completed
    const rawDesc = tx.description || '';
    const updatedDesc = rawDesc.includes('Lançamento Futuro')
      ? rawDesc.replace(/Lançamento Futuro (D\+\d+|no Vencimento)/, 'Liquidado ($1)')
      : `${rawDesc} (Liquidado)`;

    const { error: updTxErr } = await supabase
      .from('transactions')
      .update({ status: 'completed', description: updatedDesc })
      .eq('id', transactionId);

    if (updTxErr) throw updTxErr;

    return {
      success: true,
      message: 'Lançamento liquidado e creditado com sucesso!',
      amountCredited: Number(tx.amount || 0),
    };
  }

  return {
    success: true,
    message: data?.message || 'Lançamento liquidado com sucesso!',
    amountCredited: data?.amount_credited || 0,
  };
}
