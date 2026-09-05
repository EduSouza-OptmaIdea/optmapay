import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { SandboxTransaction } from '../types/sandbox';
import { sendWelcomeEmail } from '../lib/email/app-email';
import { createBankAccount } from '../lib/supabase/accountService';
import {
  Eye,
  EyeOff,
  PlusCircle,
  QrCode,
  FileText,
  CreditCard,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Building2,
  User,
  Clock,
  Calendar,
  Filter,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  X,
  Wallet,
  Check,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface TransactionWithRunningBalance extends SandboxTransaction {
  balanceBefore: number;
  balanceAfter: number;
  alreadyRefunded: number;
  remainingRefundable: number;
  isFullyRefunded: boolean;
}

export const Dashboard: React.FC = () => {
  const { user, activeAccount, refreshAccounts } = useAuth();

  const [showBalance, setShowBalance] = useState(true);
  const [transactions, setTransactions] = useState<SandboxTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('500');
  const [depositDesc, setDepositDesc] = useState('Aporte Fictício Sandbox');

  // Filtros de Extrato Bancário
  const [periodFilter, setPeriodFilter] = useState<'7d' | '15d' | '30d' | 'custom'>('30d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [dateWarning, setDateWarning] = useState<string | null>(null);

  // Modal Devolução / Reembolso Pix
  const [selectedTxForRefund, setSelectedTxForRefund] = useState<TransactionWithRunningBalance | null>(null);
  const [refundMode, setRefundMode] = useState<'total' | 'partial'>('total');
  const [partialAmount, setPartialAmount] = useState('');
  const [refundReason, setRefundReason] = useState('Cancelamento de compra');
  const [processingRefund, setProcessingRefund] = useState(false);
  const [refundSuccessMessage, setRefundSuccessMessage] = useState<string | null>(null);
  const [refundErrorMessage, setRefundErrorMessage] = useState<string | null>(null);

  // Dispara e-mail de boas-vindas na primeira vez
  useEffect(() => {
    if (user?.email) {
      const welcomeKey = `optmapay_welcome_sent_${user.id}`;
      const alreadySent = localStorage.getItem(welcomeKey);
      if (!alreadySent) {
        sendWelcomeEmail({
          to: user.email,
          fullName: user.user_metadata?.account_name || user.email.split('@')[0],
        })
          .then((res) => {
            if (res && res.success) {
              localStorage.setItem(welcomeKey, 'true');
            }
          })
          .catch((err) => {
            console.debug('[Dashboard] Envio de e-mail de boas-vindas ignorado em sandbox:', err);
          });
      }
    }
  }, [user?.id, user?.email]);

  // Busca transações com base no período selecionado (até 60 dias)
  const fetchTransactions = async () => {
    if (!activeAccount) return;
    setLoadingTx(true);
    setDateWarning(null);

    const now = new Date();
    const maxRetDate = new Date();
    maxRetDate.setDate(maxRetDate.getDate() - 60);

    let startDate = new Date();

    if (periodFilter === '7d') {
      startDate.setDate(now.getDate() - 7);
    } else if (periodFilter === '15d') {
      startDate.setDate(now.getDate() - 15);
    } else if (periodFilter === '30d') {
      startDate.setDate(now.getDate() - 30);
    } else if (periodFilter === 'custom') {
      if (customStartDate) {
        const parsed = new Date(`${customStartDate}T00:00:00`);
        if (parsed < maxRetDate) {
          setDateWarning(
            `A data inicial selecionada ultrapassa o limite de 60 dias da política de retenção. Exibindo lançamentos a partir de ${maxRetDate.toLocaleDateString('pt-BR')}.`
          );
          startDate = maxRetDate;
        } else {
          startDate = parsed;
        }
      } else {
        startDate = maxRetDate;
      }
    }

    if (startDate < maxRetDate) {
      startDate = maxRetDate;
    }

    let query = supabase
      .from('transactions')
      .select('*')
      .eq('account_id', activeAccount.id)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (periodFilter === 'custom' && customEndDate) {
      const parsedEnd = new Date(`${customEndDate}T23:59:59`);
      query = query.lte('created_at', parsedEnd.toISOString());
    }

    const { data } = await query;
    setTransactions((data || []) as SandboxTransaction[]);
    setLoadingTx(false);
  };

  useEffect(() => {
    if (activeAccount?.id) {
      fetchTransactions();
    }

    const handleRealtime = () => {
      fetchTransactions();
    };

    // Polling ativo a cada 2.5s para garantir conciliação em tempo real entre abas
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && activeAccount?.id) {
        fetchTransactions();
      }
    }, 2500);

    window.addEventListener('optmapay:realtime_update', handleRealtime);
    return () => {
      window.removeEventListener('optmapay:realtime_update', handleRealtime);
      clearInterval(interval);
    };
  }, [activeAccount?.id, periodFilter, customStartDate, customEndDate]);

  // Agrupamento de Transações por Dia COM EVOLUÇÃO DO SALDO E CÁLCULO DE DEVOLUÇÕES
  const groupedTransactions = useMemo(() => {
    if (!activeAccount) return [];

    // Mapeamento de estornos já ocorridos para conciliação precisa
    const refundMap = new Map<string, number>();
    transactions.forEach((tx) => {
      if (tx.type === 'pix' && tx.direction === 'out' && tx.related_transaction_id) {
        const current = refundMap.get(tx.related_transaction_id) || 0;
        refundMap.set(tx.related_transaction_id, current + Number(tx.amount));
      }
    });

    let runningBalance = Number(activeAccount.balance);
    const enrichedTransactions: TransactionWithRunningBalance[] = [];

    // Ordenados de forma decrescente (mais recente primeiro)
    for (const tx of transactions) {
      const txAmount = Number(tx.amount);
      const after = runningBalance;
      let before = runningBalance;

      if (tx.direction === 'in') {
        before = after - txAmount;
      } else {
        before = after + txAmount;
      }

      // Calcula quanto já foi devolvido
      const colRefunded = Number(tx.refunded_amount || 0);
      const mapRefunded = refundMap.get(tx.id) || 0;
      const alreadyRefunded = Math.max(colRefunded, mapRefunded);
      const remainingRefundable = Math.max(0, txAmount - alreadyRefunded);
      const isFullyRefunded = tx.status === 'refunded' || remainingRefundable <= 0.009;

      enrichedTransactions.push({
        ...tx,
        balanceBefore: before,
        balanceAfter: after,
        alreadyRefunded,
        remainingRefundable,
        isFullyRefunded,
      });

      runningBalance = before;
    }

    const groups: {
      dateKey: string;
      formattedDate: string;
      openingBalance: number;
      closingBalance: number;
      totalIn: number;
      totalOut: number;
      items: TransactionWithRunningBalance[];
    }[] = [];

    const dateMap = new Map<string, TransactionWithRunningBalance[]>();

    enrichedTransactions.forEach((tx) => {
      const dateKey = new Date(tx.created_at).toLocaleDateString('pt-BR');
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, []);
      }
      dateMap.get(dateKey)!.push(tx);
    });

    dateMap.forEach((items, dateKey) => {
      let totalIn = 0;
      let totalOut = 0;

      items.forEach((item) => {
        if (item.direction === 'in') {
          totalIn += Number(item.amount);
        } else {
          totalOut += Number(item.amount);
        }
      });

      const closingBalance = items[0].balanceAfter;
      const openingBalance = items[items.length - 1].balanceBefore;

      const sampleDate = new Date(items[0].created_at);
      const isToday = sampleDate.toDateString() === new Date().toDateString();
      const isYesterday =
        sampleDate.toDateString() === new Date(Date.now() - 86400000).toDateString();

      let formattedDate = dateKey;
      if (isToday) formattedDate = `Hoje • ${dateKey}`;
      else if (isYesterday) formattedDate = `Ontem • ${dateKey}`;

      groups.push({
        dateKey,
        formattedDate,
        openingBalance,
        closingBalance,
        totalIn,
        totalOut,
        items,
      });
    });

    return groups;
  }, [transactions, activeAccount?.balance]);

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;
    const val = parseFloat(depositAmount);
    if (isNaN(val) || val <= 0) return;

    const newBalance = activeAccount.balance + val;
    await supabase
      .from('accounts')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', activeAccount.id);

    await supabase.from('transactions').insert({
      user_id: activeAccount.user_id || null,
      account_id: activeAccount.id,
      type: 'deposit',
      direction: 'in',
      amount: val,
      description: depositDesc,
      status: 'completed',
      real_money: false,
      environment: 'sandbox',
    });

    setIsDepositOpen(false);
    await refreshAccounts();
    await fetchTransactions();
  };

  // Abre modal de devolução preenchendo o saldo restante correto
  const handleOpenRefundModal = (tx: TransactionWithRunningBalance) => {
    if (tx.isFullyRefunded) return;
    setSelectedTxForRefund(tx);
    setRefundMode('total');
    setPartialAmount(tx.remainingRefundable.toFixed(2));
    setRefundErrorMessage(null);
    setRefundSuccessMessage(null);
  };

  // Processa a Devolução / Reembolso Pix
  const handleExecuteRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTxForRefund || !activeAccount) return;

    const maxRefundable = selectedTxForRefund.remainingRefundable;
    const refundAmountNum =
      refundMode === 'total'
        ? maxRefundable
        : parseFloat(partialAmount);

    if (isNaN(refundAmountNum) || refundAmountNum <= 0) {
      setRefundErrorMessage('Informe um valor de devolução válido.');
      return;
    }

    if (refundAmountNum > maxRefundable + 0.001) {
      setRefundErrorMessage(
        `O valor solicitado (R$ ${refundAmountNum.toFixed(2)}) excede o saldo restante disponível para estorno de R$ ${maxRefundable.toFixed(2)}.`
      );
      return;
    }

    if (activeAccount.balance < refundAmountNum) {
      setRefundErrorMessage(
        `Saldo insuficiente para realizar a devolução (Disponível: R$ ${activeAccount.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`
      );
      return;
    }

    setProcessingRefund(true);
    setRefundErrorMessage(null);

    try {
      const { data, error } = await supabase.rpc('refund_pix', {
        p_original_transaction_id: selectedTxForRefund.id,
        p_refund_amount: refundAmountNum,
        p_reason: refundReason.trim() || 'Devolução Pix',
      });

      if (error) throw error;

      setRefundSuccessMessage(
        `Devolução de R$ ${refundAmountNum.toFixed(2)} concluída com sucesso para ${data.receiver_name}!`
      );
      await refreshAccounts();
      await fetchTransactions();

      setTimeout(() => {
        setSelectedTxForRefund(null);
        setRefundSuccessMessage(null);
      }, 2500);
    } catch (err: any) {
      setRefundErrorMessage(err.message || 'Falha ao processar devolução Pix.');
    } finally {
      setProcessingRefund(false);
    }
  };

  // Tradução amigável dos tipos de transação
  const getFriendlyTypeName = (type: string, direction: string, description?: string) => {
    if (description?.toLowerCase().includes('devolução') || description?.toLowerCase().includes('reembolso')) {
      return direction === 'in' ? 'Reembolso Pix Recebido' : 'Devolução Pix Enviada';
    }
    if (type === 'pix') {
      return direction === 'in' ? 'Pix Recebido' : 'Pix Enviado';
    }
    if (type === 'deposit') return 'Aporte em Conta (Depósito Fictício)';
    if (type === 'boleto_payment') return 'Pagamento de Boleto';
    if (type === 'card_payment') return 'Cartão Virtual';
    if (type === 'transfer') return 'Transferência entre Contas';
    return type.toUpperCase();
  };

  if (!activeAccount) {
    return (
      <div className="min-h-[350px] flex flex-col items-center justify-center p-8 text-center text-slate-500 gap-4 text-xs">
        <RefreshCw className="w-6 h-6 text-[#19A999] animate-spin" />
        <span className="font-mono">Carregando sua conta no Internet Banking Sandbox...</span>
        <button
          onClick={async () => {
            if (user?.id) {
              try {
                const meta = user.user_metadata || {};
                await createBankAccount(user.id, {
                  name: meta.account_name || user.email?.split('@')[0] || 'Conta Sandbox',
                  type: meta.account_type || 'merchant',
                  cpf_cnpj: meta.cpf_cnpj || '45.892.102/0001-90',
                  initialBalance: 1000.00,
                  pixKey: user.email || `pix.${Date.now()}@optmapay.fake`,
                });
                await refreshAccounts();
              } catch (e: any) {
                console.error(e);
              }
            }
          }}
          className="mt-2 py-2 px-4 bg-[#19A999] text-white rounded-xl font-bold hover:bg-[#158f81] transition shadow-md"
        >
          Inicializar Conta Sandbox Agora
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Account Overview Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-br from-teal-700 via-teal-800 to-slate-900 text-white p-6 rounded-2xl shadow-xl shadow-teal-900/10">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-teal-200 text-xs font-semibold uppercase tracking-wider">
            {activeAccount.type === 'merchant' ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
            <span>Conta {activeAccount.type === 'merchant' ? 'Pessoa Jurídica (PJ)' : 'Pessoa Física (PF)'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold">{activeAccount.name}</h1>
          <p className="text-xs text-teal-200/80 font-mono">
            Agência: {activeAccount.agency} • Conta: {activeAccount.account_number} • CPF/CNPJ: {activeAccount.cpf_cnpj}
          </p>
        </div>

        {/* Balance Box */}
        <div className="bg-white/10 backdrop-blur-md border border-white/15 p-4 rounded-xl space-y-1 min-w-[220px]">
          <div className="flex items-center justify-between text-xs text-teal-100">
            <span>Saldo Fictício</span>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="text-teal-200 hover:text-white transition"
              title="Exibir/Ocultar saldo"
            >
              {showBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight font-mono">
            {showBalance ? (
              `R$ ${activeAccount.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            ) : (
              '••••••••'
            )}
          </div>
          <button
            onClick={() => setIsDepositOpen(true)}
            className="w-full mt-2 py-1.5 px-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs rounded-lg transition flex items-center justify-center gap-1.5 shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Simular Aporte (Depósito)</span>
          </button>
        </div>
      </div>

      {/* Quick Action Shortcuts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          to="/pix"
          className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-teal-500/50 hover:shadow-md transition flex flex-col items-center text-center gap-2 group"
        >
          <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 group-hover:scale-110 transition">
            <QrCode className="w-6 h-6" />
          </div>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Área Pix</span>
          <span className="text-[10px] text-slate-400">QR Code e Cobranças</span>
        </Link>

        <Link
          to="/boletos"
          className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-teal-500/50 hover:shadow-md transition flex flex-col items-center text-center gap-2 group"
        >
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition">
            <FileText className="w-6 h-6" />
          </div>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Boletos</span>
          <span className="text-[10px] text-slate-400">Cobrança e Quitação</span>
        </Link>

        <Link
          to="/cartoes"
          className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-teal-500/50 hover:shadow-md transition flex flex-col items-center text-center gap-2 group"
        >
          <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition">
            <CreditCard className="w-6 h-6" />
          </div>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Cartões Virtuais</span>
          <span className="text-[10px] text-slate-400">Débito e Crédito</span>
        </Link>

        <Link
          to="/settlement"
          className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-teal-500/50 hover:shadow-md transition flex flex-col items-center text-center gap-2 group"
        >
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition">
            <RefreshCw className="w-6 h-6" />
          </div>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Simulador Vendas</span>
          <span className="text-[10px] text-slate-400">Baixa de Duplicatas</span>
        </Link>
      </div>

      {/* EXTRATO BANCÁRIO COMPLETO COM EVOLUÇÃO DO SALDO E SALDO ANTERIOR */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-6 shadow-sm">
        
        {/* Header do Extrato */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700/80 pb-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#19A999]" />
              Extrato Bancário da Conta
            </h2>
            <p className="text-xs text-slate-500">
              Acompanhe a evolução do saldo diário a partir do saldo anterior consolidado
            </p>
          </div>

          {/* Botões de Filtro de Período */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setPeriodFilter('7d')}
              className={`px-3 py-1.5 rounded-lg transition ${
                periodFilter === '7d'
                  ? 'bg-white dark:bg-slate-800 text-[#19A999] shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Semana Atual
            </button>
            <button
              onClick={() => setPeriodFilter('15d')}
              className={`px-3 py-1.5 rounded-lg transition ${
                periodFilter === '15d'
                  ? 'bg-white dark:bg-slate-800 text-[#19A999] shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Quinzena Atual
            </button>
            <button
              onClick={() => setPeriodFilter('30d')}
              className={`px-3 py-1.5 rounded-lg transition ${
                periodFilter === '30d'
                  ? 'bg-white dark:bg-slate-800 text-[#19A999] shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Mês Atual
            </button>
            <button
              onClick={() => setPeriodFilter('custom')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${
                periodFilter === 'custom'
                  ? 'bg-white dark:bg-slate-800 text-[#F1613A] shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Personalizado</span>
            </button>

            <button
              onClick={fetchTransactions}
              className="p-1.5 text-slate-400 hover:text-[#19A999] transition ml-1"
              title="Recarregar Extrato"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingTx ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Inputs de Data Personalizada */}
        {periodFilter === 'custom' && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs animate-fadeIn">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Data Inicial (Máximo 60 dias atrás)
              </label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs outline-none focus:ring-2 focus:ring-[#19A999]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Data Final
              </label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs outline-none focus:ring-2 focus:ring-[#19A999]"
              />
            </div>
          </div>
        )}

        {/* Aviso de Retenção de 60 Dias */}
        {dateWarning && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{dateWarning}</span>
          </div>
        )}

        <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-900 dark:text-teal-200 flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <span>
            <strong>Extrato Oficial Sandbox:</strong> Conciliação completa com <strong>Saldo Anterior</strong> e <strong>Saldo do Dia</strong> para cada período de até 60 dias. Clique em qualquer Pix recebido com saldo remanescente para efetuar devoluções.
          </span>
        </div>

        {/* Lista de Transações Agrupadas por Dia com Saldo Anterior e Saldo do Dia */}
        {groupedTransactions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
            Nenhum lançamento registrado nesta conta no período selecionado.
          </div>
        ) : (
          <div className="space-y-6">
            {groupedTransactions.map((group) => (
              <div
                key={group.dateKey}
                className="border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-sm"
              >
                {/* Cabeçalho do Dia com Saldo Anterior, Movimentação e Saldo do Dia */}
                <div className="bg-slate-100 dark:bg-slate-900/90 px-4 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs border-b border-slate-200 dark:border-slate-700/80">
                  <div className="flex items-center gap-2 font-mono font-bold text-slate-800 dark:text-slate-100">
                    <Calendar className="w-4 h-4 text-[#19A999]" />
                    <span>{group.formattedDate}</span>
                  </div>

                  {/* Evolução de Saldo do Dia */}
                  <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                    <div className="text-slate-500 dark:text-slate-400">
                      Saldo Anterior: <strong>R$ {group.openingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                    </div>

                    <div className="flex items-center gap-2">
                      {group.totalIn > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                          + R$ {group.totalIn.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      {group.totalOut > 0 && (
                        <span className="text-rose-600 dark:text-rose-400 font-bold">
                          - R$ {group.totalOut.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>

                    <div className="px-2.5 py-1 rounded-lg bg-teal-500/10 border border-teal-500/20 text-[#19A999] font-extrabold flex items-center gap-1">
                      <Wallet className="w-3.5 h-3.5" />
                      <span>Saldo do Dia: R$ {group.closingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Itens do Dia */}
                <div className="divide-y divide-slate-100 dark:divide-slate-700/50 bg-white dark:bg-slate-800">
                  {group.items.map((tx) => {
                    const isIn = tx.direction === 'in';
                    const isPixIn = tx.type === 'pix' && isIn;
                    const canRefund = isPixIn && !tx.isFullyRefunded;

                    return (
                      <div
                        key={tx.id}
                        onClick={() => {
                          if (canRefund) {
                            handleOpenRefundModal(tx);
                          }
                        }}
                        className={`p-4 flex items-center justify-between gap-4 text-xs transition ${
                          canRefund
                            ? 'hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer'
                            : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2.5 rounded-xl shrink-0 ${
                              isIn
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {isIn ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                          </div>

                          <div className="space-y-0.5">
                            <p className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                              <span>{getFriendlyTypeName(tx.type, tx.direction, tx.description)}</span>

                              {/* Badges de Status de Devolução */}
                              {isPixIn && (
                                tx.isFullyRefunded ? (
                                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded text-[10px] font-semibold">
                                    Devolvido Integralmente
                                  </span>
                                ) : tx.alreadyRefunded > 0 ? (
                                  <span className="px-2 py-0.5 bg-teal-500/10 text-[#19A999] rounded text-[10px] font-semibold border border-teal-500/20">
                                    Devolver Restante (R$ {tx.remainingRefundable.toFixed(2)})
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-teal-500/10 text-[#19A999] rounded text-[10px] font-semibold border border-teal-500/20">
                                    Clique para Devolver
                                  </span>
                                )
                              )}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {tx.counterparty_name ? `Contraparte: ${tx.counterparty_name} • ` : ''}
                              {tx.description ? `${tx.description} • ` : ''}
                              {new Date(tx.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 space-y-0.5">
                          <p className={`font-extrabold font-mono text-sm ${isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {isIn ? '+' : '-'} R$ {Number(tx.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-[10px] font-mono text-slate-400">
                            Saldo após: R$ {tx.balanceAfter.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL DEVOLUÇÃO / ESTORNO PIX (COM CONTROLE DO SALDO RESTANTE) */}
      {selectedTxForRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-base">
                <RotateCcw className="w-5 h-5" />
                <h3>Devolução de Pix Recebido</h3>
              </div>
              <button
                onClick={() => setSelectedTxForRefund(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {refundSuccessMessage ? (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-500 text-emerald-700 dark:text-emerald-300 text-center space-y-2 animate-fadeIn text-xs">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
                <p className="font-bold text-sm">{refundSuccessMessage}</p>
                <p className="text-[11px] text-slate-500">Saldo estornado e atualizado em tempo real.</p>
              </div>
            ) : (
              <form onSubmit={handleExecuteRefund} className="space-y-4 text-xs">
                {refundErrorMessage && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-400 text-rose-700 dark:text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{refundErrorMessage}</span>
                  </div>
                )}

                {/* Detalhes do Pix Original e Saldo Restante */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Pix Original Recebido</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                      R$ {Number(selectedTxForRefund.amount).toFixed(2)}
                    </span>
                  </div>

                  {selectedTxForRefund.alreadyRefunded > 0 && (
                    <div className="flex justify-between items-center text-rose-600 dark:text-rose-400">
                      <span>Já Devolvido Anteriormente:</span>
                      <span className="font-mono font-bold">- R$ {selectedTxForRefund.alreadyRefunded.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-400 font-bold">
                    <span>Saldo Restante Disponível:</span>
                    <span className="font-mono text-sm">R$ {selectedTxForRefund.remainingRefundable.toFixed(2)}</span>
                  </div>

                  <p className="text-slate-500 text-[11px] pt-1">
                    De: <strong>{selectedTxForRefund.counterparty_name || 'Conta Pagadora'}</strong> • {new Date(selectedTxForRefund.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>

                {/* Seleção Total vs Parcial */}
                <div className="space-y-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300">
                    Tipo de Devolução
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRefundMode('total')}
                      className={`py-2 px-3 rounded-xl border font-bold transition ${
                        refundMode === 'total'
                          ? 'bg-teal-50 dark:bg-teal-950/80 border-[#19A999] text-[#19A999]'
                          : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Devolver Restante (R$ {selectedTxForRefund.remainingRefundable.toFixed(2)})
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRefundMode('partial');
                        setPartialAmount((selectedTxForRefund.remainingRefundable / 2).toFixed(2));
                      }}
                      className={`py-2 px-3 rounded-xl border font-bold transition ${
                        refundMode === 'partial'
                          ? 'bg-teal-50 dark:bg-teal-950/80 border-[#19A999] text-[#19A999]'
                          : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Devolução Parcial
                    </button>
                  </div>
                </div>

                {refundMode === 'partial' && (
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Valor a Devolver (Máximo R$ {selectedTxForRefund.remainingRefundable.toFixed(2)})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={selectedTxForRefund.remainingRefundable}
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono font-bold text-rose-600 outline-none focus:ring-2 focus:ring-rose-500"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Motivo da Devolução (Opcional)
                  </label>
                  <input
                    type="text"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="Ex: Cancelamento de pedido / Valor divergente"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs outline-none focus:ring-2 focus:ring-[#19A999]"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTxForRefund(null)}
                    className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={processingRefund}
                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {processingRefund && <RefreshCw className="w-4 h-4 animate-spin" />}
                    <span>{processingRefund ? 'Processando...' : 'Confirmar Devolução'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal Simular Depósito */}
      {isDepositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Simular Aporte Fictício
            </h3>
            <p className="text-xs text-slate-500">
              Credita saldo diretamente na conta ativa selecionada e salva a transação no Supabase.
            </p>

            <form onSubmit={handleDeposit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Valor do Aporte (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-mono font-bold focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Descrição do Lançamento
                </label>
                <input
                  type="text"
                  value={depositDesc}
                  onChange={(e) => setDepositDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDepositOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-500 transition shadow-md shadow-teal-900/20"
                >
                  Confirmar Aporte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
