import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { deleteSandboxAccountRPC, exportAccountDataJson } from '../lib/supabase/accountService';
import { sendAccountDeletedEmail } from '../lib/email/app-email';
import {
  Settings,
  Download,
  ShieldAlert,
  CheckCircle2,
  Trash2,
  AlertCircle,
  RefreshCw,
  Home,
  LogOut,
  Building2,
  User,
} from 'lucide-react';

export const SettingsReset: React.FC = () => {
  const navigate = useNavigate();
  const { user, activeAccount, refreshAccounts, signOut } = useAuth();

  const [exporting, setExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [accountDeletedSuccess, setAccountDeletedSuccess] = useState(false);
  const [deletedAccountName, setDeletedAccountName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (accountDeletedSuccess) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 text-center space-y-6 shadow-2xl animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center">
            <Trash2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              Conta Excluída com Sucesso
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              A conta <strong>"{deletedAccountName}"</strong> e todas as suas transações, boletos, cartões e registros foram permanentemente eliminados do banco de dados em conformidade com as regras de privacidade e LGPD.
            </p>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/"
              className="w-full sm:w-auto py-2.5 px-6 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-bold transition flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              <span>Página Inicial</span>
            </Link>

            <Link
              to="/login"
              className="w-full sm:w-auto py-2.5 px-6 rounded-xl bg-[#F1613A] hover:bg-[#d94f2a] text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-orange-950/20"
            >
              <LogOut className="w-4 h-4" />
              <span>Acessar com Nova Conta</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!activeAccount) {
    return (
      <div className="p-8 text-center text-slate-500">
        Carregando dados da conta...
      </div>
    );
  }

  const handleExportJson = async () => {
    setExporting(true);
    setErrorMessage(null);
    try {
      const data = await exportAccountDataJson(activeAccount.id);
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute(
        'download',
        `optmapay-backup-${activeAccount.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao exportar backup em JSON.');
    } finally {
      setExporting(false);
    }
  };

  const handleCascadeDelete = async () => {
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const accName = activeAccount.name;
      setDeletedAccountName(accName);

      // Dispara e-mail de aviso de conta excluída via SMTP Brevo se o usuário possuir e-mail
      if (user?.email) {
        sendAccountDeletedEmail({
          to: user.email,
          fullName: user.user_metadata?.full_name || user.email.split('@')[0],
          accountName: accName,
        }).catch((e) => console.warn('Falha ao disparar e-mail de despedida:', e));
      }

      // Exclusão atômica via RPC no PostgreSQL
      await deleteSandboxAccountRPC(activeAccount.id);

      setShowConfirmModal(false);
      setAccountDeletedSuccess(true);
      await signOut();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao excluir conta bancária.');
      setIsDeleting(false);
      setShowConfirmModal(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#19A999]" />
          Configurações & Exclusão da Conta
        </h1>
        <p className="text-xs text-slate-500">
          Gerenciamento de backup, portabilidade de dados e encerramento definitivo da conta sandbox
        </p>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/80 border border-rose-500 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Conta Selecionada Atual */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-3 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
          Conta Sandbox Atual
        </h2>
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl text-white ${activeAccount.type === 'merchant' ? 'bg-[#19A999]' : 'bg-blue-600'}`}>
              {activeAccount.type === 'merchant' ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div>
              <p className="font-bold text-sm text-slate-900 dark:text-slate-100">{activeAccount.name}</p>
              <p className="text-xs text-slate-400 font-mono">
                Agência: {activeAccount.agency} • Conta: {activeAccount.account_number} • CPF/CNPJ: {activeAccount.cpf_cnpj}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 uppercase block">Saldo</span>
            <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
              R$ {activeAccount.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Export Snapshot */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Download className="w-4 h-4 text-[#19A999]" />
          Exportar Backup Completo (JSON - Portabilidade LGPD)
        </h2>
        <p className="text-xs text-slate-500">
          Baixe um snapshot completo em arquivo JSON contendo todos os lançamentos, cartões, boletos e webhooks desta conta antes de realizar qualquer alteração.
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

      {/* Exclusão da Conta em Cascata */}
      <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 space-y-4 text-rose-900 dark:text-rose-200">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          <h2 className="text-sm font-bold text-rose-800 dark:text-rose-200">
            Zona Crítica: Excluir Conta Atual em Cascata (LGPD)
          </h2>
        </div>

        <p className="text-xs text-rose-800/80 dark:text-rose-300 leading-relaxed">
          Esta operação executará uma exclusão permanente no banco de dados. Todas as transações, boletos emitidos, cartões virtuais e configurações da conta <strong>"{activeAccount.name}"</strong> serão permanentemente eliminados.
        </p>

        <button
          onClick={() => setShowConfirmModal(true)}
          className="py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-2 shadow-lg shadow-rose-950/20"
        >
          <Trash2 className="w-4 h-4" />
          <span>Excluir Esta Conta Sandbox em Cascata</span>
        </button>
      </div>

      {/* Modal de Confirmação de Exclusão */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5">
            <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-500 w-fit">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Confirmar Exclusão em Cascata?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Você tem certeza que deseja excluir permanentemente a conta <strong>"{activeAccount.name}"</strong> e todos os registros associados? Esta ação não pode ser desfeita.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCascadeDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition shadow-lg shadow-rose-950/20 flex items-center justify-center gap-1.5"
              >
                {isDeleting && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>{isDeleting ? 'Excluindo...' : 'Sim, Excluir Conta'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
