import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { exportAccountDataJson } from '../lib/supabase/accountService';
import {
  User,
  ShieldCheck,
  Building2,
  CheckCircle2,
  AlertCircle,
  Download,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
  Clock,
} from 'lucide-react';

export const MyProfile: React.FC = () => {
  const { user, activeAccount } = useAuth();
  
  // Alteração de senha in-app direta via supabase.auth.updateUser
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [exportingId, setExportingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const generateStrongPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?_';
    let pass = '';
    for (let i = 0; i < 14; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pass);
    setConfirmPassword(pass);
    setShowPassword(true);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPasswordError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas digitadas não coincidem.');
      return;
    }

    setUpdatingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(false);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.message || 'Erro ao atualizar a senha.');
    } finally {
      setUpdatingPassword(false);
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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <User className="w-5 h-5 text-[#19A999]" />
          Meus Dados & Perfil do Operador
        </h1>
        <p className="text-xs text-slate-500">
          Consulte suas informações cadastrais, altere sua senha de acesso e baixe backups em JSON
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

      {/* Dados Básicos da Conta */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#19A999]/20 text-[#19A999] flex items-center justify-center font-bold text-lg border border-[#19A999]/30">
              {activeAccount?.type === 'merchant' ? (
                <Building2 className="w-6 h-6" />
              ) : (
                <User className="w-6 h-6" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {activeAccount?.name || user?.email || 'Titular da Conta'}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {activeAccount?.type === 'merchant' ? 'Pessoa Jurídica (PJ)' : 'Pessoa Física (PF)'} • ID: {user?.id}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 text-[#19A999] text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Sessão Protegida</span>
          </div>
        </div>

        {/* 60 Days Statement Notice Banner */}
        <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-900 dark:text-teal-200 space-y-1.5">
          <p className="font-bold flex items-center gap-1.5 text-teal-800 dark:text-teal-300">
            <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            Política do Extrato de Transações (60 Dias)
          </p>
          <p className="text-[11px] text-teal-800/90 dark:text-teal-200/90 leading-relaxed">
            O histórico do extrato armazena lançamentos de até <strong>60 dias</strong> da data atual. O saldo da sua conta e seus dados permanecem preservados permanentemente.
          </p>
        </div>

        {/* Informações Cadastrais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Nome do Titular ou Razão Social
            </label>
            <input
              type="text"
              readOnly
              value={activeAccount?.name || ''}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 select-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              {activeAccount?.type === 'merchant' ? 'CNPJ Fictício' : 'CPF Fictício'}
            </label>
            <input
              type="text"
              readOnly
              value={activeAccount?.cpf_cnpj || ''}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200 select-all"
            />
          </div>

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
              Chave Pix Vinculada
            </label>
            <input
              type="text"
              readOnly
              value={activeAccount?.pix_key || user?.email || ''}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-teal-700 dark:text-[#19A999] font-bold select-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Agência / Conta
            </label>
            <input
              type="text"
              readOnly
              value={activeAccount ? `Agência: ${activeAccount.agency} • Conta: ${activeAccount.account_number}` : ''}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Saldo Atual Fictício
            </label>
            <input
              type="text"
              readOnly
              value={activeAccount ? `R$ ${activeAccount.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-emerald-600 dark:text-emerald-400 font-extrabold"
            />
          </div>
        </div>

        {/* Botão de Backup JSON */}
        {activeAccount && (
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => handleExportBackup(activeAccount.id, activeAccount.name)}
              disabled={exportingId === activeAccount.id}
              className="py-2 px-3.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 text-[#19A999]" />
              <span>Baixar Backup Completo em JSON</span>
            </button>
          </div>
        )}
      </div>

      {/* Alterar Senha Diretamente na Tela */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#F1613A]" />
              Alterar Senha de Acesso
            </h2>
            <p className="text-xs text-slate-500">
              Atualize sua senha de operador imediatamente sem precisar sair da plataforma
            </p>
          </div>

          <button
            type="button"
            onClick={generateStrongPassword}
            className="text-xs text-[#19A999] hover:underline font-bold flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sugerir Senha Forte ✨</span>
          </button>
        </div>

        <form onSubmit={handleUpdatePassword} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Nova Senha (Mínimo 6 caracteres)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono pr-10 focus:ring-2 focus:ring-[#19A999] outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Confirmar Nova Senha
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono focus:ring-2 focus:ring-[#19A999] outline-none"
                required
              />
            </div>
          </div>

          {passwordSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-500 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Sua senha foi atualizada com sucesso no Supabase!</span>
            </div>
          )}

          {passwordError && (
            <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={updatingPassword || !newPassword}
            className="py-2.5 px-5 bg-[#F1613A] hover:bg-[#d94f2a] text-white font-bold text-xs rounded-xl transition shadow-md shadow-orange-950/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {updatingPassword && <RefreshCw className="w-4 h-4 animate-spin" />}
            <span>{updatingPassword ? 'Atualizando Senha...' : 'Salvar Nova Senha'}</span>
          </button>
        </form>
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
