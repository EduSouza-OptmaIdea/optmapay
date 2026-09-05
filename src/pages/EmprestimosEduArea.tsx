import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAppMode, EduLoan } from '../context/AppModeContext';
import {
  Banknote,
  Percent,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  TrendingDown,
  ShieldCheck,
  Zap,
  Clock,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export const EmprestimosEduArea: React.FC = () => {
  const { activeAccount } = useAuth();
  const { loans, applyForLoan, payLoanInstallment, isNegativado, score, renegotiateDebt } = useAppMode();

  // Estados do Simulador
  const [principal, setPrincipal] = useState<number>(300);
  const [installments, setInstallments] = useState<number>(6);
  const [purpose, setPurpose] = useState<string>('Comprar Material Escolar e Livros');
  const [customPurpose, setCustomPurpose] = useState<string>('');

  const [applying, setApplying] = useState(false);
  const [payingLoanId, setPayingLoanId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Taxas
  const consciousRate = 1.5; // 1.5% ao mês (didático consciente)
  const rotativoRate = 14.5; // 14.5% ao mês (cartão de crédito rotativo de mercado)

  // Cálculos do simulador
  const totalWithConsciousInterest = Math.round((principal * (1 + (consciousRate / 100) * installments)) * 100) / 100;
  const installmentConscious = Math.round((totalWithConsciousInterest / installments) * 100) / 100;
  const totalInterestConscious = Math.round((totalWithConsciousInterest - principal) * 100) / 100;

  // Comparativo com rotativo
  const totalRotativo = Math.round((principal * Math.pow(1 + (rotativoRate / 100), installments)) * 100) / 100;
  const rotativoInterest = Math.round((totalRotativo - principal) * 100) / 100;

  const handleApply = async () => {
    if (!activeAccount) return;
    setApplying(true);
    setToastMsg(null);

    const finalPurpose = purpose === 'outro' ? (customPurpose.trim() || 'Despesa Pessoal') : purpose;

    try {
      await applyForLoan(principal, installments, consciousRate, finalPurpose);
      setToastMsg({
        type: 'success',
        text: `Empréstimo de R$ ${principal.toFixed(2)} aprovado e creditado imediatamente na sua conta!`,
      });
      setTimeout(() => setToastMsg(null), 5000);
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err.message || 'Falha ao contratar empréstimo.' });
      setTimeout(() => setToastMsg(null), 5000);
    } finally {
      setApplying(false);
    }
  };

  const handlePayInstallment = async (loan: EduLoan) => {
    setPayingLoanId(loan.id);
    setToastMsg(null);
    try {
      await payLoanInstallment(loan.id);
      setToastMsg({
        type: 'success',
        text: `Parcela quitada com sucesso! Você ganhou +35 pontos no seu Score Consciente.`,
      });
      setTimeout(() => setToastMsg(null), 4000);
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err.message || 'Falha ao quitar parcela.' });
      setTimeout(() => setToastMsg(null), 4000);
    } finally {
      setPayingLoanId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#29324E] via-[#1E293B] to-[#7B2D8E] p-6 rounded-3xl text-white shadow-lg space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/20">
            <Banknote className="w-7 h-7 text-[#FAA832]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold">Empréstimos & Crédito Consciente</h1>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-400/20 text-purple-200 border border-purple-400/30 uppercase">
                Simulador Pedagógico
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Entenda quanto custa o dinheiro no tempo e as armadilhas dos juros altos
            </p>
          </div>
        </div>

        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-xs text-slate-200 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#19A999] shrink-0" />
          <span>
            <strong>Regra Básica de Finanças:</strong> Pegar empréstimo faz você pagar mais caro por algo devido aos juros. Só utilize para investimentos ou imprevistos inadiáveis, e sempre garanta que a parcela cabe no seu orçamento.
          </span>
        </div>
      </div>

      {/* Alerta de Negativação se houver */}
      {isNegativado && (
        <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0" />
            <span>
              <strong>Atenção: Nome no Cadastro Negativo (SPC Didático)!</strong> Suas novas linhas de crédito estão temporariamente bloqueadas devido a pendências financeiras.
            </span>
          </div>
          <button
            type="button"
            onClick={renegotiateDebt}
            className="py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition shrink-0 shadow-sm"
          >
            Fazer Acordo e Limpar Nome (+50 pts)
          </button>
        </div>
      )}

      {/* Notificações Toasts */}
      {toastMsg && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2 animate-fadeIn border ${
            toastMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
          }`}
        >
          {toastMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Grid: Simulador Interativo & Comparador de Juros */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Simulador Interativo */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-5">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#F1613A]" />
            Simulador de Empréstimo Pessoal
          </h2>

          {/* Slider de Valor */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-600 dark:text-slate-300">Quanto você precisa?</span>
              <span className="text-base font-mono font-extrabold text-[#19A999]">
                R$ {principal.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={2500}
              step={50}
              value={principal}
              onChange={(e) => setPrincipal(Number(e.target.value))}
              className="w-full accent-[#19A999] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>R$ 50,00</span>
              <span>R$ 1.250,00</span>
              <span>R$ 2.500,00</span>
            </div>
          </div>

          {/* Slider de Parcelas */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-600 dark:text-slate-300">Em quantas parcelas mensais?</span>
              <span className="text-base font-mono font-extrabold text-slate-900 dark:text-slate-100">
                {installments}x de R$ {installmentConscious.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              value={installments}
              onChange={(e) => setInstallments(Number(e.target.value))}
              className="w-full accent-[#1367A2] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>1x (30 dias)</span>
              <span>6x (Semestre)</span>
              <span>12x (1 ano)</span>
            </div>
          </div>

          {/* Finalidade do Empréstimo */}
          <div className="space-y-1.5 text-xs">
            <label className="font-bold text-slate-700 dark:text-slate-300">Finalidade do Empréstimo</label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="Comprar Material Escolar e Livros">Comprar Material Escolar e Livros</option>
              <option value="Conserto de Equipamento / Computador">Conserto de Equipamento / Computador</option>
              <option value="Investir em um Projeto Escolar / Feira de Ciências">Investir em um Projeto Escolar / Feira de Ciências</option>
              <option value="Imprevisto de Saúde / Familiar">Imprevisto de Saúde / Familiar</option>
              <option value="outro">Outro motivo...</option>
            </select>

            {purpose === 'outro' && (
              <input
                type="text"
                value={customPurpose}
                onChange={(e) => setCustomPurpose(e.target.value)}
                placeholder="Descreva o motivo..."
                className="w-full p-2.5 mt-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            )}
          </div>

          {/* Resumo Financeiro */}
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-700/80 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Valor Liberado na Conta:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                R$ {principal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Taxa Consciente Didática:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                {consciousRate}% ao mês
              </span>
            </div>
            <div className="flex justify-between text-rose-500">
              <span>Total de Juros Pagos ao Banco:</span>
              <span className="font-mono font-bold">+ R$ {totalInterestConscious.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2 text-sm font-extrabold text-slate-900 dark:text-slate-100">
              <span>Custo Total a Pagar ({installments}x):</span>
              <span className="font-mono">R$ {totalWithConsciousInterest.toFixed(2)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleApply}
            disabled={applying || isNegativado}
            className="w-full py-3 px-4 bg-gradient-to-r from-[#19A999] to-teal-600 hover:opacity-95 text-white font-bold text-xs rounded-2xl transition shadow-lg shadow-teal-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {applying ? (
              <span>Contratando e Liberando Saldo...</span>
            ) : (
              <>
                <Banknote className="w-4 h-4" />
                <span>Contratar Empréstimo Consciente</span>
              </>
            )}
          </button>
        </div>

        {/* Comparador Pedagógico: Juros Conscientes vs Rotativo / Cartão */}
        <div className="lg:col-span-5 bg-gradient-to-b from-amber-500/10 via-rose-500/5 to-transparent rounded-3xl border border-amber-500/20 p-6 space-y-4">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <span>O Perigo das Dívidas Caras</span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Veja a diferença brutal se você pegasse esses mesmos <strong>R$ {principal.toFixed(2)}</strong> no Cheque Especial ou no Rotativo do Cartão:
          </p>

          <div className="space-y-3 text-xs">
            {/* Linha Consciente */}
            <div className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-emerald-500/30 space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-bold text-emerald-700 dark:text-emerald-300">
                  Empréstimo Consciente (1.5% a.m.)
                </span>
                <span className="font-mono font-extrabold text-slate-800 dark:text-slate-100">
                  R$ {totalWithConsciousInterest.toFixed(2)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Você paga apenas R$ {totalInterestConscious.toFixed(2)} de juros no total.
              </p>
            </div>

            {/* Linha Rotativo */}
            <div className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-rose-500/30 space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-bold text-rose-700 dark:text-rose-400">
                  Rotativo / Cheque Especial (~14.5% a.m.)
                </span>
                <span className="font-mono font-extrabold text-rose-600">
                  R$ {totalRotativo.toFixed(2)}
                </span>
              </div>
              <p className="text-[11px] text-rose-500">
                Você pagaria <strong>R$ {rotativoInterest.toFixed(2)} só de juros</strong>! Mais que o dobro da dívida original!
              </p>
            </div>
          </div>

          <div className="p-3 bg-white/60 dark:bg-slate-800/60 rounded-2xl text-[11px] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            💡 <strong>Lição de Ouro:</strong> Nunca deixe dívidas acumularem no rotativo do cartão de crédito. Se precisar parcelar, procure sempre opções com juros controlados e planejamento.
          </div>
        </div>
      </div>

      {/* Empréstimos Ativos */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
          Seus Empréstimos Ativos & Histórico
        </h2>

        {loans.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Você não possui nenhum empréstimo ativo no momento. Parabéns pelo uso consciente do dinheiro!
          </div>
        ) : (
          <div className="space-y-3">
            {loans.map((l) => {
              const isPaid = l.status === 'paid';
              return (
                <div
                  key={l.id}
                  className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{l.title}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isPaid
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                        }`}
                      >
                        {isPaid ? 'TOTALMENTE QUITADO' : `PARCELA ${l.installmentsPaid}/${l.installmentsTotal}`}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 font-mono">
                      Parcela: R$ {l.installmentAmount.toFixed(2)}/mês • Próximo Vencimento: {new Date(l.nextDueDate).toLocaleDateString('pt-BR')}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-mono font-extrabold text-sm text-slate-900 dark:text-slate-100">
                        R$ {((l.installmentsTotal - l.installmentsPaid) * l.installmentAmount).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">Saldo Devedor</p>
                    </div>

                    {!isPaid && (
                      <button
                        type="button"
                        onClick={() => handlePayInstallment(l)}
                        disabled={payingLoanId === l.id}
                        className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition shadow-md"
                      >
                        {payingLoanId === l.id ? 'Quitando...' : 'Pagar Parcela (+35 pts)'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
