import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  ShieldCheck,
  Building2,
  CheckCircle2,
  Key,
  PlusCircle,
  AlertCircle,
  Check,
  Send,
} from 'lucide-react';

export const MyProfile: React.FC = () => {
  const navigate = useNavigate();
  const { user, accounts, activeAccount, setActiveAccountId } = useAuth();
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);
  const [errorReset, setErrorReset] = useState<string | null>(null);

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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <User className="w-5 h-5 text-[#19A999]" />
          Meus Dados & Perfil do Operador
        </h1>
        <p className="text-xs text-slate-500">
          Gerencie as credenciais de acesso e visualize as contas bancárias sandbox vinculadas à sua sessão
        </p>
      </div>

      {/* User Information Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-6 shadow-sm">
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

        {/* Informative Alert about Valid Email */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 space-y-2">
          <p className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            Importante sobre o E-mail de Autenticação
          </p>
          <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
            Para receber links mágicos e confirmações de redefinição de senha via SMTP (Brevo / Supabase Auth), certifique-se de utilizar um <strong>e-mail válido</strong>. Para testes rápidos sem envio de e-mail, você também pode criar contas com e-mail e senha diretamente no formulário de cadastro.
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
              Alterne a conta ativa para operar no Internet Banking ou cadastre novas contas
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

                <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 dark:border-slate-800">
                  <div className="text-left sm:text-right">
                    <span className="text-[10px] text-slate-400 uppercase block">Saldo Fictício</span>
                    <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                      R$ {acc.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

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
    </div>
  );
};
