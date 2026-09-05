/**
 * Serviço de Gerenciamento de Parâmetros do Banco (Core Banking Config)
 * Permite que a instituição configure globalmente taxas MDR, prazos,
 * horários de corte de liquidação, prefixos BIN e limites do sandbox.
 */

export interface BankCoreConfig {
  institution: {
    bankName: string;
    tradeName: string;
    ispbCode: string;
    agencyNumber: string;
    environment: 'sandbox' | 'semi-real';
    bacenShieldNotice: string;
  };
  settlementRules: {
    cutOffHour: string; // Ex: "06:00"
    nationalHolidaysActive: boolean;
    calendarDaysCounting: boolean;
    autoSettlementOnStatement: boolean;
  };
  mdrRates: {
    debitD1: number; // 0.85%
    debitOnTime: number; // 1.99%
    credit1xD1: number; // 2.89%
    credit1xOnTime: number; // 5.99%
    anticipationBaseMonthlyRate: number; // 5.99% a.m. (base anti-arbitragem)
    discountD7Percent: number; // 3.0%
    discountD15Percent: number; // 5.0%
    discountDueDatePercent: number; // 10.0%
    creditInstallmentsD1: number[]; // 1x..12x
    creditInstallmentsOnTime: number[]; // 1x..12x
  };
  cardsAndBin: {
    cardBrandName: string;
    binCredit: string;
    binDebit: string;
    allowForeignCards: boolean;
  };
  internetBankingLimits: {
    pixDailyLimit: number;
    pixTransactionLimit: number;
    boletoCompensationDays: number;
    boletoIssuanceFee: number;
  };
  lastUpdatedAt: string;
}

export const DEFAULT_BANK_CORE_CONFIG: BankCoreConfig = {
  institution: {
    bankName: 'OptmaPay Instituição de Pagamentos Fictícia S.A.',
    tradeName: 'OptmaPay Core Banking Sandbox',
    ispbCode: '089 - OptmaPay',
    agencyNumber: '0001',
    environment: 'semi-real',
    bacenShieldNotice: 'Ambiente de Homologação Sandbox Fictício. Não realiza captação de moeda real (Art. 16 Lei 7.492/86).',
  },
  settlementRules: {
    cutOffHour: '06:00',
    nationalHolidaysActive: true,
    calendarDaysCounting: true,
    autoSettlementOnStatement: true,
  },
  mdrRates: {
    debitD1: 0.85,
    debitOnTime: 1.99,
    credit1xD1: 2.89,
    credit1xOnTime: 5.99,
    anticipationBaseMonthlyRate: 5.99,
    discountD7Percent: 3.0,
    discountD15Percent: 5.0,
    discountDueDatePercent: 10.0,
    creditInstallmentsD1: [
      2.89, 4.22, 4.83, 5.44, 6.05, 6.64, 7.24, 7.82, 8.41, 8.98, 9.56, 10.12,
    ],
    creditInstallmentsOnTime: [
      5.99, 11.39, 12.49, 13.09, 13.79, 14.49, 15.49, 16.09, 16.69, 17.39, 18.39, 18.79,
    ],
  },
  cardsAndBin: {
    cardBrandName: 'OptmaCard',
    binCredit: '5899',
    binDebit: '5898',
    allowForeignCards: false,
  },
  internetBankingLimits: {
    pixDailyLimit: 50000.0,
    pixTransactionLimit: 10000.0,
    boletoCompensationDays: 1,
    boletoIssuanceFee: 0.0,
  },
  lastUpdatedAt: new Date().toISOString(),
};

const STORAGE_KEY = 'optmapay_bank_core_config';

/**
 * Obtém os parâmetros do banco gravados ou retorna os valores padrão
 */
export function getBankCoreConfig(): BankCoreConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_BANK_CORE_CONFIG,
        ...parsed,
        institution: { ...DEFAULT_BANK_CORE_CONFIG.institution, ...(parsed.institution || {}) },
        settlementRules: { ...DEFAULT_BANK_CORE_CONFIG.settlementRules, ...(parsed.settlementRules || {}) },
        mdrRates: { ...DEFAULT_BANK_CORE_CONFIG.mdrRates, ...(parsed.mdrRates || {}) },
        cardsAndBin: { ...DEFAULT_BANK_CORE_CONFIG.cardsAndBin, ...(parsed.cardsAndBin || {}) },
        internetBankingLimits: { ...DEFAULT_BANK_CORE_CONFIG.internetBankingLimits, ...(parsed.internetBankingLimits || {}) },
      };
    }
  } catch (err) {
    console.warn('[bankConfigService] Falha ao ler localStorage, utilizando padrão:', err);
  }
  return DEFAULT_BANK_CORE_CONFIG;
}

/**
 * Salva as alterações nos parâmetros do banco
 */
export function saveBankCoreConfig(config: BankCoreConfig): void {
  const updated: BankCoreConfig = {
    ...config,
    lastUpdatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('bank-config-updated', { detail: updated }));
}

/**
 * Restaura todas as taxas e parâmetros para o padrão oficial de fábrica
 */
export function resetBankCoreConfig(): BankCoreConfig {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('bank-config-updated', { detail: DEFAULT_BANK_CORE_CONFIG }));
  return DEFAULT_BANK_CORE_CONFIG;
}
