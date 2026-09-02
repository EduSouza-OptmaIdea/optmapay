import React, { useState } from 'react';
import { SandboxAccount, SandboxCard } from '../types/sandbox';
import {
  calculateInvoiceInfo,
  calculateOverdueCharges,
  blockOverdueCard,
  INVOICE_DUE_DAYS,
  payCreditCardInvoice,
} from '../lib/cardService';
import { supabase } from '../lib/supabase';
import {
  FileText,
  Calendar,
  Sparkles,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Check,
  DollarSign,
  Zap,
  AlertTriangle,
  Lock,
  Unlock,
  Layers,
} from 'lucide-react';

interface CardInvoiceManagerProps {
  activeAccount: SandboxAccount;
  cards: SandboxCard[];
  onInvoicePaid?: () => void;
  onCardUpdated?: () => void;
}

export const CardInvoiceManager: React.FC<CardInvoiceManagerProps> = ({
  activeAccount,
  cards,
  onInvoicePaid,
  onCardUpdated,
}) => {
  const creditCards = cards.filter((c) => c.tipo === 'credito');
  const [selectedCardId, setSelectedCardId] = useState<string>(creditCards[0]?.id || '');

  const [paying, setPaying] = useState(false);
  const [paySuccessMsg, setPaySuccessMsg] = useState<string | null>(null);
  const [payErrorMsg, setPayErrorMsg] = useState<string | null>(null);
  const [savingDueDay, setSavingDueDay] = useState(false);

  // Simulador de Dias de Atraso
  const [simulatedDaysOverdue, setSimulatedDaysOverdue] = useState<number>(0);

  // Fallback if card changed
  const currentCard = creditCards.find((c) => c.id === selectedCardId) || creditCards[0];

  if (creditCards.length === 0) {
    return (
      <div className="p-8 text-center bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 space-y-3">
        <CreditCard className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
          Nenhum Cartão de Crédito Encontrado
        </h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Crie um cartão virtual na modalidade <strong>Crédito</strong> na aba Meus Cartões para gerenciar faturas, vencimentos e limites.
        </p>
      </div>
    );
  }

  const invoice = calculateInvoiceInfo(currentCard);
  const overdueInfo = calculateOverdueCharges(invoice.usedLimit, simulatedDaysOverdue);
  const percentUsed = invoice.totalLimit > 0 ? (invoice.usedLimit / invoice.totalLimit) * 100 : 0;
  const isCardBlocked = currentCard.status === 'blocked' || overdueInfo.isBlockedByOverdue;

  const handleChangeDueDay = async (newDueDay: number) => {
    if (!currentCard) return;
    setSavingDueDay(true);
    try {
      const { error } = await supabase
        .from('cartoes')
        .update({ due_day: newDueDay })
        .eq('id', currentCard.id);

      if (error) throw error;
      if (onCardUpdated) onCardUpdated();
    } catch (err: any) {
      alert(`Erro ao alterar vencimento: ${err.message}`);
    } finally {
      setSavingDueDay(false);
    }
  };

  const handleToggleAutoDebit = async () => {
    if (!currentCard) return;
    const newStatus = !currentCard.auto_debit;
    try {
      const { error } = await supabase
        .from('cartoes')
        .update({ auto_debit: newStatus })
        .eq('id', currentCard.id);

      if (error) throw error;
      if (onCardUpdated) onCardUpdated();
    } catch (err: any) {
      alert(`Erro ao atualizar débito automático: ${err.message}`);
    }
  };

  const handleApplyOverdueBlock = async () => {
    if (!currentCard) return;
    await blockOverdueCard(currentCard.id);
    if (onCardUpdated) onCardUpdated();
  };

  const handlePayInvoice = async () => {
    if (!currentCard) return;
    const totalToPay = overdueInfo.totalDueAmount;

    if (totalToPay <= 0) {
      alert('Esta fatura já está quitada (R$ 0,00).');
      return;
    }

    if (activeAccount.balance < totalToPay) {
      setPayErrorMsg(
        `Saldo insuficiente em conta (Disponível: R$ ${activeAccount.balance.toFixed(2)}, Necessário: R$ ${totalToPay.toFixed(2)}). Realize um depósito fictício no Dashboard primeiro.`
      );
      return;
    }

    setPaying(true);
    setPaySuccessMsg(null);
    setPayErrorMsg(null);

    try {
      const res = await payCreditCardInvoice(currentCard.id, invoice.usedLimit);

      // Se estava bloqueado, desbloqueia após pagamento
      if (currentCard.status === 'blocked') {
        await supabase.from('cartoes').update({ status: 'active' }).eq('id', currentCard.id);
      }

      setPaySuccessMsg(`${res.message} ${simulatedDaysOverdue > 0 ? `(Encargos de atraso quitados)` : ''}`);
      setSimulatedDaysOverdue(0);
      if (onInvoicePaid) onInvoicePaid();
      if (onCardUpdated) onCardUpdated();
    } catch (err: any) {
      setPayErrorMsg(err.message || 'Erro ao pagar fatura.');
    } finally {
      setPaying(false);
    }
  };

  // Simulação de compras parceladas futuras
  const simulatedInstallments = [
    { desc: 'Licença Anual de Software', parcel: '1/3', amount: invoice.usedLimit > 0 ? invoice.usedLimit * 0.4 : 120.0, month: 'Fatura Atual' },
    { desc: 'Equipamentos de Escritório', parcel: '1/2', amount: invoice.usedLimit > 0 ? invoice.usedLimit * 0.3 : 90.0, month: 'Fatura Atual' },
    { desc: 'Serviços Cloud OptmaIdea', parcel: 'À vista', amount: invoice.usedLimit > 0 ? invoice.usedLimit * 0.3 : 40.0, month: 'Fatura Atual' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Card Selector (if multiple credit cards) */}
      {creditCards.length > 1 && (
        <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-200 dark:border-slate-700">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Selecione o Cartão de Crédito:
          </label>
          <select
            value={currentCard.id}
            onChange={(e) => {
              setSelectedCardId(e.target.value);
              setSimulatedDaysOverdue(0);
            }}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-slate-200"
          >
            {creditCards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.masked_number} - {c.cardholder_name} (Limite: R$ {c.credit_limit.toFixed(0)})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Alerta de Cartão Bloqueado por Atraso */}
      {overdueInfo.isBlockedByOverdue && (
        <div className="p-4 rounded-3xl bg-red-950/80 border-2 border-red-500 text-white flex items-center justify-between gap-4 animate-pulse shadow-xl">
          <div className="flex items-center gap-3">
            <Lock className="w-6 h-6 text-red-400 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-red-200">
                CARTÃO BLOQUEADO POR INADIMPLÊNCIA (ATRASO &gt; 7 DIAS)
              </h3>
              <p className="text-xs text-red-300">
                A fatura está vencida há <strong>{simulatedDaysOverdue} dias</strong>. Conforme regras bancárias, compras foram suspensas. Efetue o pagamento com saldo para restabelecer o cartão.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleApplyOverdueBlock}
            className="py-2 px-4 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl whitespace-nowrap shadow-md"
          >
            Aplicar Bloqueio no Banco
          </button>
        </div>
      )}

      {/* Grid Principal de Informações da Fatura */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Painel da Fatura Atual & Pagamento */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-[#1367A2]/10 text-[#1367A2] dark:text-sky-400 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Fatura do Cartão de Crédito
                </h2>
                <p className="text-xs text-slate-500 font-mono">
                  {currentCard.masked_number} • {currentCard.cardholder_name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {isCardBlocked ? (
                <span className="px-3 py-1 text-xs font-bold bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-full flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Cartão Bloqueado
                </span>
              ) : invoice.invoiceStatus === 'paid' ? (
                <span className="px-3 py-1 text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-full flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Fatura em Dia
                </span>
              ) : invoice.invoiceStatus === 'closed' ? (
                <span className="px-3 py-1 text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-full flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Fatura Fechada
                </span>
              ) : (
                <span className="px-3 py-1 text-xs font-bold bg-sky-50 dark:bg-sky-950/40 text-[#1367A2] dark:text-sky-400 border border-sky-200 dark:border-sky-800 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Fatura Aberta
                </span>
              )}
            </div>
          </div>

          {/* Valor da Fatura e Limite */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 font-medium mb-1">
                {simulatedDaysOverdue > 0 ? 'Total com Encargos de Atraso:' : 'Valor Atual da Fatura:'}
              </p>
              <p
                className={`text-2xl sm:text-3xl font-mono font-extrabold ${
                  simulatedDaysOverdue > 0 ? 'text-red-500' : 'text-[#A63987] dark:text-purple-400'
                }`}
              >
                R$ {overdueInfo.totalDueAmount.toFixed(2)}
              </p>
              <div className="text-[11px] text-slate-400 mt-1">
                {simulatedDaysOverdue > 0 ? (
                  <span className="text-red-400 font-bold">
                    Vencido há {simulatedDaysOverdue} dias (Original: R$ {invoice.usedLimit.toFixed(2)})
                  </span>
                ) : (
                  <span>
                    Vencimento em <strong className="text-slate-700 dark:text-slate-300">{invoice.dueDateStr}</strong>
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 font-medium mb-1">Limite Disponível para Compras:</p>
              <p className="text-2xl sm:text-3xl font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                R$ {invoice.availableLimit.toFixed(2)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Limite Total: R$ {invoice.totalLimit.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Barra de Consumo de Limite */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-500 font-mono font-medium">
              <span>Consumo do Limite: {percentUsed.toFixed(1)}%</span>
              <span>Disponível: R$ {invoice.availableLimit.toFixed(2)}</span>
            </div>
            <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#1367A2] to-[#A63987] transition-all duration-500"
                style={{ width: `${Math.min(100, percentUsed)}%` }}
              />
            </div>
          </div>

          {/* Lançamentos da Fatura & Parcelamentos */}
          <div className="space-y-2 border-t border-slate-100 dark:border-slate-700 pt-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#1367A2]" />
              <span>Detalhamento de Compras & Parcelas na Fatura</span>
            </h4>

            <div className="divide-y divide-slate-100 dark:divide-slate-700 text-xs">
              {simulatedInstallments.map((item, idx) => (
                <div key={idx} className="py-2 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-700 dark:text-slate-200">{item.desc}</p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Parcela: {item.parcel} • {item.month}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                    R$ {item.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Mensagens de Sucesso / Erro */}
          {paySuccessMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{paySuccessMsg}</span>
            </div>
          )}

          {payErrorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-2xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{payErrorMsg}</span>
            </div>
          )}

          {/* Ação de Pagamento */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-700">
            <div className="text-xs text-slate-500">
              Saldo em Conta Corrente:{' '}
              <strong className="font-mono text-slate-800 dark:text-slate-200">
                R$ {activeAccount.balance.toFixed(2)}
              </strong>
            </div>

            <button
              type="button"
              onClick={handlePayInvoice}
              disabled={paying || overdueInfo.totalDueAmount <= 0}
              className="w-full sm:w-auto py-3 px-6 bg-gradient-to-r from-[#1367A2] to-[#A63987] hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-[#A63987]/20"
            >
              <DollarSign className="w-4 h-4" />
              <span>
                {paying ? 'Processando Quitação...' : `Pagar Fatura com Saldo (R$ ${overdueInfo.totalDueAmount.toFixed(2)})`}
              </span>
            </button>
          </div>
        </div>

        {/* Painel Lateral: Encargos por Atraso, Vencimento e Débito Automático */}
        <div className="space-y-4">
          {/* SIMULADOR DE ENCARGOS POR ATRASO (MULTA 2% + JUROS DE MERCADO + BLOQUEIO 7 DIAS) */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                Simulador de Atraso & Encargos
              </h3>
            </div>

            <p className="text-[11px] text-slate-500">
              Simule dias de atraso após o vencimento para testar a aplicação de multa de 2%, juros e bloqueio:
            </p>

            {/* Slider de Dias de Atraso */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono font-bold">
                <span className="text-slate-500">Dias de Atraso:</span>
                <span className={simulatedDaysOverdue >= 7 ? 'text-red-500' : 'text-[#1367A2]'}>
                  {simulatedDaysOverdue} dias {simulatedDaysOverdue >= 7 ? '(Bloqueio Ativo)' : ''}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                value={simulatedDaysOverdue}
                onChange={(e) => setSimulatedDaysOverdue(parseInt(e.target.value, 10))}
                className="w-full accent-[#A63987] cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                <span>0d (Em dia)</span>
                <span>7d (Bloqueio)</span>
                <span>30d</span>
              </div>
            </div>

            {/* Detalhamento dos Encargos */}
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 text-[11px] space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Multa por Atraso (2,0%):</span>
                <span className="text-red-500 font-bold">+R$ {overdueInfo.lateFeeAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Juros de Mora (1,0% a.m.):</span>
                <span className="text-red-500 font-bold">+R$ {overdueInfo.moraAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Juros Rotativo (14,5% a.m.):</span>
                <span className="text-red-500 font-bold">+R$ {overdueInfo.rotativoAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-1 font-bold">
                <span className="text-slate-700 dark:text-slate-300">Total de Encargos:</span>
                <span className="text-red-600">+R$ {overdueInfo.totalCharges.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Card: Escolher Dia de Vencimento */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#1367A2]" />
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                Dia de Vencimento
              </h3>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {INVOICE_DUE_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleChangeDueDay(day)}
                  disabled={savingDueDay}
                  className={`py-2 px-3 rounded-xl font-mono text-xs font-bold border transition ${
                    invoice.dueDay === day
                      ? 'bg-gradient-to-r from-[#1367A2] to-[#A63987] text-white border-transparent shadow-md'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  Dia {String(day).padStart(2, '0')}
                </button>
              ))}
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 text-[11px] space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Fechamento da Fatura:</span>
                <strong className="text-slate-800 dark:text-slate-200 font-mono">
                  {invoice.closingDateStr} (7 dias antes)
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Melhor Dia de Compra:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                  {invoice.bestDayStr}
                </strong>
              </div>
            </div>
          </div>

          {/* Card: Débito Automático em Conta */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#A63987]" />
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
                  Débito Automático
                </h3>
              </div>

              <button
                type="button"
                onClick={handleToggleAutoDebit}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-300 ${
                  invoice.autoDebit ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-300 ${
                    invoice.autoDebit ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              {invoice.autoDebit ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  ✓ Ativado: O valor da fatura será debitado automaticamente do saldo da sua conta no dia do vencimento ({invoice.dueDateStr}).
                </span>
              ) : (
                <span>
                  Desativado: Você pode efetuar o pagamento manual da fatura a qualquer momento utilizando o botão acima.
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
