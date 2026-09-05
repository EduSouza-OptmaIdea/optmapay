import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import {
  Mail,
  Lock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  KeyRound,
  UserPlus,
} from 'lucide-react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/dashboard');
    }
  }, [authLoading, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
        if (data.user) {
          navigate('/dashboard');
        }
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) {
          if (error.message.includes('security') || error.message.includes('429') || error.status === 429) {
            throw new Error('Muitas tentativas em curto intervalo. Aguarde alguns instantes.');
          }
          throw error;
        }

        setMessage({
          type: 'success',
          text: 'Instruções de recuperação enviadas para seu e-mail! Verifique sua caixa de entrada e clique no link para redefinir sua senha.',
        });
      }
    } catch (err: any) {
      let friendlyMessage = err.message || 'Erro ao realizar autenticação.';
      if (friendlyMessage.includes('Invalid login credentials')) {
        friendlyMessage = 'E-mail ou senha incorretos. Verifique os dados digitados ou confirme se sua conta já foi ativada por e-mail.';
      } else if (friendlyMessage.includes('Email not confirmed')) {
        friendlyMessage = 'Seu endereço de e-mail ainda não foi confirmado. Verifique sua caixa de entrada e clique no link de ativação recebido.';
      } else if (friendlyMessage.includes('security') || friendlyMessage.includes('429') || friendlyMessage.includes('rate limit')) {
        friendlyMessage = 'Muitas tentativas em curto intervalo. Por segurança, aguarde cerca de 30 segundos.';
      }

      setMessage({
        type: 'error',
        text: friendlyMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 flex flex-col justify-between p-4 sm:p-8 selection:bg-[#F1613A] selection:text-white">
      {/* Header */}
      <header className="max-w-md w-full mx-auto flex items-center justify-between py-2">
        <Link to="/">
          <Logo heightClass="h-9" />
        </Link>
        <Link
          to="/"
          className="text-xs text-[#19A999] hover:underline font-semibold flex items-center gap-1"
        >
          <span>Página Inicial</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      {/* Main Card */}
      <main className="max-w-md w-full mx-auto my-8">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">

          <div className="space-y-1 text-center">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {mode === 'signin' ? 'Acessar Conta' : 'Recuperar Senha'}
            </h1>
            <p className="text-xs text-slate-500">
              {mode === 'signin'
                ? 'Insira suas credenciais cadastradas para entrar no Internet Banking'
                : 'Informe seu e-mail cadastrado para redefinir a senha'}
            </p>
          </div>

          {/* Feedback Messages */}
          {message && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2 ${message.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                E-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@empresa.com.br"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#F1613A] outline-none"
                />
              </div>
            </div>

            {mode === 'signin' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setMessage(null);
                    }}
                    className="text-[11px] text-[#19A999] hover:underline font-semibold flex items-center gap-1"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>Esqueci minha senha</span>
                  </button>
                </div>

                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Sua senha de acesso"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#F1613A] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#F1613A] hover:bg-[#d94f2a] text-white font-bold text-xs rounded-xl transition shadow-lg shadow-orange-950/20 flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Consultando...' : mode === 'signin' ? 'Entrar no Internet Banking' : 'Enviar Link de Recuperação'}</span>
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>

            {mode === 'forgot' && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setMessage(null);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-semibold"
                >
                  ← Voltar para Acessar Conta
                </button>
              </div>
            )}
          </form>

          {/* Link para Criar Conta */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-700 text-center space-y-2">
            <p className="text-xs text-slate-500">Ainda não possui uma conta sandbox?</p>
            <Link
              to="/signup"
              className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold text-xs transition flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4 text-[#19A999]" />
              <span>Criar Conta de Teste Grátis</span>
            </Link>
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2.5 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <span>
              Conta sem utilização de valores reais, utilizável exclusivamente para testes de desenvolvimento e fins educativos. Não configura instituição financeira ou arranjo de pagamento autorizado pelo BACEN (Lei nº 4.595/1964 e Lei nº 12.865/2013).
            </span>
          </div>
        </div>
      </main>

      <footer className="max-w-md w-full mx-auto text-center text-slate-500 text-[11px]">
        <p>© 2026 OptmaPay Sandbox • Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};
