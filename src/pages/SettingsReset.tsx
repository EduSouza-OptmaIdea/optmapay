import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { resetSandboxScenario } from '../lib/seedData';
import { Link } from 'react-router-dom';
import { Settings, RefreshCw, Download, ShieldAlert, CheckCircle2, ShieldCheck, Trash2 } from 'lucide-react';

export const SettingsReset: React.FC = () => {
  const { activeAccount, refreshAccounts } = useAuth();
  const [resetting, setResetting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      setMsg({ type: 'success', text: 'Cenário resetado com sucesso no Supabase para dados padrão!' });
    } else {
      setMsg({ type: 'error', text: 'Erro ao resetar cenário.' });
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
      a.download = `optmapay-backup-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      a.remove();

      setMsg({ type: 'success', text: 'Arquivo de backup completo em JSON baixado com sucesso!' });
    } catch (err: any) {
      setMsg({ type: 'error', text: `Erro ao exportar: ${err.message}` });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#19A999]" />
          Configurações & Reset de Cenário
        </h1>
        <p className="text-xs text-slate-500">
          Gerenciador de restauração de fábrica, portabilidade de dados em JSON e conformidade LGPD
        </p>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center gap-2 animate-fadeIn ${
            msg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-500 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/80 border border-rose-500 text-rose-800 dark:text-rose-200'
          }`}
        >
          {msg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Export Snapshot */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Download className="w-4 h-4 text-[#19A999]" />
          Exportar Backup Completo (JSON - Portabilidade LGPD)
        </h2>
        <p className="text-xs text-slate-500">
          Baixe um snapshot completo em arquivo JSON contendo todas as contas, transações, cartões e boletos fictícios para manter seu histórico ou importar em outros ambientes.
        </p>

        <button
          onClick={handleExportJson}
          disabled={exporting}
          className="py-2.5 px-4 bg-[#19A999] hover:bg-[#158f81] text-white font-bold text-xs rounded-xl transition flex items-center gap-2 shadow-sm disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span>{exporting ? 'Gerando JSON...' : 'Baixar Snapshot Completo (JSON)'}</span>
        </button>
      </div>

      {/* Reset de Fábrica */}
      <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 space-y-4 text-rose-900 dark:text-rose-200">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          <h2 className="text-sm font-bold text-rose-800 dark:text-rose-200">
            Zona de Manutenção: Reset de Fábrica do Sandbox
          </h2>
        </div>

        <p className="text-xs text-rose-800/80 dark:text-rose-300 leading-relaxed">
          Esta ação irá limpar todos os lançamentos e repopular o banco de dados Supabase com as contas de teste padrão da OptmaIdea (Empresa + Clientes).
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

      {/* Legal and Privacy Links */}
      <div className="text-center text-xs text-slate-500 dark:text-slate-400 space-x-4 pt-4 border-t border-slate-200 dark:border-slate-800">
        <Link to="/termos-de-uso" className="hover:text-[#F1613A] hover:underline">
          Termos de Uso do Sandbox
        </Link>
        <span>•</span>
        <Link to="/politica-de-privacidade" className="hover:text-[#19A999] hover:underline">
          Política de Privacidade & LGPD
        </Link>
      </div>
    </div>
  );
};
