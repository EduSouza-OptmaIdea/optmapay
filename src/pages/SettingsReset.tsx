import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { resetSandboxScenario } from '../lib/seedData';
import { Settings, RefreshCw, Download, Upload, ShieldAlert, CheckCircle } from 'lucide-react';

export const SettingsReset: React.FC = () => {
  const { activeAccount, refreshAccounts } = useAuth();
  const [resetting, setResetting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!activeAccount) return null;

  const handleResetScenario = async () => {
    if (
      !window.confirm(
        'ATENÇÃO: Deseja realmente resetar o cenário do Sandbox? Todas as transações, boletos, cartões e logs cadastrados serão apagados e repopulados com os dados padrão de fábrica!'
      )
    ) {
      return;
    }

    setResetting(true);
    setMsg(null);

    const ok = await resetSandboxScenario(activeAccount.user_id);
    await refreshAccounts();

    setResetting(false);
    if (ok) {
      setMsg('✅ Cenário resetado com sucesso no Supabase para dados padrão!');
    } else {
      setMsg('❌ Erro ao resetar cenário.');
    }
  };

  const handleExportJson = async () => {
    setExporting(true);
    try {
      const userId = activeAccount.user_id;
      const getQuery = (table: string) => {
        let q = supabase.from(table).select('*');
        if (userId) q = q.eq('user_id', userId);
        return q;
      };

      const { data: accounts } = await getQuery('accounts');
      const { data: transactions } = await getQuery('transactions');
      const { data: boletos } = await getQuery('boletos');
      const { data: cartoes } = await getQuery('cartoes');
      const { data: webhooks } = await getQuery('webhooks_config');

      const dump = {
        app: 'optmapay-sandbox',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        realMoney: false,
        environment: 'sandbox',
        data: {
          accounts,
          transactions,
          boletos,
          cartoes,
          webhooks,
        },
      };

      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `optmapay-sandbox-export-${Date.now()}.json`;
      a.click();

      setMsg('✅ Exportação concluída com sucesso!');
    } catch (err: any) {
      setMsg(`❌ Erro ao exportar: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Settings className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          Configurações & Reset de Cenário
        </h1>
        <p className="text-xs text-slate-500">
          Gerenciador de restauração de fábrica e portabilidade de dados em JSON
        </p>
      </div>

      {msg && (
        <div className="p-3 rounded-xl bg-slate-900 text-white font-mono text-xs shadow-md">
          {msg}
        </div>
      )}

      {/* Export / Import */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Download className="w-4 h-4 text-teal-600" />
          Exportar Cenário para Outra Máquina (JSON)
        </h2>
        <p className="text-xs text-slate-500">
          Baixe um snapshot completo em arquivo JSON contendo todas as contas, transações, cartões e boletos fictícios para importar em outros ambientes de desenvolvimento.
        </p>

        <button
          onClick={handleExportJson}
          disabled={exporting}
          className="py-2.5 px-4 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-2 shadow-md shadow-teal-900/20 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span>{exporting ? 'Gerando JSON...' : 'Exportar Snapshot (JSON)'}</span>
        </button>
      </div>

      {/* Reset de Fábrica */}
      <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 space-y-4 text-rose-900 dark:text-rose-200">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          <h2 className="text-sm font-bold text-rose-800 dark:text-rose-200">
            Zona de Perigo: Reset de Fábrica do Supabase
          </h2>
        </div>

        <p className="text-xs text-rose-800/80 dark:text-rose-300">
          Esta ação irá apagar permanentemente todos os lançamentos, cartões e boletos criados nesta conta e repopular o banco do Supabase com as contas de teste padrão da OptmaIdea (Empresa + Pseudo Clientes).
        </p>

        <button
          onClick={handleResetScenario}
          disabled={resetting}
          className="py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-2 shadow-lg shadow-rose-950/20 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
          <span>{resetting ? 'Resetando Banco Supabase...' : 'Resetar Cenário para Dados Padrão'}</span>
        </button>
      </div>
    </div>
  );
};
