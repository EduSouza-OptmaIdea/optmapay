import { CardFeeRates, SettlementPlanType, InstallmentReceivable } from '../types/sandbox';

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
  const cleanNumber = (rawCardNumber || '').replace(/\D/g, '');

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
      errorMessage: 'Operação Recusada: Cartão real Visa não permitido no Sandbox. Use apenas cartões fictícios OptmaPay (prefixo 5899 ou 5898).',
    };
  }

  if (/^(5[1-5]|2[2-7])/.test(cleanNumber)) {
    return {
      isValid: false,
      isRealCardBlocked: true,
      brandName: 'Mastercard (Real)',
      errorMessage: 'Operação Recusada: Cartão real Mastercard não permitido no Sandbox. Use apenas cartões fictícios OptmaPay (prefixo 5899 ou 5898).',
    };
  }

  if (/^(34|37)/.test(cleanNumber)) {
    return {
      isValid: false,
      isRealCardBlocked: true,
      brandName: 'American Express (Real)',
      errorMessage: 'Operação Recusada: Cartão real Amex não permitido no Sandbox. Use apenas cartões fictícios OptmaPay (prefixo 5899 ou 5898).',
    };
  }

  if (/^(606282|637095)/.test(cleanNumber)) {
    return {
      isValid: false,
      isRealCardBlocked: true,
      brandName: 'Hipercard (Real)',
      errorMessage: 'Operação Recusada: Cartão real Hipercard não permitido no Sandbox. Use apenas cartões fictícios OptmaPay (prefixo 5899 ou 5898).',
    };
  }

  if (/^(4011|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(cleanNumber)) {
    return {
      isValid: false,
      isRealCardBlocked: true,
      brandName: 'Elo (Real)',
      errorMessage: 'Operação Recusada: Cartão real Elo não permitido no Sandbox. Use apenas cartões fictícios OptmaPay (prefixo 5899 ou 5898).',
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

export function isDebitAllowedForPlan(plan: SettlementPlanType): boolean {
  return plan === 'standard' || plan === 'd1' || plan === 'ontime' || plan === 'nitro';
}

/**
 * Retorna o plano efetivo para a transação.
 * Regra de Negócio: Vendas a débito SEMPRE operam exclusivamente em D+1 ('standard') ou OnTime ('ontime').
 * Se a conta do lojista estiver configurada em D+7, D+15 ou Due Date, qualquer venda no débito
 * opera automaticamente sob o plano D+1 Padrão ('standard').
 */
export function getEffectivePlanForTransaction(
  tipo: 'debito' | 'credito',
  plan: SettlementPlanType = 'standard'
): SettlementPlanType {
  if (tipo === 'debito') {
    if (plan === 'ontime' || plan === 'nitro') {
      return 'ontime';
    }
    return 'standard'; // D+1 Útil Bancário
  }
  return plan;
}

export interface DebitAnticipationCalculation {
  grossAmount: number;
  d1FeePercent: number;
  d1FeeAmount: number;
  originalNetAmount: number;
  ontimeFeePercent: number;
  ontimeTotalFeeAmount: number;
  anticipationCost: number;
  finalNetAmount: number;
}

export function calculateDebitAnticipation(
  netPendingAmount: number,
  knownGrossAmount?: number
): DebitAnticipationCalculation {
  const d1FeePercent = STANDARD_FEE_RATES.debit;
  const ontimeFeePercent = ONTIME_FEE_RATES.debit;

  const grossAmount = knownGrossAmount && knownGrossAmount > 0
    ? Math.round(knownGrossAmount * 100) / 100
    : Math.round((netPendingAmount / (1 - d1FeePercent / 100)) * 100) / 100;

  const d1FeeAmount = Math.round((grossAmount * (d1FeePercent / 100)) * 100) / 100;
  const originalNetAmount = Math.round((grossAmount - d1FeeAmount) * 100) / 100;

  const ontimeTotalFeeAmount = Math.round((grossAmount * (ontimeFeePercent / 100)) * 100) / 100;
  const anticipationCost = Math.max(0, Math.round((ontimeTotalFeeAmount - d1FeeAmount) * 100) / 100);
  const finalNetAmount = Math.max(0, Math.round((grossAmount - ontimeTotalFeeAmount) * 100) / 100);

  return {
    grossAmount,
    d1FeePercent,
    d1FeeAmount,
    originalNetAmount,
    ontimeFeePercent,
    ontimeTotalFeeAmount,
    anticipationCost,
    finalNetAmount,
  };
}

export function calculateCardFee(
  amount: number,
  tipo: 'debito' | 'credito',
  installments: number = 1,
  plan: SettlementPlanType = 'standard'
): CardFeeCalculation {
  const numInstallments = Math.max(1, Math.min(12, installments));
  const effectivePlan = getEffectivePlanForTransaction(tipo, plan);

  let feePercent = 0;

  if (tipo === 'debito') {
    const rates = getRatesForPlan(effectivePlan);
    feePercent = rates.debit;
  } else if (effectivePlan === 'due_date' && tipo === 'credito') {
    feePercent = DUE_DATE_FEE_PERCENT;
  } else {
    const rates = getRatesForPlan(effectivePlan);
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

export function calculateInstallmentsReceivables(
  totalAmount: number,
  installments: number,
  saleDate: Date = new Date()
): InstallmentReceivable[] {
  const count = Math.max(1, Math.min(12, installments));
  const baseInstallmentGross = Math.round((totalAmount / count) * 100) / 100;
  const results: InstallmentReceivable[] = [];

  const baseRate = ONTIME_FEE_RATES.credit1x;
  const discountedRate = DUE_DATE_FEE_PERCENT;

  for (let i = 1; i <= count; i++) {
    const dueDate = new Date(saleDate);
    dueDate.setDate(dueDate.getDate() + i * 30);

    const now = new Date();
    const diffTime = dueDate.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    const feeAmount = Math.round(baseInstallmentGross * (discountedRate / 100) * 100) / 100;
    const netAmount = baseInstallmentGross - feeAmount;

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
