import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Crown,
  Building2,
  User,
  DollarSign,
  TrendingUp,
  Activity,
  Layers,
  Search,
  CheckCircle2,
  Landmark,
  ShieldCheck,
  Zap,
  ArrowRight,
  PlusCircle,
  Clock,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import {
  SandboxAccount,
} from '../types/sandbox';
import {
  fetchAllAccountsAsSuperAdmin,
  superAdminFetchGlobalMetrics,
  superAdminAdjustAccountBalance,
  SuperAdminGlobalMetrics,
} from '../lib/supabase/accountService';
import { supabase } from '../lib/supabase';
import { releaseD1Settlement } from '../lib/cardService';
import { getSettlementCountdown } from '../lib/businessDays';

export const SuperAdminConsole: React.FC = () => {
  const { isSuperAdmin, activeAccount, setActiveAccountId, refreshAccounts } = useAuth();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<SandboxAccount[]>([]);
  const [metrics, setMetrics] = useState<SuperAdminGlobalMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'merchant' | 'customer'>('all');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Modal de Ajuste de Saldo
  const [selectedAccForBalance, setSelectedAccForBalance] = useState<SandboxAccount | null>(null);
  const [newBalanceInput, setNewBalanceInput] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('Injeção de Testes do Super Admin');
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Varredura Geral de Liquidação
  const [isSweeping, setIsSweeping] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [accs, met] = await Promise.all([
        fetchAllAccountsAsSuperAdmin(),
        superAdminFetchGlobalMetrics(),
      ]);
      setAccounts(accs);
      setMetrics(met);
    } catch (err) {
      console.error('[SuperAdminConsole] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Impersonate / Assumir Conta
  const handleImpersonate = (account: SandboxAccount) => {
    setActiveAccountId(account.id);
    showToast(`👑 Sessão alternada para "${account.name}". Agora você opera com a visão desta conta.`);
  };

  // Confirmar Ajuste de Saldo
  const handleConfirmBalanceAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccForBalance) return;
    const val = parseFloat(newBalanceInput);
    if (isNaN(val) || val < 0) {
      alert('Informe um saldo numérico válido.');
      return;
    }

    setIsAdjusting(true);
    try {
      await superAdminAdjustAccountBalance(selectedAccForBalance.id, val, adjustReason);
      await loadData();
      await refreshAccounts();
      showToast(`✅ Saldo da conta "${selectedAccForBalance.name}" ajustado para R$ ${val.toFixed(2)} com sucesso!`);
      setSelectedAccForBalance(null);
    } catch (err: any) {
      alert(`Erro ao ajustar saldo: ${err.message}`);
    } finally {
      setIsAdjusting(false);
    }
  };

  // Varredura Geral de Liquidação do Banco Inteiro
  const handleGlobalSettlementSweep = async () => {
    setIsSweeping(true);
    try {
      const { data: pendingTxs } = await supabase
        .from('transactions')
        .select('*')
        .eq('type', 'card_payment')
        .eq('direction', 'in')
        .eq('status', 'pending');

      const txs = pendingTxs || [];
      let settled = 0;

      for (const tx of txs) {
        let plan: any = 'standard';
        if (tx.description?.includes('D+15')) plan = 'd15';
        else if (tx.description?.includes('D+7')) plan = 'd7';
        else if (tx.description?.includes('Vencimento')) plan = 'due_date';

        const countdown = getSettlementCountdown(tx.created_at, plan);
        if (countdown.isDue) {
          try {
            await releaseD1Settlement(tx.id, tx.account_id);
            settled++;
          } catch (e) {
            console.warn('Erro ao liquidar tx:', tx.id, e);
          }
        }
      }

      await loadData();
      await refreshAccounts();
      showToast(
        settled > 0
          ? `⚡ Varredura concluída: ${settled} lançamento(s) vencido(s) liquidado(s) e creditado(s) nas contas!`
          : '⚡ Varredura concluída: Não haviam lançamentos com prazo vencido para liquidar.'
      );
    } catch (err: any) {
      alert(`Erro na varredura: ${err.message}`);
    } finally {
      setIsSweeping(false);
    }
  };

  const filteredAccounts = accounts.filter((acc) => {
    const matchesSearch =
      acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (acc.cpf_cnpj && acc.cpf_cnpj.includes(searchQuery)) ||
      (acc.pix_key && acc.pix_key.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType =
      filterType === 'all' ||
      (filterType === 'merchant' && acc.type === 'merchant') ||
      (filterType === 'customer' && acc.type === 'customer');

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-amber-500/40 text-xs font-semibold flex items-center gap-2 animate-bounce">
          <Crown className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header do Super Admin */}
      <div className="bg-gradient-to-r from-[#1E293B] via-[#0F172A] to-[#1367A2] text-white p-6 sm:p-8 rounded-3xl border border-slate-700 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="p-3.5 bg-gradient-to-tr from-amber-500 to-orange-500 rounded-2xl text-white shadow-lg shadow-amber-500/20 shrink-0">
            <Crown className="w-8 h-8" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black">
                Console Master do Super Admin
              </h1>
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 uppercase tracking-wider">
                Root Operator
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Visão consolidada e governança do banco OptmaPay. Gerencie todas as contas do ecossistema,
              audite TPV, injete saldos de homologação e execute varreduras globais de liquidação bancária.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
          <button
            type="button"
            onClick={handleGlobalSettlementSweep}
            disabled={isSweeping}
            className="py-2.5 px-4 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-current" />
            <span>{isSweeping ? 'Varrendo...' : 'Varredura de Liquidação (06h)'}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/config-banco')}
            className="py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-slate-950 font-black shadow-lg shadow-amber-500/20 transition flex items-center gap-1.5"
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>Parâmetros de Taxas</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas Globais do Banco */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Custódia Total */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Custódia Total</span>
            <Building2 className="w-4 h-4 text-[#1367A2]" />
          </div>
          <p className="text-lg font-mono font-black text-slate-900 dark:text-white">
            R$ {metrics ? metrics.totalBalanceCustodied.toFixed(2) : '...'}
          </p>
          <p className="text-[10px] text-slate-400">Saldo somado de todas as contas</p>
        </div>

        {/* TPV Global */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Volume TPV</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-lg font-mono font-black text-emerald-600 dark:text-emerald-400">
            R$ {metrics ? metrics.totalVolumeTPV.toFixed(2) : '...'}
          </p>
          <p className="text-[10px] text-slate-400">{metrics?.totalTransactionsCount || 0} transações processadas</p>
        </div>

        {/* Receita MDR do Banco */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Receita MDR Arrecadada</span>
            <TrendingUp className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-lg font-mono font-black text-amber-600 dark:text-amber-400">
            R$ {metrics ? metrics.totalMdrRevenueCollected.toFixed(2) : '...'}
          </p>
          <p className="text-[10px] text-slate-400">Lucro com taxas retidas</p>
        </div>

        {/* Recebíveis em Trânsito */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">A Liquidar (D+N)</span>
            <Clock className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-lg font-mono font-black text-purple-600 dark:text-purple-400">
            R$ {metrics ? metrics.totalPendingSettlements.toFixed(2) : '...'}
          </p>
          <p className="text-[10px] text-slate-400">{metrics?.pendingTransactionsCount || 0} lançamento(s) futuro(s)</p>
        </div>

        {/* Total de Contas */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Contas Ativas</span>
            <User className="w-4 h-4 text-teal-500" />
          </div>
          <p className="text-lg font-mono font-black text-teal-600 dark:text-teal-400">
            {accounts.length}
          </p>
          <p className="text-[10px] text-slate-400">PJ Lojistas e PF Clientes</p>
        </div>
      </div>

      {/* Tabela de Gestão de Contas do Sistema (Multi-Tenancy) */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Todas as Contas do Sistema (Multi-Tenant)</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                {filteredAccounts.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              Alterne entre contas para navegar como o cliente ou ajuste saldos diretamente
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Campo de Busca */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar conta, CNPJ, Pix..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border rounded-xl text-xs font-medium w-48 sm:w-56"
              />
            </div>

            {/* Filtro por Tipo */}
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  filterType === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-bold'
                    : 'text-slate-500'
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setFilterType('merchant')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  filterType === 'merchant'
                    ? 'bg-white dark:bg-slate-800 text-[#19A999] shadow-xs font-bold'
                    : 'text-slate-500'
                }`}
              >
                PJ
              </button>
              <button
                type="button"
                onClick={() => setFilterType('customer')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  filterType === 'customer'
                    ? 'bg-white dark:bg-slate-800 text-blue-500 shadow-xs font-bold'
                    : 'text-slate-500'
                }`}
              >
                PF
              </button>
            </div>
          </div>
        </div>

        {/* Tabela de Contas */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700 text-[10px] text-slate-400 font-bold uppercase tracking-wider bg-slate-50/50 dark:bg-slate-900/50">
                <th className="py-3 px-6">Identificação da Conta</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Documento (CPF/CNPJ)</th>
                <th className="py-3 px-4">Chave Pix</th>
                <th className="py-3 px-4 text-right">Saldo Disponível</th>
                <th className="py-3 px-6 text-center">Ações Super Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {filteredAccounts.map((acc) => {
                const isActive = acc.id === activeAccount?.id;
                return (
                  <tr
                    key={acc.id}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition ${
                      isActive ? 'bg-amber-500/5 dark:bg-amber-500/10' : ''
                    }`}
                  >
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`p-2 rounded-xl shrink-0 ${
                            acc.type === 'merchant'
                              ? 'bg-[#19A999]/20 text-[#19A999]'
                              : 'bg-blue-500/20 text-blue-500'
                          }`}
                        >
                          {acc.type === 'merchant' ? (
                            <Building2 className="w-4 h-4" />
                          ) : (
                            <User className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {acc.name}
                            </span>
                            {isActive && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                Conta Ativa
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 font-mono">
                            Ag: {acc.agency || '0001'} • CC: {acc.account_number || '00000-0'}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          acc.type === 'merchant'
                            ? 'bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300'
                            : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        {acc.type === 'merchant' ? 'PJ Lojista' : 'PF Cliente'}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                      {acc.cpf_cnpj || '---'}
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-500 text-[11px] truncate max-w-[180px]">
                      {acc.pix_key || '---'}
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-sm text-slate-900 dark:text-slate-100">
                      R$ {Number(acc.balance || 0).toFixed(2)}
                    </td>

                    <td className="py-3 px-6 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* Botão de Impersonate / Alternar Sessão */}
                        <button
                          type="button"
                          onClick={() => handleImpersonate(acc)}
                          className={`px-2.5 py-1.5 rounded-xl font-bold text-[11px] transition flex items-center gap-1 ${
                            isActive
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'
                          }`}
                          title="Operar o Internet Banking nesta conta"
                        >
                          <Crown className="w-3 h-3 text-amber-500" />
                          <span>{isActive ? 'Operando' : 'Assumir'}</span>
                        </button>

                        {/* Botão de Ajustar Saldo */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAccForBalance(acc);
                            setNewBalanceInput(Number(acc.balance || 0).toFixed(2));
                          }}
                          className="px-2.5 py-1.5 rounded-xl font-bold text-[11px] bg-[#1367A2]/10 hover:bg-[#1367A2]/20 text-[#1367A2] dark:text-sky-400 transition flex items-center gap-1"
                          title="Ajustar saldo fictício desta conta"
                        >
                          <DollarSign className="w-3 h-3" />
                          <span>Saldo</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Ajuste de Saldo */}
      {selectedAccForBalance && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Ajuste Administrativo de Saldo
                  </h3>
                  <p className="text-[10px] text-slate-400">Ação exclusiva do Super Admin Master</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAccForBalance(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmBalanceAdjust} className="space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Conta Selecionada:</p>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {selectedAccForBalance.name}
                </p>
                <p className="text-[10px] text-slate-400 font-mono">
                  Saldo atual: R$ {Number(selectedAccForBalance.balance || 0).toFixed(2)}
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Novo Saldo Disponível (R$):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newBalanceInput}
                  onChange={(e) => setNewBalanceInput(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-base font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Justificativa / Motivo do Ajuste:
                </label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedAccForBalance(null)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAdjusting}
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-slate-950 font-black text-xs rounded-xl shadow-md disabled:opacity-50"
                >
                  {isAdjusting ? 'Gravando...' : 'Aplicar Ajuste'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
