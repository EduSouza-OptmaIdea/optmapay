import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { SandboxCard, SettlementPlanType } from '../types/sandbox';
import { VirtualPosMachine } from '../components/VirtualPosMachine';
import {
  Smartphone,
  Building2,
  Zap,
  Clock,
  ShieldCheck,
  AlertCircle,
  CreditCard,
} from 'lucide-react';

export const PosMachineArea: React.FC = () => {
  const { activeAccount, accounts, refreshAccounts } = useAuth();
  const [cards, setCards] = useState<SandboxCard[]>([]);
  const [currentPlan, setCurrentPlan] = useState<SettlementPlanType>('standard');
  const [loading, setLoading] = useState(false);

  // Sincroniza plano configurado na conta ativa
  useEffect(() => {
    if (activeAccount?.config?.settlement_plan) {
      setCurrentPlan(activeAccount.config.settlement_plan as SettlementPlanType);
    }
  }, [activeAccount]);

  const fetchCards = async () => {
    if (!activeAccount) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('cartoes')
      .select('*')
      .eq('account_id', activeAccount.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setCards(data as SandboxCard[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCards();
  }, [activeAccount?.id]);

  const handlePlanChange = async (newPlan: SettlementPlanType) => {
    setCurrentPlan(newPlan);
    if (!activeAccount) return;
    try {
      const updatedConfig = {
        ...(activeAccount.config || {}),
        settlement_plan: newPlan,
      };
      await supabase
        .from('accounts')
        .update({ config: updatedConfig })
        .eq('id', activeAccount.id);

      await refreshAccounts();
    } catch (e) {
      console.warn('Erro ao salvar plano na conta:', e);
    }
  };

  if (!activeAccount) return null;

  const isOntime = currentPlan === 'ontime' || currentPlan === 'nitro';
  const allowsDebit = currentPlan === 'standard' || currentPlan === 'd1' || isOntime;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header do Terminal POS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-[#19A999]">
              <Smartphone className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Maquininha Smart POS Virtual
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Terminal de vendas com processamento por Chip, Aproximação (NFC), Débito e Crédito Parcelado.
          </p>
        </div>

        {/* Informações da Conta Credora (Recebedora) */}
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center gap-3 text-xs">
          <Building2 className="w-4 h-4 text-teal-600 shrink-0" />
          <div>
            <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
              Estabelecimento Credor (Recebedor)
            </span>
            <p className="font-bold text-slate-800 dark:text-slate-100">{activeAccount.name}</p>
            <p className="text-[10px] text-slate-400 font-mono">
              Ag: {activeAccount.agency} • CC: {activeAccount.account_number}
            </p>
          </div>
        </div>
      </div>

      {/* Alerta de Regra de Negócio: Débito e Planos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900/60 flex items-start gap-3 text-xs text-teal-900 dark:text-teal-200">
          {isOntime ? (
            <Zap className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          ) : (
            <Clock className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold">Plano de Liquidação Atual:</span>
              <span className="px-2 py-0.5 rounded-full bg-teal-200 dark:bg-teal-900 text-[10px] font-extrabold uppercase">
                {isOntime ? '⚡ OnTime (D+0)' : currentPlan.toUpperCase()}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-teal-800 dark:text-teal-300">
              {isOntime
                ? 'Vendas de crédito e débito liberam saldo imediatamente na conta corrente.'
                : 'Vendas de crédito e débito geram lançamentos futuros liquidados no próximo dia útil às 06h00.'}
            </p>
          </div>
        </div>

        <div className={`p-4 rounded-2xl border flex items-start gap-3 text-xs ${
          allowsDebit
            ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200'
        }`}>
          <ShieldCheck className="w-5 h-5 text-[#19A999] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold">Regra Bancária de Vendas a Débito:</span>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {allowsDebit
                ? '✅ Venda a débito habilitada (liberação via D+1 ou OnTime).'
                : '⚠️ Venda a débito indisponível para este plano. Débito é aceito exclusivamente nos planos D+1 ou OnTime.'}
            </p>
          </div>
        </div>
      </div>

      {/* Maquininha Virtual */}
      <VirtualPosMachine
        activeAccount={activeAccount}
        allAccounts={accounts}
        savedCards={cards}
        currentPlan={currentPlan}
        onPlanChange={handlePlanChange}
        onTransactionSuccess={() => {
          fetchCards();
          refreshAccounts();
        }}
      />
    </div>
  );
};
