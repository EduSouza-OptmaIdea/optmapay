import React, { useState } from 'react';
import {
  X,
  Zap,
  Lock,
  Calendar,
  Clock,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import {
  calculateAnticipationProRata,
  getSettlementCountdown,
  SettlementPlan,
  AnticipationCalculationResult,
} from '../lib/businessDays';

interface AnticipationSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  externalReference?: string;
  grossAmount: number;
  saleDate: string | Date;
  settlementPlan?: SettlementPlan | number;
  expectedPin?: string; // PIN da conta ou cartão (fallback 1234)
  onConfirmAnticipation: (result: AnticipationCalculationResult) => Promise<void>;
}

export const AnticipationSimulationModal: React.FC<AnticipationSimulationModalProps> = ({
  isOpen,
  onClose,
  title,
  externalReference,
  grossAmount,
  saleDate,
  settlementPlan = 'standard',
  expectedPin = '1234',
  onConfirmAnticipation,
}) => {
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [calcResult, setCalcResult] = useState<AnticipationCalculationResult | null>(null);

  if (!isOpen) return null;

  // Calcula a contagem regressiva e data prevista às 06:00
  const countdown = getSettlementCountdown(saleDate, settlementPlan);

  // Calcula a simulação pro-rata (taxa mensal padrão 5.99% a.m., equivalente ao Crédito 1x OnTime para evitar arbitragem) baseada nos dias corridos
  const calculation = calculateAnticipationProRata(
    grossAmount,
    countdown.daysRemaining,
    5.99,
    countdown.targetDateFormatted
  );

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
    setPin(val);
    setErrorMsg(null);
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (pin.length !== 4) {
      setErrorMsg('Digite a senha (PIN) de 4 dígitos para autorizar a antecipação.');
      return;
    }

    // Valida PIN (aceita o expectedPin ou o default '1234' no sandbox)
    const validPins = [expectedPin, '1234'].filter(Boolean);
    if (!validPins.includes(pin)) {
      setErrorMsg('Senha (PIN) incorreta. Verifique os 4 dígitos e tente novamente.');
      return;
    }

    setIsProcessing(true);
    try {
      await onConfirmAnticipation(calculation);
      setCalcResult(calculation);
      setIsSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao processar antecipação.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleModalClose = () => {
    setPin('');
    setErrorMsg(null);
    setIsSuccess(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#0F172A] w-full max-w-xl rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        
        {/* Top Header */}
        <div className="bg-gradient-to-r from-[#29324E] via-[#1E293B] to-[#1367A2] p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30">
              <Zap className="w-6 h-6 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg">Simulação de Antecipação</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 uppercase">
                  Pro Rata Die
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Receba o saldo antecipadamente com taxa proporcional aos dias restantes
              </p>
            </div>
          </div>

          <button
            onClick={handleModalClose}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
          {isSuccess && calcResult ? (
            /* Tela de Sucesso */
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Antecipação Concluída com Sucesso!
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  O valor líquido de{' '}
                  <strong className="text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                    R$ {calcResult.netAnticipatedAmount.toFixed(2)}
                  </strong>{' '}
                  foi creditado imediatamente no seu saldo disponível em conta.
                </p>
              </div>

              {/* Comprovante resumido */}
              <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 text-left text-xs font-mono space-y-2">
                <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                  <span className="text-slate-500">Transação / Referência:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{externalReference || 'VENDA-ANT'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                  <span className="text-slate-500">Valor Bruto Original:</span>
                  <span className="text-slate-700 dark:text-slate-300">R$ {calcResult.grossAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-2 text-rose-500">
                  <span>Custo Desconto Antecipação ({calcResult.proRataFeePercent.toFixed(2)}%):</span>
                  <span>- R$ {calcResult.anticipationFeeAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  <span>Líquido Creditado em Conta:</span>
                  <span>R$ {calcResult.netAnticipatedAmount.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={handleModalClose}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition shadow-lg shadow-emerald-900/20 text-xs"
              >
                Concluir e Voltar ao Extrato
              </button>
            </div>
          ) : (
            /* Formulário de Simulação */
            <>
              {/* Card de Identificação */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Item a Antecipar</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</p>
                  {externalReference && (
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">Ref: {externalReference}</p>
                  )}
                </div>

                <div className="text-right">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Valor Nominal</p>
                  <p className="text-base font-extrabold text-slate-900 dark:text-slate-100 font-mono">
                    R$ {grossAmount.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Cronograma e Regras de Liquidação (06:00 e Dias Restantes) */}
              <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-indigo-500" />
                    Liquidação Oficial Programada
                  </span>

                  {/* Badge Regressivo */}
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-extrabold border ${countdown.badgeColorClass} shadow-sm`}
                  >
                    {countdown.badgeText}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900">
                    <p className="text-[10px] text-slate-400">Previsão Normal (às 06:00)</p>
                    <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {countdown.targetDateFormatted}
                    </p>
                  </div>
                  <div className="bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900">
                    <p className="text-[10px] text-slate-400">Tempo até a Liberação</p>
                    <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                      {countdown.daysRemaining} dia(s) corrido(s)
                    </p>
                  </div>
                </div>

                <p className="text-[11px] text-indigo-700/90 dark:text-indigo-300/80 leading-relaxed">
                  Os valores caem automaticamente no próximo dia útil bancário a partir das <strong>06h00</strong>. Ao antecipar, você recebe o crédito líquido na hora.
                </p>
              </div>

              {/* Demonstração do Cálculo Pro Rata */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingDown className="w-4 h-4 text-[#F1613A]" />
                  Detalhamento Financeiro Pro Rata
                </h4>

                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 divide-y divide-slate-100 dark:divide-slate-700 text-xs">
                  <div className="flex justify-between py-2">
                    <span className="text-slate-500">Valor Bruto da Venda:</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      R$ {calculation.grossAmount.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between py-2">
                    <span className="text-slate-500">Taxa Mensal Base:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {calculation.monthlyFeePercent.toFixed(2)}% a.m.
                    </span>
                  </div>

                  <div className="flex justify-between py-2">
                    <span className="text-slate-500">
                      Taxa Pro Rata ({calculation.daysRemaining} dia(s) até vencimento):
                    </span>
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                      {calculation.proRataFeePercent.toFixed(2)}%
                    </span>
                  </div>

                  <div className="flex justify-between py-2 text-rose-600 dark:text-rose-400">
                    <span className="font-semibold">Custo de Desconto da Antecipação:</span>
                    <span className="font-mono font-bold">
                      - R$ {calculation.anticipationFeeAmount.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between pt-3 text-sm font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 -mx-4 -mb-4 p-4 rounded-b-2xl">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-4 h-4" />
                      Valor Líquido a Receber AGORA:
                    </span>
                    <span className="font-mono text-base">
                      R$ {calculation.netAnticipatedAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Formulário de Autorização com Senha (PIN 4 Dígitos) */}
              <form onSubmit={handleConfirm} className="space-y-4 pt-2">
                <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-[#19A999]" />
                      Autorização com Senha (PIN de 4 dígitos da conta)
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Dica Sandbox: {expectedPin || '1234'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={pin}
                      onChange={handlePinChange}
                      placeholder="••••"
                      className="w-32 text-center tracking-[0.6em] text-lg font-mono font-bold px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#19A999]"
                    />
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight flex-1">
                      Digite seu PIN transacional para confirmar a antecipação imediata e liberar o saldo em conta.
                    </div>
                  </div>

                  {errorMsg && (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleModalClose}
                    className="w-1/3 py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={isProcessing || pin.length !== 4}
                    className="w-2/3 py-3 px-4 rounded-2xl bg-gradient-to-r from-[#F1613A] to-amber-600 hover:opacity-95 text-white font-bold text-xs transition shadow-lg shadow-orange-950/20 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <span>Processando Antecipação...</span>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Confirmar e Antecipar Agora</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
