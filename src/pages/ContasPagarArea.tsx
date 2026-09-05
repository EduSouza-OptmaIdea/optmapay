import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAppMode, EduBill } from '../context/AppModeContext';
import {
  FileText,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Droplets,
  Wifi,
  Home,
  GraduationCap,
  HelpCircle,
  Copy,
  Check,
  TrendingUp,
  CreditCard,
  Calendar,
  DollarSign,
  ShieldCheck,
  X,
} from 'lucide-react';

export const ContasPagarArea: React.FC = () => {
  const { activeAccount } = useAuth();
  const { bills, payBill, addBill, score, isNegativado } = useAppMode();

  const [filter, setFilter] = useState<'all' | 'pending' | 'overdue' | 'paid'>('all');
  const [payingBillId, setPayingBillId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // Modal de Nova Conta
  const [isNewBillModalOpen, setIsNewBillModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<EduBill['category']>('energia');
  const [newAmount, setNewAmount] = useState('75.00');
  const [newDueDate, setNewDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });

  const getCategoryIcon = (category: EduBill['category']) => {
    switch (category) {
      case 'energia':
        return <Zap className="w-5 h-5 text-amber-500" />;
      case 'agua':
        return <Droplets className="w-5 h-5 text-sky-500" />;
      case 'internet':
        return <Wifi className="w-5 h-5 text-indigo-500" />;
      case 'moradia':
        return <Home className="w-5 h-5 text-teal-500" />;
      case 'educacao':
        return <GraduationCap className="w-5 h-5 text-purple-500" />;
      default:
        return <FileText className="w-5 h-5 text-slate-500" />;
    }
  };

  const handleCopyLinha = (id: string, linha: string) => {
    navigator.clipboard.writeText(linha);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handlePay = async (bill: EduBill) => {
    setPayingBillId(bill.id);
    setErrorToast(null);
    try {
      await payBill(bill.id);
      setSuccessToast(`Conta "${bill.title}" quitada com sucesso! +25 pontos no seu Score Consciente.`);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      setErrorToast(err.message || 'Falha ao pagar conta.');
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setPayingBillId(null);
    }
  };

  const handleCreateBill = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(newAmount);
    if (!newTitle.trim() || isNaN(val) || val <= 0) return;

    addBill({
      title: newTitle.trim(),
      category: newCategory,
      amount: val,
      dueDate: newDueDate,
    });

    setIsNewBillModalOpen(false);
    setNewTitle('');
    setNewAmount('75.00');
    setSuccessToast('Nova conta cadastrada no seu plano de contas a pagar!');
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // Métricas
  const totalPending = bills
    .filter((b) => b.status !== 'paid')
    .reduce((acc, b) => acc + b.amount, 0);

  const overdueCount = bills.filter((b) => b.status === 'overdue').length;
  const paidCount = bills.filter((b) => b.status === 'paid').length;

  const filteredBills = bills.filter((b) => {
    if (filter === 'all') return true;
    return b.status === filter;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header com Banner Didático */}
      <div className="bg-gradient-to-r from-[#29324E] via-[#1E293B] to-[#1367A2] p-6 rounded-3xl text-white shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/20">
              <FileText className="w-7 h-7 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold">Contas a Pagar & Despesas</h1>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-teal-400/20 text-teal-300 border border-teal-400/30">
                  Educação Financeira
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Aprenda a priorizar contas essenciais, evitar multas e manter a saúde financeira em dia.
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsNewBillModalOpen(true)}
            className="self-start sm:self-auto py-2.5 px-4 bg-[#F1613A] hover:bg-[#d9522e] text-white font-bold text-xs rounded-2xl transition shadow-md flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Conta</span>
          </button>
        </div>

        {/* Dica Didática */}
        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-xs text-slate-200 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#19A999] shrink-0" />
          <span>
            <strong>Lição Financeira:</strong> Pagar contas essenciais (água, luz e moradia) antes de gastos supérfluos é a regra nº 1 para não pagar juros de mora nem ficar com o nome negativado.
          </span>
        </div>
      </div>

      {/* Notificações Toasts */}
      {successToast && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          <span>{successToast}</span>
        </div>
      )}

      {errorToast && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{errorToast}</span>
        </div>
      )}

      {/* Cards de Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 uppercase">Total a Pagar</p>
          <p className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100 font-mono mt-1">
            R$ {totalPending.toFixed(2)}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Pendentes no ciclo</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 uppercase">Contas Vencidas</p>
          <p className={`text-lg sm:text-xl font-extrabold font-mono mt-1 ${overdueCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
            {overdueCount}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Cobram +2% multa e mora</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 uppercase">Contas Pagas</p>
          <p className="text-lg sm:text-xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-1">
            {paidCount}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Quitadas este mês</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 uppercase">Score Consciente</p>
          <p className="text-lg sm:text-xl font-extrabold text-[#19A999] font-mono mt-1">
            {score} pts
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {isNegativado ? '⚠️ Pendência Didática' : '✅ Cadastro Saudável'}
          </p>
        </div>
      </div>

      {/* Lista de Contas */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/80 pb-4">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
              Contas do Mês
            </h2>
            <p className="text-xs text-slate-500">
              Acompanhe os vencimentos e realize os pagamentos diretamente com o saldo disponível
            </p>
          </div>

          {/* Filtros */}
          <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl text-xs font-bold self-start sm:self-auto">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-xl transition ${
                filter === 'all' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              Todas ({bills.length})
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-3 py-1 rounded-xl transition ${
                filter === 'pending' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              A Vencer
            </button>
            <button
              onClick={() => setFilter('overdue')}
              className={`px-3 py-1 rounded-xl transition ${
                filter === 'overdue' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              Atrasadas ({overdueCount})
            </button>
            <button
              onClick={() => setFilter('paid')}
              className={`px-3 py-1 rounded-xl transition ${
                filter === 'paid' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              Pagas
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="space-y-3">
          {filteredBills.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Nenhuma conta encontrada nesta categoria de filtro.
            </div>
          ) : (
            filteredBills.map((bill) => {
              const isPaid = bill.status === 'paid';
              const isOverdue = bill.status === 'overdue';

              // Multa e juros calculados se vencida
              const lateFee = isOverdue ? bill.amount * 0.02 : 0;
              const interest = isOverdue ? bill.amount * 0.00033 * 5 : 0;
              const totalAmount = bill.amount + lateFee + interest;

              return (
                <div
                  key={bill.id}
                  className={`p-4 sm:p-5 rounded-2xl border transition space-y-3 ${
                    isPaid
                      ? 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-80'
                      : isOverdue
                      ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                      : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-2xl bg-slate-100 dark:bg-slate-700/60 shrink-0">
                        {getCategoryIcon(bill.category)}
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {bill.title}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              isPaid
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : isOverdue
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {isPaid ? 'PAGO' : isOverdue ? 'VENCIDO (+ ENCARGOS)' : 'PENDENTE'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 font-mono flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Vencimento: {new Date(bill.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right sm:self-center">
                      <p className="text-base sm:text-lg font-extrabold font-mono text-slate-900 dark:text-slate-100">
                        R$ {totalAmount.toFixed(2)}
                      </p>
                      {isOverdue && (
                        <p className="text-[10px] text-rose-500 font-medium">
                          Inclui R$ {(lateFee + interest).toFixed(2)} de multa/mora
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Linha digitável com botão de copiar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60 text-xs">
                    <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px] truncate">
                      <span className="truncate">{bill.linhaDigitavel}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyLinha(bill.id, bill.linhaDigitavel)}
                        className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition shrink-0"
                        title="Copiar linha digitável"
                      >
                        {copiedId === bill.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {!isPaid && (
                      <button
                        type="button"
                        onClick={() => handlePay(bill)}
                        disabled={payingBillId === bill.id}
                        className={`w-full sm:w-auto py-2 px-4 font-bold text-xs rounded-xl transition shadow-md flex items-center justify-center gap-1.5 ${
                          isOverdue
                            ? 'bg-rose-600 hover:bg-rose-500 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        {payingBillId === bill.id ? (
                          <span>Quitando...</span>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Quitar Conta com Saldo (+25 pts)</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal de Cadastro de Nova Conta */}
      {isNewBillModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-[#0F172A] w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#F1613A]" />
                Cadastrar Conta a Pagar
              </h3>
              <button
                onClick={() => setIsNewBillModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBill} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Nome / Descrição da Conta
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Mensalidade Escolar, Curso de Robótica, Celular"
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Categoria
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="energia">Energia Elétrica</option>
                    <option value="agua">Água & Saneamento</option>
                    <option value="internet">Internet & Telefone</option>
                    <option value="moradia">Aluguel & Moradia</option>
                    <option value="educacao">Escola & Cursos</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Valor (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Data de Vencimento
                </label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  required
                />
              </div>

              <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300">
                Se a conta vencer antes do pagamento, serão calculados automaticamente 2% de multa e juros de mora didáticos.
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewBillModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#F1613A] hover:bg-[#d9522e] text-white font-bold shadow-md"
                >
                  Salvar Conta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
