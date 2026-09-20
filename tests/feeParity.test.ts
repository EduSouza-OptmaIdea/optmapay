import { describe, it, expect } from 'vitest';
import {
  calculateCardFee,
  STANDARD_FEE_RATES,
  D7_FEE_RATES,
  D15_FEE_RATES,
  ONTIME_FEE_RATES,
  DUE_DATE_FEE_PERCENT,
  SettlementPlanType,
} from '../src/lib/cardRules';

/**
 * Simula a regra exata e autoritativa implementada no PostgreSQL na migration 01B
 */
function sqlMdrFeeCalculation(
  amount: number,
  tipo: 'debito' | 'credito',
  installments: number,
  plan: string
): { feePercent: number; feeAmount: number; netAmount: number } {
  const v_gross_amount = Math.round(amount * 100) / 100;
  let v_fee_percent = 0;
  let v_effective_plan = plan;

  if (tipo === 'debito') {
    if (plan === 'ontime' || plan === 'nitro') {
      v_effective_plan = 'ontime';
      v_fee_percent = 1.99;
    } else {
      v_effective_plan = 'standard';
      v_fee_percent = 0.85;
    }
  } else {
    // Crédito
    v_effective_plan = plan || 'standard';
    if (v_effective_plan === 'due_date') {
      v_fee_percent = 2.601;
    } else if (v_effective_plan === 'ontime' || v_effective_plan === 'nitro') {
      const ontimeMap: Record<number, number> = {
        1: 5.99, 2: 11.39, 3: 12.49, 4: 13.09, 5: 13.79, 6: 14.49,
        7: 15.49, 8: 16.09, 9: 16.69, 10: 17.39, 11: 18.39, 12: 18.79
      };
      v_fee_percent = ontimeMap[installments] || 5.99;
    } else if (v_effective_plan === 'd7') {
      const d7Map: Record<number, number> = {
        1: 2.8033, 2: 4.0934, 3: 4.6851, 4: 5.2768, 5: 5.8685, 6: 6.4408,
        7: 7.0228, 8: 7.5854, 9: 8.1577, 10: 8.7106, 11: 9.2732, 12: 9.8164
      };
      v_fee_percent = d7Map[installments] || 2.8033;
    } else if (v_effective_plan === 'd15') {
      const d15Map: Record<number, number> = {
        1: 2.7455, 2: 4.0090, 3: 4.5885, 4: 5.1680, 5: 5.7475, 6: 6.3080,
        7: 6.8780, 8: 7.4290, 9: 7.9895, 10: 8.5310, 11: 9.0820, 12: 9.6140
      };
      v_fee_percent = d15Map[installments] || 2.7455;
    } else {
      // Standard D+1
      const standardMap: Record<number, number> = {
        1: 2.89, 2: 4.22, 3: 4.83, 4: 5.44, 5: 6.05, 6: 6.64,
        7: 7.24, 8: 7.82, 9: 8.41, 10: 8.98, 11: 9.56, 12: 10.12
      };
      v_fee_percent = standardMap[installments] || 2.89;
    }
  }

  const v_fee_amount = Math.round((v_gross_amount * (v_fee_percent / 100)) * 100) / 100;
  const v_net_amount = Math.max(0, Math.round((v_gross_amount - v_fee_amount) * 100) / 100);

  return { feePercent: v_fee_percent, feeAmount: v_fee_amount, netAmount: v_net_amount };
}

describe('MDR Fee Parity Tests: cardRules.ts vs PostgreSQL Engine', () => {
  const plans: SettlementPlanType[] = ['standard', 'd7', 'd15', 'ontime', 'due_date'];
  const testAmounts = [10.0, 99.99, 250.5, 1250.0, 5000.0];

  describe('Paridade de Débito em todos os planos', () => {
    plans.forEach((plan) => {
      testAmounts.forEach((amount) => {
        it(`débito R$ ${amount} no plano ${plan}`, () => {
          const jsCalc = calculateCardFee(amount, 'debito', 1, plan);
          const sqlCalc = sqlMdrFeeCalculation(amount, 'debito', 1, plan);

          expect(jsCalc.feePercent).toBe(sqlCalc.feePercent);
          expect(jsCalc.feeAmount).toBe(sqlCalc.feeAmount);
          expect(jsCalc.netAmount).toBe(sqlCalc.netAmount);
          expect(jsCalc.netAmount).toBeLessThanOrEqual(amount);
        });
      });
    });
  });

  describe('Paridade de Crédito em todos os planos (1x a 12x)', () => {
    plans.forEach((plan) => {
      for (let installments = 1; installments <= 12; installments++) {
        it(`crédito ${installments}x no plano ${plan} (R$ 100,00)`, () => {
          const amount = 100.0;
          const jsCalc = calculateCardFee(amount, 'credito', installments, plan);
          const sqlCalc = sqlMdrFeeCalculation(amount, 'credito', installments, plan);

          expect(jsCalc.feePercent).toBe(sqlCalc.feePercent);
          expect(jsCalc.feeAmount).toBe(sqlCalc.feeAmount);
          expect(jsCalc.netAmount).toBe(sqlCalc.netAmount);
          expect(jsCalc.netAmount).toBeLessThanOrEqual(amount);
        });
      }
    });
  });
});
