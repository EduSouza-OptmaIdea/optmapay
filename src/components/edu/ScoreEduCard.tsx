import React from 'react';
import { useAppMode } from '../../context/AppModeContext';
import { ShieldCheck, ShieldAlert, TrendingUp, TrendingDown, Award, HelpCircle } from 'lucide-react';

export const ScoreEduCard: React.FC = () => {
  const { score, isNegativado, scoreHistory, renegotiateDebt } = useAppMode();

  const getScoreColor = () => {
    if (score >= 700) return 'text-emerald-500';
    if (score >= 500) return 'text-amber-500';
    return 'text-rose-500';
  };

  const getScoreStatusText = () => {
    if (score >= 800) return 'Excelente Pontualidade';
    if (score >= 700) return 'Bom Pagador';
    if (score >= 500) return 'Atenção com Prazos';
    return 'Risco de Inadimplência';
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-[#19A999]" />
          <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
            Score Consciente OptmaPay
          </h3>
        </div>

        <span
          className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase border ${
            isNegativado
              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-300 dark:border-rose-800'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
          }`}
        >
          {isNegativado ? '⚠️ NEGATIVADO NO SPC DIDÁTICO' : '✅ SITUAÇÃO REGULAR'}
        </span>
      </div>

      {/* Pontômetro */}
      <div className="flex flex-col sm:flex-row items-center gap-6 bg-slate-50 dark:bg-slate-900/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700">
        <div className="text-center sm:text-left">
          <p className="text-[11px] font-bold text-slate-400 uppercase">Sua Pontuação Atual</p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className={`text-4xl font-black font-mono tracking-tight ${getScoreColor()}`}>
              {score}
            </span>
            <span className="text-xs text-slate-400 font-mono">/ 1000 pts</span>
          </div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">
            {getScoreStatusText()}
          </p>
        </div>

        {/* Barra de Score */}
        <div className="flex-1 w-full space-y-1.5">
          <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
            <div className="w-[45%] h-full bg-rose-500" />
            <div className="w-[25%] h-full bg-amber-500" />
            <div className="w-[30%] h-full bg-emerald-500" />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>0 (Crítico)</span>
            <span>500 (Médio)</span>
            <span>1000 (Excelente)</span>
          </div>
        </div>
      </div>

      {isNegativado && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs space-y-2">
          <p className="font-bold flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            O que significa estar com o nome negativado no simulador?
          </p>
          <p className="text-[11px] leading-relaxed">
            Assim como na vida real no Serasa/SPC, quando contas vencem há mais de 7 dias ou você deixa de pagar dívidas, o banco bloqueia novos cartões e empréstimos até que você renegocie.
          </p>
          <button
            onClick={renegotiateDebt}
            className="mt-1 py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition shadow-sm"
          >
            Fazer Acordo de Regularização (+50 pts)
          </button>
        </div>
      )}

      {/* Histórico recente */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Histórico de Hábitos Financeiros
        </p>

        <div className="divide-y divide-slate-100 dark:divide-slate-700 text-xs">
          {scoreHistory.slice(0, 4).map((item) => (
            <div key={item.id} className="py-2.5 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="font-semibold text-slate-800 dark:text-slate-200">{item.description}</p>
                <p className="text-[10px] text-slate-400 font-mono">{item.date}</p>
              </div>

              <span
                className={`font-mono font-bold ${
                  item.points > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {item.points > 0 ? `+${item.points}` : item.points} pts
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
