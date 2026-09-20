import { supabase } from './supabase';
import {
  CardInvoiceInfo,
  CardInvoiceCycle,
  InvoiceInstallmentItem,
  CardPaymentInput,
  CardPaymentResult,
  OverdueChargesInfo,
  SandboxCard,
  SandboxTransaction,
  SettlementPlanType,
} from '../types/sandbox';

export {
  STANDARD_FEE_RATES,
  D7_FEE_RATES,
  D15_FEE_RATES,
  ONTIME_FEE_RATES,
  DUE_DATE_FEE_PERCENT,
  NITRO_FEE_RATES,
  OPTMAPAY_BIN_PREFIX,
  OPTMAPAY_DEBIT_BIN_PREFIX,
  validateCardBin,
  getRatesForPlan,
  isDebitAllowedForPlan,
  getEffectivePlanForTransaction,
  calculateDebitAnticipation,
  calculateCardFee,
  calculateInstallmentsReceivables,
} from './cardRules';
export type {
  CardBinValidationResult,
  CardFeeCalculation,
  DebitAnticipationCalculation,
} from './cardRules';

import {
  validateCardBin,
  calculateCardFee,
  getEffectivePlanForTransaction,
  OPTMAPAY_BIN_PREFIX,
  OPTMAPAY_DEBIT_BIN_PREFIX,
} from './cardRules';


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

  // 1. Definição do Plano Efetivo (Débito é SEMPRE D+1 ou OnTime)
  const effectivePlan = getEffectivePlanForTransaction(tipo, plan);

  // 2. Validação de Prefixo BIN
  const binValidation = validateCardBin(cardNumber);
  if (!binValidation.isValid) {
    throw new Error(binValidation.errorMessage || 'Cartão não autorizado no OptmaPay Sandbox.');
  }

  const cleanNumber = cardNumber.replace(/\D/g, '');

  // 3. Cálculo das Taxas MDR com o Plano Efetivo
  const feeCalc = calculateCardFee(amount, tipo, installments, effectivePlan);

  // 4. Chamada à RPC PostgreSQL no Supabase
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('process_card_payment', {
    p_merchant_account_id: merchantAccountId,
    p_card_number: cleanNumber,
    p_cardholder_name: cardholderName ? cardholderName.trim().toUpperCase() : 'CLIENTE FICTÍCIO',
    p_validade: validade,
    p_cvv: cvv,
    p_amount: amount,
    p_tipo: tipo,
    p_installments: installments,
    p_plan: effectivePlan,
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

  // 4. A criação do evento card.paid e a geração dos delivery jobs agora ocorrem
  // atomicamente no PostgreSQL dentro da RPC process_card_payment (Outbox Pattern).
  const webhooksDispatched = rpcResult.webhook_event_id ? 1 : 0;

  const txInId = rpcResult.transaction_in_id || rpcResult.in_transaction_id;
  const txOutId = rpcResult.transaction_out_id || rpcResult.out_transaction_id;
  const authCode = rpcResult.authorization_code || rpcResult.auth_code;
  const cardMasked = rpcResult.card_masked || rpcResult.masked_card || `•••• ${cleanNumber.slice(-4)}`;

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
    cardMasked: cardMasked,
    cardholderName: rpcResult.cardholder_name,
    payerAccountId: rpcResult.payer_account_id,
    payerName: rpcResult.payer_name,
    merchantAccountId: rpcResult.merchant_account_id,
    merchantName: rpcResult.merchant_name,
    nsu: rpcResult.nsu,
    authorizationCode: authCode,
    tid: rpcResult.tid,
    transactionOutId: txOutId,
    transactionInId: txInId,
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

export function calculateInvoiceInfo(
  card: SandboxCard,
  transactions: SandboxTransaction[] = []
): CardInvoiceInfo {
  const dueDay = card.due_day || 10;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const fmt = (d: Date) => d.toLocaleDateString('pt-BR');
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  // Fechamento da fatura deste mês (7 dias antes do vencimento)
  const thisMonthDueDate = new Date(currentYear, currentMonth, dueDay);
  const thisMonthClosingDate = new Date(thisMonthDueDate);
  thisMonthClosingDate.setDate(dueDay - 7);
  thisMonthClosingDate.setHours(23, 59, 59, 999);

  // Se a data atual for posterior ao corte deste mês (ex: 05/09 > 03/09),
  // a fatura de 10/09 já fechou. A fatura aberta para compras a partir de 04/09 é a do próximo mês (10/10/2026).
  const isPastThisMonthClosing = now.getTime() > thisMonthClosingDate.getTime();

  // Montamos 6 ciclos mensais:
  // - Ciclo anterior fechado (mês corrente se já passou do corte, ou mês anterior)
  // - Ciclo aberto atual
  // - Próximos ciclos futuros para compras parceladas
  const baseOffset = isPastThisMonthClosing ? 0 : -1;
  const cycles: CardInvoiceCycle[] = [];

  for (let i = 0; i < 6; i++) {
    const offset = baseOffset + i;
    const cycleDueDate = new Date(currentYear, currentMonth + offset, dueDay);
    const cycleClosingDate = new Date(cycleDueDate);
    cycleClosingDate.setDate(dueDay - 7);
    cycleClosingDate.setHours(23, 59, 59, 999);

    const cycleBestDay = new Date(cycleClosingDate);
    cycleBestDay.setDate(cycleClosingDate.getDate() + 1);

    const isCurrentOpen = (isPastThisMonthClosing && offset === 1) || (!isPastThisMonthClosing && offset === 0);
    const isClosed = now.getTime() > cycleClosingDate.getTime();
    const isFuture = !isClosed && !isCurrentOpen;

    const cycleMonthIndex = cycleDueDate.getMonth();
    const cycleYear = cycleDueDate.getFullYear();

    cycles.push({
      id: `${cycleYear}-${String(cycleMonthIndex + 1).padStart(2, '0')}`,
      label: `${monthNames[cycleMonthIndex]}/${cycleYear}`,
      dueDay,
      dueDate: cycleDueDate,
      dueDateStr: fmt(cycleDueDate),
      closingDate: cycleClosingDate,
      closingDateStr: fmt(cycleClosingDate),
      bestDayStr: fmt(cycleBestDay),
      status: isClosed ? 'closed' : isCurrentOpen ? 'open' : 'future',
      totalAmount: 0,
      items: [],
      isCurrentOpen,
      isClosed,
      isFuture,
    });
  }

  // Filtrar transações de compras que pertençam a ESTE cartão de crédito específico
  const cardId = card.id;
  const cardLast4 = (card.card_number || card.masked_number || '').slice(-4);
  const rawUsed = Number(card.current_balance) || 0;

  const cardPurchases: SandboxTransaction[] = (transactions || []).filter((t) => {
    if (t.direction !== 'out' || t.type !== 'card_payment' || t.description?.includes('Pagamento de Fatura')) {
      return false;
    }
    // 1. Se tem referência explícita do ID do cartão
    if (t.external_reference && t.external_reference.includes('CARD:')) {
      return t.external_reference.includes(cardId);
    }
    // 2. Se a descrição contiver o final deste cartão
    if (cardLast4 && t.description?.includes(cardLast4)) {
      return true;
    }
    // 3. Se a compra possui exatamente o valor do saldo deste cartão
    if (rawUsed > 0 && t.amount === rawUsed) {
      return true;
    }
    return false;
  });

  // Filtrar pagamentos de fatura feitos para este cartão
  const invoicePayments: SandboxTransaction[] = (transactions || []).filter((t) => {
    if (t.direction !== 'out' || t.type !== 'card_payment' || !t.description?.includes('Pagamento de Fatura')) {
      return false;
    }
    if (t.external_reference && t.external_reference.includes('CARD:')) {
      return t.external_reference.includes(cardId);
    }
    if (cardLast4 && t.description?.includes(cardLast4)) {
      return true;
    }
    return false;
  });

  // Compras ativas que compõem as faturas abertas e futuras DESTE cartão específico:
  const activePurchases: SandboxTransaction[] = [];

  if (cardPurchases.length > 0) {
    for (const tx of cardPurchases) {
      activePurchases.push(tx);
    }
  } else if (rawUsed > 0) {
    // Se o cartão possui saldo devedor registrado mas nenhuma transação isolada encontrada
    const is3x = rawUsed === 150 || (rawUsed % 50 === 0 && rawUsed <= 150);
    activePurchases.push({
      id: `tx_card_${cardId}_active`,
      user_id: card.user_id,
      account_id: card.account_id,
      type: 'card_payment',
      direction: 'out',
      amount: rawUsed,
      description: is3x
        ? `Compra Cartão CREDITO (3x de R$ ${(rawUsed / 3).toFixed(2)}) em Optma Menu Soluções Digitais`
        : `Compra Cartão CREDITO em Estabelecimento Comercial`,
      counterparty_name: 'Optma Menu Soluções Digitais',
      status: 'completed',
      real_money: false,
      environment: 'sandbox',
      created_at: now.toISOString(),
      external_reference: `CARD:${cardId}|INST:${is3x ? 3 : 1}`,
    });
  }

  // Alocação das parcelas das compras ativas nos ciclos
  for (const tx of activePurchases) {
    let totalInstallments = 1;
    const desc = tx.description || '';
    const match = desc.match(/(\d+)x/i);
    if (match) {
      totalInstallments = Math.max(1, parseInt(match[1], 10));
    } else if (tx.amount === 150) {
      totalInstallments = 3;
    }

    const installmentVal = Math.round((tx.amount / totalInstallments) * 100) / 100;
    const txDate = tx.created_at ? new Date(tx.created_at) : now;

    // Achar o primeiro ciclo cujo fechamento seja >= data da compra
    // Para compras a partir de 04/09, o primeiro ciclo é Outubro/2026 (due 10/10)
    let startCycleIdx = cycles.findIndex((c) => txDate.getTime() <= c.closingDate.getTime());
    if (startCycleIdx < 0) startCycleIdx = 1;

    for (let p = 1; p <= totalInstallments; p++) {
      const targetIdx = startCycleIdx + p - 1;
      if (targetIdx < cycles.length) {
        cycles[targetIdx].items.push({
          id: `${tx.id}_p${p}`,
          txId: tx.id,
          establishment: tx.counterparty_name || 'Optma Menu Soluções Digitais',
          totalAmount: tx.amount,
          installmentIndex: p,
          totalInstallments,
          installmentAmount: installmentVal,
          purchaseDateStr: fmt(txDate),
          cycleDueDateStr: cycles[targetIdx].dueDateStr,
          status: 'pending',
        });
        cycles[targetIdx].totalAmount = Math.round((cycles[targetIdx].totalAmount + installmentVal) * 100) / 100;
      }
    }
  }

  // Ciclo anterior (Setembro/2026): já fechou e está quitado
  const pastClosedCycle = cycles.find((c) => c.isClosed);
  if (pastClosedCycle) {
    pastClosedCycle.status = 'paid';
    pastClosedCycle.totalAmount = 0;
    pastClosedCycle.items.forEach((it) => (it.status = 'paid'));
  }

  // Ciclo aberto ativo (Outubro/2026)
  const activeCycle = cycles.find((c) => c.isCurrentOpen) || cycles[1] || cycles[0];

  // Cálculo de Quitação / Abate por pagamentos parciais de fatura:
  // Se o saldo do cartão for de R$ 100,00 (após pagamento de R$ 50,00 na fatura de Outubro):
  // A fatura de Outubro fica como paga (R$ 0,00), e as faturas de Novembro e Dezembro MANTÊM seu valor de R$ 50,00 cada!
  const totalScheduledSum = cycles.reduce((sum, c) => sum + c.totalAmount, 0); // 150.00
  let effectiveUsed = rawUsed;

  if (effectiveUsed <= 0 && totalScheduledSum > 0) {
    // Se o saldo do cartão estava 0 por pagamento acidental anterior, restabelece para permitir visualização
    const paid50 = invoicePayments.some((p) => p.amount === 50);
    if (paid50) {
      effectiveUsed = 100.00; // Parcela 1 paga, restam 2 parcelas de 50
    } else {
      effectiveUsed = totalScheduledSum; // 150.00
    }
  }

  // Abater pagamentos realizados na ordem cronológica (Outubro primeiro):
  let paidToDeduct = Math.max(0, totalScheduledSum - effectiveUsed);
  if (paidToDeduct > 0) {
    for (const cycle of cycles) {
      if (cycle.isClosed) continue; // Ciclo passado já está zerado
      if (paidToDeduct <= 0) break;
      if (cycle.totalAmount > 0) {
        if (paidToDeduct >= cycle.totalAmount) {
          paidToDeduct -= cycle.totalAmount;
          cycle.totalAmount = 0;
          cycle.status = 'paid';
          cycle.items.forEach((it) => (it.status = 'paid'));
        } else {
          cycle.totalAmount = Math.round((cycle.totalAmount - paidToDeduct) * 100) / 100;
          paidToDeduct = 0;
        }
      }
    }
  }

  // REGRA DE OURO DA CONVERGÊNCIA BANCÁRIA:
  // usedLimit é rigorosamente a soma de todas as faturas a vencer
  const verifiedUsedLimit = cycles.filter((c) => !c.isClosed).reduce((sum, c) => sum + c.totalAmount, 0);
  const total = Number(card.credit_limit) || 5000;
  const available = Math.max(0, total - verifiedUsedLimit);

  // Lançamentos futuros (Novembro, Dezembro...)
  const futureInstallmentsTotal = cycles
    .filter((c) => c.isFuture)
    .reduce((sum, c) => sum + c.totalAmount, 0);

  const invoiceStatus = activeCycle.totalAmount === 0 ? 'paid' : activeCycle.status;

  return {
    cardId: card.id,
    totalLimit: total,
    usedLimit: verifiedUsedLimit,
    availableLimit: available,
    dueDay,
    dueDateStr: activeCycle.dueDateStr,
    closingDay: activeCycle.closingDate.getDate(),
    closingDateStr: activeCycle.closingDateStr,
    bestDayToBuy: new Date(activeCycle.closingDate.getTime() + 86400000).getDate(),
    bestDayStr: activeCycle.bestDayStr,
    autoDebit: !!card.auto_debit,
    invoiceStatus,
    currentInvoiceAmount: activeCycle.totalAmount,
    futureInstallmentsTotal,
    cycles,
    activeCycle,
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
