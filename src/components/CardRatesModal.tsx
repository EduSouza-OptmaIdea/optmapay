import React, { useState } from 'react';
import {
  Zap,
  Check,
  Percent,
  Calculator,
  ShieldCheck,
  ArrowRight,
  TrendingUp,
  Info,
  Clock,
  Sparkles,
  Calendar,
  DollarSign,
  Layers,
} from 'lucide-react';
import { SettlementPlanType } from '../types/sandbox';
import {
  STANDARD_FEE_RATES,
  ONTIME_FEE_RATES,
  D7_FEE_RATES,
  D15_FEE_RATES,
  DUE_DATE_FEE_PERCENT,
  calculateCardFee,
  calculateInstallmentsReceivables,
} from '../lib/cardService';

interface CardRatesModalProps {
  currentPlan: SettlementPlanType;
  onPlanChange: (plan: SettlementPlanType) => void;
}

export const CardRatesModal: React.FC<CardRatesModalProps> = ({ currentPlan, onPlanChange }) => {
  const [selectedPlanTab, setSelectedPlanTab] = useState<SettlementPlanType>(currentPlan || 'standard');
  const [calcAmount, setCalcAmount] = useState<number>(1000.0);
  const [calcInstallments, setCalcInstallments] = useState<number>(1);
  const [calcTipo, setCalcTipo] = useState<'debito' | 'credito'>('credito');

  // Simulador de Antecipação no Vencimento
  const [anticipateInstallments, setAnticipateInstallments] = useState<number>(3);
  const [anticipateAmount, setAnticipateAmount] = useState<number>(600.0);

  const activeCalc = calculateCardFee(calcAmount, calcTipo, calcInstallments, currentPlan);
  const selectedTabCalc = calculateCardFee(calcAmount, calcTipo, calcInstallments, selectedPlanTab);
  const anticipationSchedule = calculateInstallmentsReceivables(anticipateAmount, anticipateInstallments);

  const planTabs = [
    { id: 'ontime' as SettlementPlanType, label: '⚡ OnTime (Na Hora)', badge: 'D+0', desc: 'Receba imediatamente na conta' },
    { id: 'standard' as SettlementPlanType, label: 'D+1 Útil (Padrão)', badge: 'D+1', desc: '1 dia útil' },
    { id: 'd7' as SettlementPlanType, label: 'D+7 Útil (-3%)', badge: 'D+7', desc: '3% de desconto sobre o D+1' },
    { id: 'd15' as SettlementPlanType, label: 'D+15 Útil (-5%)', badge: 'D+15', desc: '5% de desconto sobre o D+1' },
    { id: 'due_date' as SettlementPlanType, label: 'No Vencimento (-10%)', badge: '30d / Parcela', desc: '10% de desconto por parcela' },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Plan Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-2xl bg-gradient-to-tr from-[#1367A2]/20 to-[#A63987]/20 text-[#1367A2] dark:text-[#A63987] border border-[#1367A2]/30">
            <Percent className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>Planos de Liquidação & Taxas MDR</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1367A2]/10 text-[#1367A2] dark:text-sky-400 font-extrabold border border-[#1367A2]/20">
                OptmaCard
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Escolha seu plano de recebimento oficial ou simule descontos progressivos por prazo de liquidação.
            </p>
          </div>
        </div>

        {/* Current Active Plan Badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Plano Ativo no Sistema:</span>
          <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#1367A2] to-[#A63987] text-white shadow-md">
            {currentPlan === 'ontime' || currentPlan === 'nitro'
              ? '⚡ OnTime (Na hora)'
              : currentPlan === 'd7'
              ? 'D+7 Útil (-3%)'
              : currentPlan === 'd15'
              ? 'D+15 Útil (-5%)'
              : currentPlan === 'due_date'
              ? 'No Vencimento (-10%)'
              : 'D+1 Padrão'}
          </span>
        </div>
      </div>

      {/* Navegação entre os 5 Planos */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {planTabs.map((p) => {
          const isSelected = selectedPlanTab === p.id;
          const isActive = (currentPlan === p.id) || (p.id === 'standard' && currentPlan === 'd1') || (p.id === 'ontime' && currentPlan === 'nitro');

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPlanTab(p.id)}
              className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                isSelected
                  ? 'bg-gradient-to-br from-[#1367A2]/10 to-[#A63987]/10 border-[#1367A2] ring-2 ring-[#1367A2]/20 shadow-md'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="px-1.5 py-0.5 rounded font-mono text-[9px] font-extrabold bg-slate-100 dark:bg-slate-900 text-[#1367A2] dark:text-sky-400">
                  {p.badge}
                </span>
                {isActive && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Plano Ativo" />
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{p.label}</p>
                <p className="text-[10px] text-slate-400 line-clamp-1">{p.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Detalhamento do Plano Selecionado e Tabela de Taxas */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>Tabela de Taxas: {planTabs.find((p) => p.id === selectedPlanTab)?.label}</span>
            </h3>
            <p className="text-xs text-slate-500">
              {selectedPlanTab === 'ontime'
                ? 'Liquidação instantânea no saldo disponível'
                : selectedPlanTab === 'd7'
                ? 'Recebimento em 7 dias úteis com 3% de desconto sobre todas as taxas'
                : selectedPlanTab === 'd15'
                ? 'Recebimento em 15 dias úteis com 5% de desconto sobre todas as taxas'
                : selectedPlanTab === 'due_date'
                ? 'Recebimento parcelado mensal de 30 em 30 dias com 10% de desconto sobre a taxa de 1x'
                : 'Recebimento em 1 dia útil (plano base oficial)'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onPlanChange(selectedPlanTab)}
            className="py-2.5 px-5 bg-gradient-to-r from-[#1367A2] to-[#A63987] hover:opacity-90 text-white font-bold text-xs rounded-2xl shadow-md transition flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Definir como Meu Plano Ativo</span>
          </button>
        </div>

        {/* Tabela de Taxas por Modalidade e Parcelas */}
        {selectedPlanTab === 'due_date' ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900 text-xs space-y-2">
              <p className="font-bold text-purple-900 dark:text-purple-300">
                Como funciona o Plano Receber no Vencimento:
              </p>
              <ul className="list-disc pl-4 text-[11px] text-purple-800 dark:text-purple-400 space-y-1">
                <li>Cada parcela de Crédito é liberada exatamente a cada 30 dias após a data da venda.</li>
                <li>
                  Taxa com 10% de desconto sobre o Crédito à Vista:{' '}
                  <strong className="font-mono">{DUE_DATE_FEE_PERCENT}%</strong> por parcela (em vez de 2,89%).
                </li>
                <li>
                  <strong className="text-purple-950 dark:text-purple-200">Débito (Sem retenção de 30d):</strong> Transações no Débito são sempre liquidadas no plano <strong>D+1 Padrão (às 06h00, taxa 0,85%)</strong>.
                </li>
                <li>Você pode antecipar parcelas individuais de crédito a qualquer momento com a taxa proporcional aos dias restantes.</li>
              </ul>
            </div>

            {/* Simulador de Antecipação */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#1367A2]" />
                  <span>Simulador de Cronograma de Parcelas & Antecipação Pro-Rata</span>
                </h4>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">Valor Total:</span>
                  <input
                    type="number"
                    value={anticipateAmount}
                    onChange={(e) => setAnticipateAmount(parseFloat(e.target.value) || 0)}
                    className="w-24 px-2 py-1 bg-white dark:bg-slate-800 border rounded-lg text-xs font-mono font-bold"
                  />
                  <select
                    value={anticipateInstallments}
                    onChange={(e) => setAnticipateInstallments(parseInt(e.target.value, 10))}
                    className="px-2 py-1 bg-white dark:bg-slate-800 border rounded-lg text-xs font-bold"
                  >
                    {[2, 3, 4, 5, 6, 10, 12].map((n) => (
                      <option key={n} value={n}>
                        {n}x
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-[10px] text-slate-400">
                      <th className="py-2">Parcela</th>
                      <th className="py-2">Data Vencimento</th>
                      <th className="py-2">Valor Parcela</th>
                      <th className="py-2">Taxa Vencimento (2.601%)</th>
                      <th className="py-2">Líquido no Vencimento</th>
                      <th className="py-2">Taxa Antecipação Pro-Rata</th>
                      <th className="py-2 text-right">Líquido Antecipado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800">
                    {anticipationSchedule.map((p) => (
                      <tr key={p.installmentNumber} className="hover:bg-white dark:hover:bg-slate-800/50">
                        <td className="py-2.5 font-bold text-slate-800 dark:text-slate-200">
                          {p.installmentNumber}/{p.totalInstallments}
                        </td>
                        <td className="py-2.5 text-slate-500">{p.dueDate} ({p.daysRemaining} dias)</td>
                        <td className="py-2.5">R$ {p.grossAmount.toFixed(2)}</td>
                        <td className="py-2.5 text-red-500">-R$ {p.feeAmount.toFixed(2)}</td>
                        <td className="py-2.5 font-bold text-emerald-600">R$ {p.netAmount.toFixed(2)}</td>
                        <td className="py-2.5 text-amber-500">
                          {p.anticipationFeePercent}% (-R$ {p.anticipationFeeAmount?.toFixed(2)})
                        </td>
                        <td className="py-2.5 text-right font-bold text-sky-600">
                          R$ {p.anticipatedNetAmount?.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {[
              { label: 'Débito', key: 'debit', inst: 1, tipo: 'debito' as const },
              { label: 'Crédito à Vista', key: 'credit1x', inst: 1, tipo: 'credito' as const },
              { label: 'Crédito 2x', key: 'credit2x', inst: 2, tipo: 'credito' as const },
              { label: 'Crédito 3x', key: 'credit3x', inst: 3, tipo: 'credito' as const },
              { label: 'Crédito 4x', key: 'credit4x', inst: 4, tipo: 'credito' as const },
              { label: 'Crédito 5x', key: 'credit5x', inst: 5, tipo: 'credito' as const },
              { label: 'Crédito 6x', key: 'credit6x', inst: 6, tipo: 'credito' as const },
              { label: 'Crédito 7x', key: 'credit7x', inst: 7, tipo: 'credito' as const },
              { label: 'Crédito 8x', key: 'credit8x', inst: 8, tipo: 'credito' as const },
              { label: 'Crédito 9x', key: 'credit9x', inst: 9, tipo: 'credito' as const },
              { label: 'Crédito 10x', key: 'credit10x', inst: 10, tipo: 'credito' as const },
              { label: 'Crédito 11x', key: 'credit11x', inst: 11, tipo: 'credito' as const },
              { label: 'Crédito 12x', key: 'credit12x', inst: 12, tipo: 'credito' as const },
            ].map((item) => {
              const calc = calculateCardFee(100, item.tipo, item.inst, selectedPlanTab);
              return (
                <div
                  key={item.label}
                  className="p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 text-center space-y-1"
                >
                  <p className="text-[10px] text-slate-500 font-bold uppercase truncate">{item.label}</p>
                  <p className="text-sm font-mono font-extrabold text-[#1367A2] dark:text-sky-400">
                    {calc.feePercent}%
                  </p>
                  <p className="text-[9px] text-slate-400 font-mono">
                    Líq: R$ {(100 - (100 * calc.feePercent) / 100).toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Calculadora Interativa Geral */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-[#1367A2]" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Calculadora Interativa de Recebimento Líquido
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Valor da Venda (R$):
            </label>
            <input
              type="number"
              step="10"
              value={calcAmount}
              onChange={(e) => setCalcAmount(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Modalidade:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCalcTipo('debito')}
                className={`py-2 rounded-xl text-xs font-bold border transition ${
                  calcTipo === 'debito'
                    ? 'bg-[#1367A2] text-white border-transparent'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                Débito
              </button>
              <button
                type="button"
                onClick={() => setCalcTipo('credito')}
                className={`py-2 rounded-xl text-xs font-bold border transition ${
                  calcTipo === 'credito'
                    ? 'bg-[#A63987] text-white border-transparent'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                Crédito
              </button>
            </div>
          </div>

          {calcTipo === 'credito' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Parcelas:
              </label>
              <select
                value={calcInstallments}
                onChange={(e) => setCalcInstallments(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? '1x (À vista)' : `${n}x`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedPlanTab === 'due_date' && calcTipo === 'debito' && (
            <div className="sm:col-span-3 p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-2xl text-[11px] text-purple-900 dark:text-purple-300 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" />
              <span>
                <strong>Aviso:</strong> No plano <em>No Vencimento</em>, transações no <strong>Débito</strong> não sofrem retenção de 30 dias; elas são sempre liquidadas no plano <strong>D+1 Padrão (às 06h00 com taxa de 0,85%)</strong>.
              </span>
            </div>
          )}
        </div>

        {/* Resultado do Cálculo */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] text-slate-400">Valor Bruto:</p>
            <p className="text-base font-mono font-bold text-slate-800 dark:text-slate-200">
              R$ {calcAmount.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400">Taxa ({selectedTabCalc.feePercent}%):</p>
            <p className="text-base font-mono font-bold text-red-500">
              -R$ {selectedTabCalc.feeAmount.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400">Valor Líquido:</p>
            <p className="text-xl font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
              R$ {selectedTabCalc.netAmount.toFixed(2)}
            </p>
          </div>
          {calcInstallments > 1 && (
            <div>
              <p className="text-[10px] text-slate-400">{calcInstallments}x de:</p>
              <p className="text-base font-mono font-bold text-[#A63987]">
                R$ {selectedTabCalc.installmentAmount.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
