import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAppMode, CofrinhoGoal } from '../context/AppModeContext';
import {
  PiggyBank,
  TrendingUp,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
  ShieldCheck,
  Target,
  CheckCircle2,
  DollarSign,
  Clock,
  X,
  AlertCircle,
} from 'lucide-react';

export const InvestimentosEduArea: React.FC = () => {
  const { activeAccount } = useAuth();
  const { cofrinhos, createCofrinho, depositToCofrinho, withdrawFromCofrinho } = useAppMode();

  // Estados dos Modais
  const [selectedCofrinho, setSelectedCofrinho] = useState<CofrinhoGoal | null>(null);
  const [modalAction, setModalAction] = useState<'deposit' | 'withdraw' | null>(null);
  const [actionAmount, setActionAmount] = useState('50');

  // Modal de Criação de Cofrinho
  const [isNewCofrinhoOpen, setIsNewCofrinhoOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTarget, setNewTarget] = useState('500');
  const [newIcon, setNewIcon] = useState('🎯');

  // Simulador de Juros Compostos
  const [initialDeposit, setInitialDeposit] = useState<number>(200);
  const [monthlyContribution, setMonthlyContribution] = useState<number>(50);
  const [months, setMonths] = useState<number>(24);

  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Cálculos de Juros Compostos
  // 1. Colchão (sem rendimento)
  const totalColchao = initialDeposit + monthlyContribution * months;

  // 2. Poupança (0.5% a.m.)
  const ratePoupanca = 0.005;
  let totalPoupanca = initialDeposit;
  for (let m = 1; m <= months; m++) {
    totalPoupanca = (totalPoupanca + monthlyContribution) * (1 + ratePoupanca);
  }
  const yieldPoupanca = Math.max(0, totalPoupanca - totalColchao);

  // 3. CDB Didático (1.0% a.m.)
  const rateCdb = 0.01;
  let totalCdb = initialDeposit;
  for (let m = 1; m <= months; m++) {
    totalCdb = (totalCdb + monthlyContribution) * (1 + rateCdb);
  }
  const yieldCdb = Math.max(0, totalCdb - totalColchao);

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCofrinho) return;
    const val = parseFloat(actionAmount);
    if (isNaN(val) || val <= 0) return;

    setIsProcessing(true);
    setToastMsg(null);
    try {
      if (modalAction === 'deposit') {
        await depositToCofrinho(selectedCofrinho.id, val);
        setToastMsg({
          type: 'success',
          text: `R$ ${val.toFixed(2)} guardados com sucesso no cofrinho "${selectedCofrinho.title}"! (+20 pts de Score)`,
        });
      } else if (modalAction === 'withdraw') {
        await withdrawFromCofrinho(selectedCofrinho.id, val);
        setToastMsg({
          type: 'success',
          text: `R$ ${val.toFixed(2)} resgatados com sucesso para a sua Conta Corrente!`,
        });
      }
      setModalAction(null);
      setSelectedCofrinho(null);
      setActionAmount('50');
      setTimeout(() => setToastMsg(null), 4000);
    } catch (err: any) {
      setToastMsg({ type: 'error', text: err.message || 'Erro ao processar transação no cofrinho.' });
      setTimeout(() => setToastMsg(null), 4000);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseFloat(newTarget);
    if (!newTitle.trim() || isNaN(target) || target <= 0) return;

    createCofrinho(newTitle.trim(), target, newIcon);
    setIsNewCofrinhoOpen(false);
    setNewTitle('');
    setNewTarget('500');
    setToastMsg({
      type: 'success',
      text: `Meta de poupança criada com sucesso! Mantenha a disciplina para alcançar seu sonho.`,
    });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const totalSavedInCofrinhos = cofrinhos.reduce((acc, c) => acc + c.currentAmount, 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#29324E] via-[#1E293B] to-[#19A999] p-6 rounded-3xl text-white shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/20">
              <PiggyBank className="w-7 h-7 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold">Poupança & Cofrinhos dos Sonhos</h1>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-teal-400/20 text-teal-300 border border-teal-400/30">
                  Educação Financeira
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Crie metas, guarde economias e veja a mágica dos juros compostos trabalhando para você!
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsNewCofrinhoOpen(true)}
            className="self-start sm:self-auto py-2.5 px-4 bg-[#F1613A] hover:bg-[#d9522e] text-white font-bold text-xs rounded-2xl transition shadow-md flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Nova Meta</span>
          </button>
        </div>

        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-xs text-slate-200 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Lição de Ouro:</strong> "Juros compostos são a oitava maravilha do mundo. Aquele que entende, ganha; aquele que não entende, paga." Guardar pequenos valores todo mês cria grandes patrimônios no futuro.
          </span>
        </div>
      </div>

      {/* Toast */}
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
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Total Guardado Card */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase">Total Guardado em Metas & Poupança</p>
          <p className="text-2xl sm:text-3xl font-extrabold font-mono text-[#19A999] mt-1">
            R$ {totalSavedInCofrinhos.toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Distribuído em {cofrinhos.length} meta(s) de longo prazo
          </p>
        </div>

        <div className="bg-teal-50 dark:bg-teal-950/40 p-3.5 rounded-2xl border border-teal-200 dark:border-teal-800 text-xs text-teal-900 dark:text-teal-200 max-w-sm">
          💡 O dinheiro guardado no cofrinho fica protegido contra gastos impulsivos e rende rendimentos fictícios todo ciclo!
        </div>
      </div>

      {/* Grid de Cofrinhos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cofrinhos.map((cof) => {
          const progress = Math.min(100, Math.round((cof.currentAmount / cof.targetAmount) * 100));

          return (
            <div
              key={cof.id}
              className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-2xl">
                    {cof.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">{cof.title}</h3>
                    <p className="text-[11px] text-slate-400 font-medium">{cof.category}</p>
                  </div>
                </div>

                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
                  {progress}%
                </span>
              </div>

              {/* Barra de Progresso */}
              <div className="space-y-1">
                <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#19A999] to-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] font-mono text-slate-500">
                  <span>Guardado: R$ {cof.currentAmount.toFixed(2)}</span>
                  <span>Meta: R$ {cof.targetAmount.toFixed(2)}</span>
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCofrinho(cof);
                    setModalAction('deposit');
                  }}
                  className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1 shadow-sm"
                >
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  <span>Guardar (+20 pts)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedCofrinho(cof);
                    setModalAction('withdraw');
                  }}
                  disabled={cof.currentAmount <= 0}
                  className="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1 disabled:opacity-40"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Resgatar p/ Conta</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Simulador Interativo dos Juros Compostos ("A Mágica do Dinheiro") */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#19A999]" />
            Simulador Didático: A Mágica dos Juros Compostos
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Veja a diferença entre deixar o dinheiro parado e investir na poupança ou em títulos remunerados
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Aporte Inicial (R$)</label>
            <input
              type="number"
              value={initialDeposit}
              onChange={(e) => setInitialDeposit(Math.max(0, Number(e.target.value)))}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Aporte Mensal Todo Mês (R$)</label>
            <input
              type="number"
              value={monthlyContribution}
              onChange={(e) => setMonthlyContribution(Math.max(0, Number(e.target.value)))}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Tempo (Meses)</label>
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
            >
              <option value={6}>6 meses (Semestre)</option>
              <option value={12}>12 meses (1 ano)</option>
              <option value={24}>24 meses (2 anos)</option>
              <option value={36}>36 meses (3 anos)</option>
            </select>
          </div>
        </div>

        {/* Comparativo em Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {/* Debaixo do Colchão */}
          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-600 dark:text-slate-300">Debaixo do Colchão</span>
              <span className="text-[10px] text-slate-400">0% a.m.</span>
            </div>
            <p className="text-xl font-extrabold font-mono text-slate-800 dark:text-slate-200">
              R$ {totalColchao.toFixed(2)}
            </p>
            <p className="text-[11px] text-slate-500">
              Você só tem o que guardou. O dinheiro não rendeu nada e perdeu valor para a inflação.
            </p>
          </div>

          {/* Poupança */}
          <div className="bg-emerald-50/60 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-300 dark:border-emerald-800/60 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-emerald-800 dark:text-emerald-300">Poupança Didática</span>
              <span className="text-[10px] text-emerald-600 font-bold font-mono">0.5% a.m.</span>
            </div>
            <p className="text-xl font-extrabold font-mono text-emerald-700 dark:text-emerald-300">
              R$ {totalPoupanca.toFixed(2)}
            </p>
            <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
              + <strong>R$ {yieldPoupanca.toFixed(2)} de rendimento</strong> gerados sozinhos pelo banco!
            </p>
          </div>

          {/* CDB / Tesouro Didático */}
          <div className="bg-purple-50/60 dark:bg-purple-950/30 p-4 rounded-2xl border border-purple-300 dark:border-purple-800/60 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-purple-800 dark:text-purple-300">CDB / Aplicação Didática</span>
              <span className="text-[10px] text-purple-600 font-bold font-mono">1.0% a.m.</span>
            </div>
            <p className="text-xl font-extrabold font-mono text-purple-700 dark:text-purple-300">
              R$ {totalCdb.toFixed(2)}
            </p>
            <p className="text-[11px] text-purple-800 dark:text-purple-300">
              + <strong>R$ {yieldCdb.toFixed(2)} de lucro puro</strong>! O poder dos juros compostos multiplicando seu esforço!
            </p>
          </div>
        </div>
      </div>

      {/* Modal de Guardar / Resgatar */}
      {selectedCofrinho && modalAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-[#0F172A] w-full max-w-sm rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {modalAction === 'deposit' ? 'Guardar no Cofrinho' : 'Resgatar para Conta Corrente'}
              </h3>
              <button
                onClick={() => setModalAction(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAction} className="space-y-4 text-xs">
              <div>
                <p className="text-slate-500 mb-1">Meta selecionada: <strong>{selectedCofrinho.title}</strong></p>
                <p className="text-[11px] text-slate-400 font-mono">
                  Saldo atual no cofrinho: R$ {selectedCofrinho.currentAmount.toFixed(2)}
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Valor a {modalAction === 'deposit' ? 'Guardar' : 'Resgatar'} (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm"
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalAction(null)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 py-2.5 bg-[#19A999] hover:bg-teal-600 text-white font-bold rounded-xl shadow-md disabled:opacity-50"
                >
                  {isProcessing ? 'Processando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Criação de Cofrinho */}
      {isNewCofrinhoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-[#0F172A] w-full max-w-sm rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#F1613A]" />
                Nova Meta de Poupança
              </h3>
              <button
                onClick={() => setIsNewCofrinhoOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Qual é o seu objetivo?
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Videogame, Viagem Escolar, Celular"
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Valor da Meta (R$)
                </label>
                <input
                  type="number"
                  step="1"
                  min="10"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Ícone Representativo
                </label>
                <div className="flex gap-2 text-xl bg-slate-50 dark:bg-slate-900 p-2 rounded-xl">
                  {['🚲', '🎮', '🛡️', '📚', '🚀', '🎸', '⚽'].map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setNewIcon(icon)}
                      className={`p-1.5 rounded-lg transition ${newIcon === icon ? 'bg-white dark:bg-slate-800 shadow-md scale-110' : 'opacity-60'}`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewCofrinhoOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#F1613A] hover:bg-[#d9522e] text-white font-bold rounded-xl shadow-md"
                >
                  Criar Meta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
