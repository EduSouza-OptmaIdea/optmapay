import React, { useState, useEffect } from 'react';
import {
  Landmark,
  Percent,
  Clock,
  CreditCard,
  Sliders,
  ShieldCheck,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Calendar,
  Zap,
  DollarSign,
  TrendingDown,
  Building2,
  Check,
} from 'lucide-react';
import {
  BankCoreConfig,
  getBankCoreConfig,
  saveBankCoreConfig,
  resetBankCoreConfig,
} from '../services/bankConfigService';

export const BankParametersArea: React.FC = () => {
  const [config, setConfig] = useState<BankCoreConfig>(getBankCoreConfig());
  const [activeTab, setActiveTab] = useState<'mdr' | 'settlement' | 'institution' | 'limits'>('mdr');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    const handleUpdate = () => setConfig(getBankCoreConfig());
    window.addEventListener('bank-config-updated', handleUpdate);
    return () => window.removeEventListener('bank-config-updated', handleUpdate);
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveBankCoreConfig(config);
    setToastMessage('✅ Parâmetros da Instituição Bancária salvos e aplicados com sucesso!');
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleReset = () => {
    const def = resetBankCoreConfig();
    setConfig(def);
    setShowResetConfirm(false);
    setToastMessage('🔄 Taxas e parâmetros restaurados para os valores padrão de fábrica.');
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Demonstração em tempo real de uma venda de R$ 100
  const simAmount = 100.0;
  const debD1Liq = simAmount - (simAmount * config.mdrRates.debitD1) / 100;
  const debOnTimeLiq = simAmount - (simAmount * config.mdrRates.debitOnTime) / 100;
  const cred1xD1Liq = simAmount - (simAmount * config.mdrRates.credit1xD1) / 100;
  const cred1xOnTimeLiq = simAmount - (simAmount * config.mdrRates.credit1xOnTime) / 100;
  // Simulação de antecipação D+15 (15 dias restantes à taxa mensal configurada)
  const d15MdrRate = config.mdrRates.credit1xD1 * (1 - config.mdrRates.discountD15Percent / 100);
  const d15LiqNormal = simAmount - (simAmount * d15MdrRate) / 100;
  const anticipationProRataRate = (config.mdrRates.anticipationBaseMonthlyRate / 30) * 15;
  const anticipationCost = d15LiqNormal * (anticipationProRataRate / 100);
  const anticipationFinalLiq = d15LiqNormal - anticipationCost;

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-teal-500/40 text-xs font-semibold flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Institucional */}
      <div className="bg-white dark:bg-[#0F172A] p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="p-3.5 bg-gradient-to-tr from-[#1367A2]/20 to-[#A63987]/20 rounded-2xl text-[#1367A2] dark:text-[#A63987] border border-[#1367A2]/30 shrink-0">
            <Landmark className="w-8 h-8" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Parâmetros do Banco (Core Banking)
              </h1>
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase tracking-wide">
                Configuração Institucional
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Área administrativa da instituição bancária. Aqui você calibra as taxas oficiais de maquininha,
              regras de liquidação às <strong>06h00</strong>, prazos D+N, motor de antecipação pro-rata e limites operacionais.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-center">
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="py-2.5 px-4 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar Padrões</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="py-2.5 px-5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#1367A2] to-[#19A999] hover:opacity-95 text-white shadow-lg shadow-[#1367A2]/20 transition flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>Salvar Parâmetros</span>
          </button>
        </div>
      </div>

      {/* Tabs de Navegação */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { id: 'mdr', label: 'Taxas MDR & Maquininha', icon: Percent },
          { id: 'settlement', label: 'Liquidação & Corte 06h', icon: Clock },
          { id: 'institution', label: 'Dados do Banco & BIN', icon: Building2 },
          { id: 'limits', label: 'Limites do Internet Banking', icon: Sliders },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-2.5 px-4 rounded-2xl text-xs font-bold transition ${
                isActive
                  ? 'bg-[#1367A2] text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700/80'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Conteúdo Principal do Painel */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* ========================================================================= */}
        {/* ABA 1: TAXAS MDR & MAQUININHA */}
        {/* ========================================================================= */}
        {activeTab === 'mdr' && (
          <div className="space-y-6">
            {/* Bloco de Débito e Crédito 1x */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
                <div className="flex items-center gap-2">
                  <Percent className="w-5 h-5 text-[#1367A2]" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Taxas Base de Débito e Crédito à Vista
                  </h2>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Referência Oficial</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Débito D+1 */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Débito D+1 (Padrão)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={config.mdrRates.debitD1}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          mdrRates: { ...config.mdrRates, debitD1: parseFloat(e.target.value) || 0 },
                        })
                      }
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-xl text-xs font-mono font-bold pr-8"
                    />
                    <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Liquida no próximo dia útil às 06h00</p>
                </div>

                {/* Débito OnTime */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <span>Débito OnTime (D+0)</span>
                    <Zap className="w-3 h-3 text-amber-500 fill-current" />
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={config.mdrRates.debitOnTime}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          mdrRates: { ...config.mdrRates, debitOnTime: parseFloat(e.target.value) || 0 },
                        })
                      }
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-xl text-xs font-mono font-bold pr-8"
                    />
                    <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Crédito instantâneo no saldo</p>
                </div>

                {/* Crédito 1x D+1 */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Crédito 1x (D+1 Base)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={config.mdrRates.credit1xD1}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          mdrRates: { ...config.mdrRates, credit1xD1: parseFloat(e.target.value) || 0 },
                        })
                      }
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-xl text-xs font-mono font-bold pr-8"
                    />
                    <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Base para cálculo dos prazos D+N</p>
                </div>

                {/* Crédito 1x OnTime */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <span>Crédito 1x OnTime</span>
                    <Zap className="w-3 h-3 text-amber-500 fill-current" />
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={config.mdrRates.credit1xOnTime}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          mdrRates: { ...config.mdrRates, credit1xOnTime: parseFloat(e.target.value) || 0 },
                        })
                      }
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-xl text-xs font-mono font-bold pr-8"
                    />
                    <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Recebimento imediato na conta</p>
                </div>
              </div>
            </div>

            {/* Motor de Antecipação & Descontos Progressivos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Card da Taxa de Antecipação Pro Rata */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
                  <TrendingDown className="w-5 h-5 text-[#F1613A]" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Taxa Mensal Base de Antecipação Pro Rata
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Regra de proteção contra arbitragem financeira
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="relative w-40">
                      <input
                        type="number"
                        step="0.01"
                        value={config.mdrRates.anticipationBaseMonthlyRate}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            mdrRates: {
                              ...config.mdrRates,
                              anticipationBaseMonthlyRate: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border rounded-xl text-sm font-mono font-bold pr-12 text-[#F1613A]"
                      />
                      <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">% a.m.</span>
                    </div>

                    <div className="text-xs text-slate-500">
                      <p>
                        Taxa diária equivalente:{' '}
                        <strong className="font-mono text-slate-800 dark:text-slate-200">
                          {(config.mdrRates.anticipationBaseMonthlyRate / 30).toFixed(4)}% ao dia
                        </strong>
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-amber-500" />
                      Regra de Proteção Ativa:
                    </p>
                    <p className="leading-relaxed">
                      Esta taxa está indexada à taxa do <strong>Crédito 1x OnTime ({config.mdrRates.credit1xOnTime}%)</strong> para garantir que um lojista que venda em D+15 ou D+30 e antecipe não consiga custo inferior ao da venda à vista no OnTime.
                    </p>
                  </div>
                </div>
              </div>

              {/* Card de Descontos por Prazo de Recebimento */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
                  <Calendar className="w-5 h-5 text-purple-500" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Descontos Progressivos por Prazo (D+N)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Desconto concedido sobre a taxa base D+1 para prazos maiores
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                      Plano D+7 Útil
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        value={config.mdrRates.discountD7Percent}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            mdrRates: {
                              ...config.mdrRates,
                              discountD7Percent: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border rounded-lg text-xs font-mono font-bold pr-6"
                      />
                      <span className="absolute right-2 top-1.5 text-[10px] text-slate-400">% desc</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                      Plano D+15 Útil
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        value={config.mdrRates.discountD15Percent}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            mdrRates: {
                              ...config.mdrRates,
                              discountD15Percent: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border rounded-lg text-xs font-mono font-bold pr-6"
                      />
                      <span className="absolute right-2 top-1.5 text-[10px] text-slate-400">% desc</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                      No Vencimento (30d)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        value={config.mdrRates.discountDueDatePercent}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            mdrRates: {
                              ...config.mdrRates,
                              discountDueDatePercent: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border rounded-lg text-xs font-mono font-bold pr-6"
                      />
                      <span className="absolute right-2 top-1.5 text-[10px] text-slate-400">% desc</span>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-slate-400">
                  * No plano <em>No Vencimento</em>, o desconto de 10% aplica-se por parcela mensal. Transações de débito sempre liquidam em D+1.
                </p>
              </div>
            </div>

            {/* Demonstração / Simulador em Tempo Real da Calibração */}
            <div className="bg-gradient-to-br from-slate-900 to-[#1E293B] text-white p-6 rounded-3xl border border-slate-700 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-teal-400" />
                  <h3 className="text-sm font-bold">
                    Simulação em Tempo Real do Impacto Financeiro (Venda Teste: R$ 100,00)
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-slate-400">Calculado com as taxas atuais</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs font-mono">
                <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700">
                  <p className="text-[10px] text-slate-400 font-sans">Débito D+1 ({config.mdrRates.debitD1}%):</p>
                  <p className="text-base font-extrabold text-teal-300 mt-1">R$ {debD1Liq.toFixed(2)}</p>
                  <p className="text-[9px] text-slate-400">Cai no próx. dia útil 06h</p>
                </div>

                <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700">
                  <p className="text-[10px] text-slate-400 font-sans">Débito OnTime ({config.mdrRates.debitOnTime}%):</p>
                  <p className="text-base font-extrabold text-amber-300 mt-1">R$ {debOnTimeLiq.toFixed(2)}</p>
                  <p className="text-[9px] text-slate-400">Cai na hora</p>
                </div>

                <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700">
                  <p className="text-[10px] text-slate-400 font-sans">Crédito 1x D+1 ({config.mdrRates.credit1xD1}%):</p>
                  <p className="text-base font-extrabold text-sky-300 mt-1">R$ {cred1xD1Liq.toFixed(2)}</p>
                  <p className="text-[9px] text-slate-400">Cai no próx. dia útil 06h</p>
                </div>

                <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700">
                  <p className="text-[10px] text-slate-400 font-sans">Crédito 1x OnTime ({config.mdrRates.credit1xOnTime}%):</p>
                  <p className="text-base font-extrabold text-amber-300 mt-1">R$ {cred1xOnTimeLiq.toFixed(2)}</p>
                  <p className="text-[9px] text-slate-400">Cai na hora</p>
                </div>

                <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700 col-span-2 sm:col-span-1">
                  <p className="text-[10px] text-slate-400 font-sans">D+15 Antecipado (15d):</p>
                  <p className="text-base font-extrabold text-emerald-400 mt-1">R$ {anticipationFinalLiq.toFixed(2)}</p>
                  <p className="text-[9px] text-slate-400">Líq. após pro-rata</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA 2: LIQUIDAÇÃO & CORTE 06H */}
        {/* ========================================================================= */}
        {activeTab === 'settlement' && (
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
              <Clock className="w-5 h-5 text-[#1367A2]" />
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Regras de Liquidação Bancária & Horários de Corte
                </h2>
                <p className="text-xs text-slate-500">
                  Parâmetros de processamento diário de compensação no banco sandbox
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    Horário Oficial de Corte da Liquidação Diária:
                  </label>
                  <input
                    type="time"
                    value={config.settlementRules.cutOffHour}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        settlementRules: { ...config.settlementRules, cutOffHour: e.target.value },
                      })
                    }
                    className="px-3 py-2 bg-white dark:bg-slate-800 border rounded-xl text-sm font-mono font-bold"
                  />
                  <p className="text-[11px] text-slate-400">
                    Padrão: <strong>06:00</strong> da manhã. Lançamentos com data de liquidação para o dia tornam-se disponíveis a partir deste horário.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Calendário de Feriados Nacionais Brasileiros
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Posterga liquidações em feriados bancários para o próximo dia útil
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.settlementRules.nationalHolidaysActive}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        settlementRules: {
                          ...config.settlementRules,
                          nationalHolidaysActive: e.target.checked,
                        },
                      })
                    }
                    className="w-5 h-5 accent-[#1367A2] rounded cursor-pointer"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Contagem Regressiva por Dias Corridos
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Exibe D-15, D-14... projetando a liberação no próximo dia útil disponível às 06h
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.settlementRules.calendarDaysCounting}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        settlementRules: {
                          ...config.settlementRules,
                          calendarDaysCounting: e.target.checked,
                        },
                      })
                    }
                    className="w-5 h-5 accent-[#1367A2] rounded cursor-pointer"
                  />
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Auto-Liquidação no Acesso ao Extrato
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Varre lançamentos com data/hora de corte vencida e credita automaticamente no saldo
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.settlementRules.autoSettlementOnStatement}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        settlementRules: {
                          ...config.settlementRules,
                          autoSettlementOnStatement: e.target.checked,
                        },
                      })
                    }
                    className="w-5 h-5 accent-[#1367A2] rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA 3: DADOS DO BANCO & BIN */}
        {/* ========================================================================= */}
        {activeTab === 'institution' && (
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
              <Building2 className="w-5 h-5 text-[#1367A2]" />
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Identidade Institucional & Prefixos de Emissão BIN
                </h2>
                <p className="text-xs text-slate-500">
                  Dados cadastrais da instituição financeira emissora no ambiente sandbox
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Razão Social da Instituição:
                </label>
                <input
                  type="text"
                  value={config.institution.bankName}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      institution: { ...config.institution, bankName: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Código de Compensação / ISPB:
                </label>
                <input
                  type="text"
                  value={config.institution.ispbCode}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      institution: { ...config.institution, ispbCode: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border rounded-xl text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Prefixo BIN - Cartão de Crédito Fictício:
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={config.cardsAndBin.binCredit}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      cardsAndBin: { ...config.cardsAndBin, binCredit: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border rounded-xl text-xs font-mono font-bold"
                />
                <p className="text-[10px] text-slate-400 mt-1">Padrão: 5899 (OptmaCard Sandbox)</p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Prefixo BIN - Cartão de Débito Fictício:
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={config.cardsAndBin.binDebit}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      cardsAndBin: { ...config.cardsAndBin, binDebit: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border rounded-xl text-xs font-mono font-bold"
                />
                <p className="text-[10px] text-slate-400 mt-1">Padrão: 5898 (OptmaCard Débito)</p>
              </div>
            </div>

            <div className="p-4 bg-teal-50 dark:bg-teal-950/30 rounded-2xl border border-teal-200 dark:border-teal-900 text-xs space-y-1">
              <p className="font-bold text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                Blindagem Regulatória Bacen:
              </p>
              <p className="text-teal-800 dark:text-teal-300 leading-relaxed text-[11px]">
                {config.institution.bacenShieldNotice}
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ABA 4: LIMITES DO INTERNET BANKING */}
        {/* ========================================================================= */}
        {activeTab === 'limits' && (
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
              <Sliders className="w-5 h-5 text-[#1367A2]" />
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Limites e Parâmetros Operacionais do Internet Banking
                </h2>
                <p className="text-xs text-slate-500">
                  Limites para transferências Pix e emissão de boletos simulados
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Limite Diário Pix (R$):
                </label>
                <input
                  type="number"
                  step="1000"
                  value={config.internetBankingLimits.pixDailyLimit}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      internetBankingLimits: {
                        ...config.internetBankingLimits,
                        pixDailyLimit: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-xl text-xs font-mono font-bold"
                />
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Limite por Transação Pix (R$):
                </label>
                <input
                  type="number"
                  step="500"
                  value={config.internetBankingLimits.pixTransactionLimit}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      internetBankingLimits: {
                        ...config.internetBankingLimits,
                        pixTransactionLimit: parseFloat(e.target.value) || 0,
                      },
                    })
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-xl text-xs font-mono font-bold"
                />
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Prazo de Compensação Boleto (dias úteis):
                </label>
                <input
                  type="number"
                  min="1"
                  max="3"
                  value={config.internetBankingLimits.boletoCompensationDays}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      internetBankingLimits: {
                        ...config.internetBankingLimits,
                        boletoCompensationDays: parseInt(e.target.value, 10) || 1,
                      },
                    })
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border rounded-xl text-xs font-mono font-bold"
                />
              </div>
            </div>
          </div>
        )}

        {/* Botão de Salvar no Rodapé */}
        <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-xs text-slate-400">
            Última alteração salva em:{' '}
            <strong className="font-mono text-slate-700 dark:text-slate-300">
              {new Date(config.lastUpdatedAt).toLocaleString('pt-BR')}
            </strong>
          </p>

          <button
            type="submit"
            className="py-2.5 px-6 rounded-2xl text-xs font-bold bg-gradient-to-r from-[#1367A2] to-[#19A999] hover:opacity-95 text-white shadow-md flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Salvar Parâmetros do Banco</span>
          </button>
        </div>
      </form>

      {/* Modal de Confirmação para Restaurar Padrões */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
              <RotateCcw className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Restaurar Taxas Padrão?
              </h3>
              <p className="text-xs text-slate-500">
                Isso redefinirá todas as taxas MDR (Débito D+1 0,85%, OnTime 1,99%, Crédito OnTime 5,99%, etc.) para as taxas padrão oficiais do OptmaPay.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-md"
              >
                Confirmar Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
