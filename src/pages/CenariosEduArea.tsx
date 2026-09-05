import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAppMode, EduLifeScenario } from '../context/AppModeContext';
import {
  Compass,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  HelpCircle,
  Award,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Zap,
} from 'lucide-react';

export const CenariosEduArea: React.FC = () => {
  const { scenarios, resolveScenario, score, isNegativado } = useAppMode();
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(scenarios[0]?.id || null);
  const [resolving, setResolving] = useState(false);

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId) || scenarios[0];

  const handleSelectOption = async (optionIndex: number) => {
    if (!activeScenario || activeScenario.resolved) return;
    setResolving(true);
    try {
      await resolveScenario(activeScenario.id, optionIndex);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#29324E] via-[#1E293B] to-[#1367A2] p-6 rounded-3xl text-white shadow-lg space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/20">
            <Compass className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold">Desafios & Cenários da Vida Real</h1>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-teal-400/20 text-teal-300 border border-teal-400/30 uppercase">
                Laboratório de Decisões
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Simule imprevistos, oportunidades e decisões financeiras do cotidiano sem arriscar dinheiro real
            </p>
          </div>
        </div>

        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-xs text-slate-200 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#19A999] shrink-0" />
          <span>
            <strong>Simulador Dinâmico:</strong> Cada decisão tomada altera seu saldo em conta corrente, afeta seu Score Consciente e ensina como agir em situações reais da vida adulta.
          </span>
        </div>
      </div>

      {/* Seletor de Cenários */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {scenarios.map((sc, idx) => (
          <button
            key={sc.id}
            onClick={() => setActiveScenarioId(sc.id)}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 shrink-0 border ${
              activeScenarioId === sc.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-[#19A999] shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800/40 text-slate-500 border-transparent hover:bg-slate-200'
            }`}
          >
            <span>Desafio #{idx + 1}</span>
            {sc.resolved ? (
              <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                Resolvido
              </span>
            ) : (
              <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                Pendente
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Área do Desafio Ativo */}
      {activeScenario && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-6">
          <div className="space-y-2 border-b border-slate-100 dark:border-slate-700 pb-4">
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                  activeScenario.category === 'imprevisto'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                    : activeScenario.category === 'oportunidade'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                }`}
              >
                {activeScenario.category}
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                {activeScenario.title}
              </h2>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {activeScenario.description}
            </p>
          </div>

          {/* Opções de Decisão */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {activeScenario.resolved ? 'Sua Decisão Tomada:' : 'Qual decisão você toma?'}
            </h3>

            <div className="grid grid-cols-1 gap-3">
              {activeScenario.options.map((opt, optIdx) => {
                const isSelected = activeScenario.resolved && activeScenario.selectedOptionIndex === optIdx;

                return (
                  <div
                    key={optIdx}
                    onClick={() => !activeScenario.resolved && !resolving && handleSelectOption(optIdx)}
                    className={`p-5 rounded-2xl border transition text-xs space-y-2 ${
                      activeScenario.resolved
                        ? isSelected
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-500 shadow-sm'
                          : 'bg-slate-50/40 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800 opacity-50'
                        : 'bg-slate-50/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 hover:border-[#19A999] hover:bg-teal-50/30 cursor-pointer'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                            isSelected
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {optIdx + 1}
                        </div>
                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                          {opt.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <span
                          className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded-md ${
                            opt.scoreChange > 0
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          {opt.scoreChange > 0 ? `+${opt.scoreChange}` : opt.scoreChange} pts de Score
                        </span>

                        {opt.amountChange !== 0 && (
                          <span className="font-mono font-bold text-[11px] text-slate-500">
                            {opt.amountChange > 0 ? `+ R$ ${opt.amountChange.toFixed(2)}` : `- R$ ${Math.abs(opt.amountChange).toFixed(2)}`}
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-slate-600 dark:text-slate-300 pl-8 leading-relaxed">
                      {opt.description}
                    </p>

                    {/* Lição de Aprendizado se Resolvido */}
                    {isSelected && (
                      <div className="mt-3 p-3 rounded-xl bg-white dark:bg-slate-800 border border-emerald-500/30 text-[11px] text-emerald-900 dark:text-emerald-200 flex items-start gap-2 animate-fadeIn">
                        <Award className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <strong>Lição Financeira:</strong> {opt.lesson}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
