import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { SandboxTransaction } from '../types/sandbox';
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
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { activeAccount, refreshAccounts } = useAuth();
  const [showBalance, setShowBalance] = useState(true);
  const [transactions, setTransactions] = useState<SandboxTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('500');
  const [depositDesc, setDepositDesc] = useState('Aporte Fictício Sandbox');

  const fetchTransactions = async () => {
    if (!activeAccount) return;
    setLoadingTx(true);
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('account_id', activeAccount.id)
      .order('created_at', { ascending: false })
      .limit(20);

    setTransactions((data || []) as SandboxTransaction[]);
    setLoadingTx(false);
  };

  useEffect(() => {
    fetchTransactions();

    const handleRealtime = () => {
      fetchTransactions();
    };

    window.addEventListener('optmapay:realtime_update', handleRealtime);

    return () => {
      window.removeEventListener('optmapay:realtime_update', handleRealtime);
    };
  }, [activeAccount?.id]);


  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;
    const val = parseFloat(depositAmount);
    if (isNaN(val) || val <= 0) return;

    // 1. Credit balance
    const newBalance = activeAccount.balance + val;
    await supabase
      .from('accounts')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', activeAccount.id);

    // 2. Add transaction log
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

  if (!activeAccount) {
    return (
      <div className="p-8 text-center text-slate-500">
        Carregando dados da conta no Supabase...
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
            <span>Conta {activeAccount.type === 'merchant' ? 'Empresa (Merchant)' : 'Cliente (Customer)'}</span>
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
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight">
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
          <span className="text-[10px] text-slate-400">QR Code e Transferências</span>
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

      {/* Financial Statement (Extrato) */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              Extrato de Transações (Supabase)
            </h2>
            <p className="text-xs text-slate-500">
              Lançamentos financeiros simulados da conta selecionada
            </p>
          </div>
          <button
            onClick={fetchTransactions}
            className="p-2 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition"
            title="Atualizar extrato"
          >
            <RefreshCw className={`w-4 h-4 ${loadingTx ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {transactions.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            Nenhuma transação registrada nesta conta ainda. Realize um Pix, Boleto ou Aporte!
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60 overflow-x-auto">
            {transactions.map((tx) => {
              const isIn = tx.direction === 'in';
              return (
                <div key={tx.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-xl shrink-0 ${
                        isIn
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isIn ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {tx.description || tx.type.toUpperCase()}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {tx.counterparty_name ? `Contraparte: ${tx.counterparty_name} • ` : ''}
                        {new Date(tx.created_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className={`font-bold ${isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {isIn ? '+' : '-'} R$ {tx.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      {tx.type} • {tx.environment}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
