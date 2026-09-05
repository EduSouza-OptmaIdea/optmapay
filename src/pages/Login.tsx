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
  Crown,
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

  // Super Admin Master
  const [showSuperModal, setShowSuperModal] = useState(false);
  const [superTab, setSuperTab] = useState<'login' | 'create'>('login');
  const [superEmail, setSuperEmail] = useState('edu.souza@optmaidea.com.br');
  const [superPassword, setSuperPassword] = useState('');
  const [showSuperPassword, setShowSuperPassword] = useState(false);
  const [superLoading, setSuperLoading] = useState(false);
  const [superMsg, setSuperMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSuperAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (superLoading) return;
    setSuperLoading(true);
    setSuperMsg(null);

    const emailTrimmed = superEmail.trim().toLowerCase();

    // Trava de segurança: apenas edu.souza pode ser superadmin
    if (!emailTrimmed.includes('edu.souza') && !emailTrimmed.includes('edusouza')) {
      setSuperMsg({
        type: 'error',
        text: 'Acesso restrito: Apenas o e-mail da conta edu.souza tem autorização para ser o Superusuário Master.',
      });
      setSuperLoading(false);
      return;
    }

    try {
      if (superTab === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailTrimmed,
          password: superPassword,
        });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            throw new Error('Credenciais não encontradas. Se ainda não criou esta conta mestre no Supabase, clique na aba "Criar Superusuário".');
          }
          throw error;
        }

        if (data.user) {
          navigate('/master-admin');
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: emailTrimmed,
          password: superPassword,
          options: {
            data: {
              role: 'super_admin',
              is_super_admin: true,
              account_name: 'Super Admin Master • OptmaPay',
              account_type: 'merchant',
              cpf_cnpj: '00.000.000/0001-00',
            },
          },
        });

        if (error) {
          if (error.message.includes('already registered')) {
            const { data: logData, error: logErr } = await supabase.auth.signInWithPassword({
              email: emailTrimmed,
              password: superPassword,
            });
            if (logErr) throw logErr;
            if (logData.user) {
              navigate('/master-admin');
              return;
            }
          }
          throw error;
        }

        if (data.user) {
          await supabase.auth.signInWithPassword({
            email: emailTrimmed,
            password: superPassword,
          }).catch(() => {});
          navigate('/master-admin');
        }
      }
    } catch (err: any) {
      setSuperMsg({
        type: 'error',
        text: err.message || 'Erro ao autenticar como Superusuário.',
      });
    } finally {
      setSuperLoading(false);
    }
  };

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
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2 ${
                message.type === 'success'
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

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              Ambiente de testes simulado com isolamento total de dados no Supabase.
            </span>
          </div>

          {/* Botão de Acesso Exclusivo do Superusuário da Plataforma */}
          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={() => {
                setShowSuperModal(true);
                setSuperMsg(null);
              }}
              className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 hover:from-amber-500/20 hover:to-orange-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30 text-xs font-black transition flex items-center justify-center gap-2 shadow-xs"
            >
              <Crown className="w-4 h-4 text-amber-500" />
              <span>Acesso do Superusuário Master (Gestão Global)</span>
            </button>
          </div>
        </div>
      </main>

      {/* Modal do Superusuário Master */}
      {showSuperModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-md w-full border border-amber-500/40 shadow-2xl space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Superusuário da Plataforma
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Administração global de taxas, liquidações e usuários
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSuperModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Abas: Login vs Criar Superusuário */}
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setSuperTab('login');
                  setSuperMsg(null);
                }}
                className={`flex-1 py-2 rounded-lg transition ${
                  superTab === 'login'
                    ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                Entrar como Super Admin
              </button>
              <button
                type="button"
                onClick={() => {
                  setSuperTab('create');
                  setSuperMsg(null);
                }}
                className={`flex-1 py-2 rounded-lg transition ${
                  superTab === 'create'
                    ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                Criar / Inicializar Novo
              </button>
            </div>

            {/* Aviso LGPD / Privacidade */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-[11px] text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Privacidade e Sigilo Bancário (LGPD):</span>
              </p>
              <p className="leading-tight text-slate-600 dark:text-slate-300">
                O Superusuário tem poderes para configurar taxas globais do banco e provisionar contas, mas <strong>jamais possui acesso a senhas ou PINs de outros usuários</strong>.
              </p>
            </div>

            {/* Mensagem de Feedback */}
            {superMsg && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  superMsg.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                }`}
              >
                {superMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{superMsg.text}</span>
              </div>
            )}

            {/* Formulário do Super Admin */}
            <form onSubmit={handleSuperAuth} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  E-mail do Superusuário Master:
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={superEmail}
                    onChange={(e) => setSuperEmail(e.target.value)}
                    placeholder="admin@optmaidea.com.br"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Senha Mestra:
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type={showSuperPassword ? 'text' : 'password'}
                    required
                    value={superPassword}
                    onChange={(e) => setSuperPassword(e.target.value)}
                    placeholder="Senha de acesso do master"
                    className="w-full pl-9 pr-9 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSuperPassword(!showSuperPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showSuperPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={superLoading}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {superLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>
                    {superLoading
                      ? 'Processando...'
                      : superTab === 'login'
                      ? 'Entrar no Console Super Admin'
                      : 'Criar e Ativar Novo Superusuário'}
                  </span>
                  {!superLoading && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="max-w-md w-full mx-auto text-center text-slate-500 text-[11px]">
        <p>© 2026 OptmaPay Sandbox • Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};
