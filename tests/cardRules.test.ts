import { describe, it, expect } from 'vitest';
import {
  validateCardBin,
  calculateCardFee,
  getEffectivePlanForTransaction,
  getRatesForPlan,
  isDebitAllowedForPlan,
  OPTMAPAY_BIN_PREFIX,
  OPTMAPAY_DEBIT_BIN_PREFIX,
} from '../src/lib/cardRules';

describe('Card Rules & MDR Matrices', () => {
  describe('validateCardBin', () => {
    it('deve aceitar cartão fictício OptmaPay Crédito (prefixo 5899)', () => {
      const res = validateCardBin('5899123456789012');
      expect(res.isValid).toBe(true);
      expect(res.isRealCardBlocked).toBe(false);
      expect(res.detectedType).toBe('credito');
    });

    it('deve aceitar cartão fictício OptmaPay Débito (prefixo 5898)', () => {
      const res = validateCardBin('5898123456789012');
      expect(res.isValid).toBe(true);
      expect(res.isRealCardBlocked).toBe(false);
      expect(res.detectedType).toBe('debito');
    });

    it('deve bloquear cartão real Visa (iniciado em 4)', () => {
      const res = validateCardBin('4111111111111111');
      expect(res.isValid).toBe(false);
      expect(res.isRealCardBlocked).toBe(true);
      expect(res.brandName).toContain('Visa');
    });

    it('deve bloquear cartão real Mastercard (iniciado em 51-55 ou 22-27)', () => {
      const res = validateCardBin('5500000000000004');
      expect(res.isValid).toBe(false);
      expect(res.isRealCardBlocked).toBe(true);
      expect(res.brandName).toContain('Mastercard');
    });

    it('deve bloquear cartão real Amex (iniciado em 34 ou 37)', () => {
      const res = validateCardBin('378282246310005');
      expect(res.isValid).toBe(false);
      expect(res.isRealCardBlocked).toBe(true);
      expect(res.brandName).toContain('American Express');
    });

    it('deve bloquear cartão real Elo', () => {
      const res = validateCardBin('6363680000000000');
      expect(res.isValid).toBe(false);
      expect(res.isRealCardBlocked).toBe(true);
      expect(res.brandName).toContain('Elo');
    });

    it('deve rejeitar string vazia ou sem números', () => {
      const res = validateCardBin('');
      expect(res.isValid).toBe(false);
    });
  });

  describe('getEffectivePlanForTransaction', () => {
    it('débito deve forçar standard se a conta estiver em d7, d15 ou due_date', () => {
      expect(getEffectivePlanForTransaction('debito', 'd7')).toBe('standard');
      expect(getEffectivePlanForTransaction('debito', 'd15')).toBe('standard');
      expect(getEffectivePlanForTransaction('debito', 'due_date')).toBe('standard');
      expect(getEffectivePlanForTransaction('debito', 'standard')).toBe('standard');
    });

    it('débito em ontime ou nitro deve permanecer ontime', () => {
      expect(getEffectivePlanForTransaction('debito', 'ontime')).toBe('ontime');
      expect(getEffectivePlanForTransaction('debito', 'nitro')).toBe('ontime');
    });

    it('crédito preserva o plano configurado na conta', () => {
      expect(getEffectivePlanForTransaction('credito', 'd7')).toBe('d7');
      expect(getEffectivePlanForTransaction('credito', 'd15')).toBe('d15');
      expect(getEffectivePlanForTransaction('credito', 'due_date')).toBe('due_date');
      expect(getEffectivePlanForTransaction('credito', 'ontime')).toBe('ontime');
    });
  });

  describe('calculateCardFee', () => {
    it('calcula taxa de débito standard (0.85%)', () => {
      const calc = calculateCardFee(100.0, 'debito', 1, 'standard');
      expect(calc.feePercent).toBe(0.85);
      expect(calc.feeAmount).toBe(0.85);
      expect(calc.netAmount).toBe(99.15);
      expect(calc.totalInstallments).toBe(1);
    });

    it('calcula taxa de crédito 1x standard (2.89%)', () => {
      const calc = calculateCardFee(120.0, 'credito', 1, 'standard');
      expect(calc.feePercent).toBe(2.89);
      expect(calc.feeAmount).toBe(3.47);
      expect(calc.netAmount).toBe(116.53);
    });

    it('calcula taxa de crédito 3x standard (4.83%)', () => {
      const calc = calculateCardFee(300.0, 'credito', 3, 'standard');
      expect(calc.feePercent).toBe(4.83);
      expect(calc.feeAmount).toBe(14.49);
      expect(calc.netAmount).toBe(285.51);
      expect(calc.installmentAmount).toBe(100.0);
    });

    it('calcula taxa de crédito no plano Due Date com 10% de desconto (2.601%)', () => {
      const calc = calculateCardFee(100.0, 'credito', 1, 'due_date');
      expect(calc.feePercent).toBe(2.601);
      expect(calc.feeAmount).toBe(2.6);
      expect(calc.netAmount).toBe(97.4);
    });

    it('calcula taxa no plano OnTime 1x (5.99%)', () => {
      const calc = calculateCardFee(100.0, 'credito', 1, 'ontime');
      expect(calc.feePercent).toBe(5.99);
      expect(calc.feeAmount).toBe(5.99);
      expect(calc.netAmount).toBe(94.01);
    });
  });
});
