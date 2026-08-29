import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';
import { deleteSandboxAccountRPC, exportAccountDataJson } from '../lib/supabase/accountService';
import {
  User,
  ShieldCheck,
  Building2,
  CheckCircle2,
  PlusCircle,
  AlertCircle,
  Check,
  Send,
  Download,
  Trash2,
  Clock,
  Lock,
} from 'lucide-react';

export const MyProfile: React.FC = () => {
  const navigate = useNavigate();
  const { user, accounts, activeAccount, setActiveAccountId, refreshAccounts } = useAuth();
  
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);
  const [errorReset, setErrorReset] = useState<string | null>(null);

  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSendPasswordReset = async () => {
    if (!user?.email) return;
    setLoadingReset(true);
    setErrorReset(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/login`,
      });

      if (error) throw error;
      setResetEmailSent(true);
    } catch (err: any) {
      setErrorReset(err.message || 'Erro ao enviar e-mail de redefinição.');
    } finally {
      setLoadingReset(false);
    }
  };

  const handleExportBackup = async (accountId: string, accountName: string) => {
    setExportingId(accountId);
    try {
      const data = await exportAccountDataJson(accountId);
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute(
        'download',
        `optmapay-backup-${accountName.toLowerCase().replace(/[^a-z0-9]/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setActionMessage({
        type: 'success',
        text: `Backup em JSON da conta "${accountName}" baixado com sucesso!`,
      });
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Falha ao gerar arquivo de backup.',
      });
    } finally {
      setExportingId(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (!accountToDelete) return;
    setIsDeleting(true);
    setActionMessage(null);

    try {
      await deleteSandboxAccountRPC(accountToDelete);
      await refreshAccounts();
      setActionMessage({
        type: 'success',
        text: 'Conta sandbox e todos os seus dados foram permanentemente excluídos (LGPD).',
      });
      setAccountToDelete(null);
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Falha ao excluir a conta sandbox.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <User className="w-5 h-5 text-[#19A999]" />
          Meus Dados & Perfil do Operador
        </h1>
        <p className="text-xs text-slate-500">
          Gerencie suas credenciais de acesso, backup em JSON e as contas bancárias sandbox vinculadas
        </p>
      </div>

      {actionMessage && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center gap-2.5 animate-fadeIn ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-500 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/80 border border-rose-500 text-rose-800 dark:text-rose-200'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* User Information Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#19A999]/20 text-[#19A999] flex items-center justify-center font-bold text-lg border border-[#19A999]/30">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {user?.email || 'Operador Sandbox'}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                ID Operador: {user?.id || '00000000-0000-0000-0000-000000000001'}
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 text-[#19A999] text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Sessão Protegida</span>
          </div>
        </div>

        {/* 60 Days Retention Alert Banner */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 space-y-2">
          <p className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            Política de Retenção de 60 Dias & Backup em JSON
          </p>
          <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
            No plano gratuito, dados de testes permanecem salvos por <strong>60 dias</strong>. Dispararemos avisos por e-mail com 7, 2 e 1 dia de antecedência. Você pode exportar o arquivo de backup em JSON a qualquer momento abaixo para preservar seus extratos e configurações.
          </p>
        </div>

        {/* Account Details Form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              E-mail Autenticado
            </label>
            <input
              type="text"
              readOnly
              value={user?.email || ''}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300 select-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Último Acesso
            </label>
            <input
              type="text"
              readOnly
              value={user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('pt-BR') : 'Sessão Ativa'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300"
            />
          </div>
        </div>

        {/* Password Reset Action */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Segurança da Senha</p>
            <p className="text-[11px] text-slate-500">Envie um e-mail para redefinir sua senha de acesso</p>
          </div>

          <button
            type="button"
            onClick={handleSendPasswordReset}
            disabled={loadingReset || resetEmailSent}
            className="w-full sm:w-auto py-2 px-4 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            {resetEmailSent ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>E-mail de Redefinição Enviado!</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5 text-[#F1613A]" />
                <span>{loadingReset ? 'Enviando...' : 'Redefinir Senha por E-mail'}</span>
              </>
            )}
          </button>
        </div>

        {errorReset && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorReset}</span>
          </div>
        )}
      </div>

      {/* Linked Bank Accounts */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#19A999]" />
              Contas Bancárias Sandbox Vinculadas
            </h2>
            <p className="text-xs text-slate-500">
              Alterne a conta ativa, baixe backups em JSON ou exclua contas definitivamente
            </p>
          </div>

          <button
            onClick={() => navigate('/onboarding')}
            className="py-1.5 px-3 bg-[#F1613A] hover:bg-[#d94f2a] text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Nova Conta</span>
          </button>
        </div>

        <div className="space-y-3 pt-2">
          {accounts.map((acc) => {
            const isActive = acc.id === activeAccount?.id;
            return (
              <div
                key={acc.id}
                className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isActive
                    ? 'bg-teal-50/50 dark:bg-teal-950/40 border-[#19A999] ring-2 ring-[#19A999]/20'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl text-white ${acc.type === 'merchant' ? 'bg-[#19A999]' : 'bg-blue-600'}`}>
                    {acc.type === 'merchant' ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{acc.name}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {acc.type === 'merchant' ? 'Empresa (Merchant)' : 'Cliente (Customer)'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      Agência: {acc.agency} • Conta: {acc.account_number} • Chave Pix: {acc.pix_key}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 dark:border-slate-800">
                  <div className="text-left sm:text-right mr-2">
                    <span className="text-[10px] text-slate-400 uppercase block">Saldo</span>
                    <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                      R$ {acc.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Backup JSON button */}
                  <button
                    type="button"
                    onClick={() => handleExportBackup(acc.id, acc.name)}
                    disabled={exportingId === acc.id}
                    className="p-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold transition"
                    title="Baixar Backup Completo em JSON (LGPD / Portabilidade)"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  {/* Delete Account button */}
                  <button
                    type="button"
                    onClick={() => setAccountToDelete(acc.id)}
                    className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-600 dark:text-rose-400 text-xs font-semibold transition"
                    title="Excluir Conta e Dados em Cascata (LGPD)"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  {isActive ? (
                    <span className="py-1 px-2.5 rounded-lg bg-[#19A999]/20 text-[#19A999] text-xs font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ativa
                    </span>
                  ) : (
                    <button
                      onClick={() => setActiveAccountId(acc.id)}
                      className="py-1.5 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition"
                    >
                      Tornar Ativa
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirmation Modal for Account Deletion */}
      {accountToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5">
            <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-500 w-fit">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Excluir Conta Sandbox Definitivamente?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Esta ação executará uma purga atômica no banco de dados via RPC. Todas as transações, boletos emitidos, cartões virtuais e webhooks serão <strong>permanentemente eliminados</strong> sem possibilidade de recuperação.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAccountToDelete(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition shadow-lg shadow-rose-950/20 flex items-center justify-center gap-1.5"
              >
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
        <span>•</span>
        <a
          href="https://optmaidea.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#F1613A] hover:underline inline-flex items-center gap-1"
        >
          <span>OptmaIdea</span>
        </a>
      </div>
    </div>
  );
};
