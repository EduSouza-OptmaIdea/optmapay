import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
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
  Sparkles,
  Eye,
  EyeOff,
  RefreshCw,
  Inbox,
  KeyRound,
} from 'lucide-react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const isSignupDefault = searchParams.get('signup') === 'true';
  const isForgotDefault = searchParams.get('forgot') === 'true';
  
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(
    isForgotDefault ? 'forgot' : isSignupDefault ? 'signup' : 'signin'
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Estado de confirmação de e-mail pendente
  const [signupSubmittedEmail, setSignupSubmittedEmail] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Timer de cooldown para reenvio de e-mail
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Gerador de Senha Forte
  const generateStrongPassword = () => {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnopqrstuvwxyz';
    const numbers = '23456789';
    const symbols = '!@#$%&*?_';

    let generated = '';
    generated += uppercase[Math.floor(Math.random() * uppercase.length)];
    generated += lowercase[Math.floor(Math.random() * lowercase.length)];
    generated += numbers[Math.floor(Math.random() * numbers.length)];
    generated += symbols[Math.floor(Math.random() * symbols.length)];

    const allChars = uppercase + lowercase + numbers + symbols;
    for (let i = 4; i < 14; i++) {
      generated += allChars[Math.floor(Math.random() * allChars.length)];
    }

    const shuffled = generated
      .split('')
      .sort(() => 0.5 - Math.random())
      .join('');

    setPassword(shuffled);
    setShowPassword(true);
    setCopiedPassword(true);
    navigator.clipboard.writeText(shuffled);
    setTimeout(() => setCopiedPassword(false), 2500);
  };

  // Cálculo da Força da Senha
  const calculatePasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };

  const passwordStrength = calculatePasswordStrength(password);

  const getStrengthLabel = (score: number) => {
    if (!password) return { label: '', color: 'bg-slate-200 dark:bg-slate-700', text: '' };
    if (score <= 1) return { label: 'Fraca', color: 'bg-rose-500', text: 'text-rose-500' };
    if (score === 2) return { label: 'Razoável', color: 'bg-amber-500', text: 'text-amber-500' };
    if (score === 3) return { label: 'Forte', color: 'bg-teal-500', text: 'text-teal-500' };
    return { label: 'Muito Forte', color: 'bg-[#19A999]', text: 'text-[#19A999]' };
  };

  const strength = getStrengthLabel(passwordStrength);

  const handleResendSignupEmail = async () => {
    if (!signupSubmittedEmail || resendCooldown > 0) return;
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: signupSubmittedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        if (error.message.includes('security') || error.message.includes('429') || error.status === 429) {
          throw new Error('Por segurança, aguarde alguns segundos antes de solicitar um novo e-mail.');
        }
        throw error;
      }

      setResendCooldown(60);
      setMessage({
        type: 'success',
        text: 'Novo e-mail de confirmação enviado com sucesso!',
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Erro ao reenviar confirmação.',
      });
    } finally {
      setLoading(false);
    }
  };

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
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });

        if (error) {
          if (error.message.includes('security') || error.message.includes('429') || error.status === 429) {
            throw new Error('Muitas tentativas em curto intervalo. Aguarde cerca de 30 segundos antes de tentar novamente.');
          }
          throw error;
        }

        // Se o Supabase retornou identidades vazias, o e-mail já existe
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMessage({
            type: 'error',
            text: 'Este e-mail já está cadastrado no sistema. Vá para a aba "Entrar" para acessar ou use a recuperação de senha.',
          });
          return;
        }

        if (data.session) {
          navigate('/dashboard');
        } else {
          // Confirmação de e-mail requerida pelo Supabase
          setSignupSubmittedEmail(email.trim());
          setResendCooldown(60);
        }
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) {
          if (error.message.includes('security') || error.message.includes('429') || error.status === 429) {
            throw new Error('Muitas tentativas em curto intervalo. Aguarde alguns instantes antes de solicitar novamente.');
          }
          throw error;
        }

        setMessage({
          type: 'success',
          text: 'Instruções de recuperação enviadas para seu e-mail! Verifique sua caixa de entrada (e pasta de spam) e clique no link recebido para cadastrar sua nova senha.',
        });
      }
    } catch (err: any) {
      let friendlyMessage = err.message || 'Erro ao realizar autenticação.';
      if (friendlyMessage.includes('Invalid login credentials')) {
        friendlyMessage = 'E-mail ou senha incorretos. Verifique os dados digitados ou confirme se sua conta já foi ativada por e-mail.';
      } else if (friendlyMessage.includes('Email not confirmed')) {
        friendlyMessage = 'Seu endereço de e-mail ainda não foi confirmado. Verifique sua caixa de entrada e clique no link recebido.';
      } else if (friendlyMessage.includes('User already registered')) {
        friendlyMessage = 'Este e-mail já possui cadastro. Faça login ou recupere sua senha.';
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
          <span>Voltar ao Início</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      {/* Main Login Card */}
      <main className="max-w-md w-full mx-auto my-8">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
          
          {/* TELA DE SUCESSO DE CADASTRO COM ORIENTAÇÃO CLARA */}
          {signupSubmittedEmail ? (
            <div className="space-y-6 text-center animate-fadeIn">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                <Inbox className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Quase lá! Verifique seu E-mail
                </h1>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Enviamos uma mensagem de confirmação para o endereço:
                </p>
                <div className="inline-block px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 font-mono font-bold text-xs text-[#F1613A]">
                  {signupSubmittedEmail}
                </div>
              </div>

              {/* Feedback interno */}
              {message && (
                <div
                  className={`p-3.5 rounded-xl text-xs flex items-start gap-2 text-left ${
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

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 text-left space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-[#19A999]" />
                  <span>Dicas importantes:</span>
                </p>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <li>Clique no botão <strong>"Confirmar minha conta"</strong> no e-mail recebido.</li>
                  <li>Verifique também sua caixa de <strong>Spam</strong> ou <strong>Lixo Eletrônico</strong>.</li>
                </ul>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={handleResendSignupEmail}
                  disabled={loading || resendCooldown > 0}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>
                    {resendCooldown > 0
                      ? `Reenviar confirmação em ${resendCooldown}s`
                      : 'Reenviar E-mail de Confirmação'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSignupSubmittedEmail(null);
                    setMode('signin');
                    setMessage(null);
                  }}
                  className="w-full py-3 bg-[#19A999] hover:bg-[#158f81] text-white font-bold text-xs rounded-xl transition shadow-lg shadow-teal-950/20 flex items-center justify-center gap-2"
                >
                  <span>Já Confirmei / Ir para o Login</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1 text-center">
                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {mode === 'signin'
                    ? 'Acessar Internet Banking'
                    : mode === 'signup'
                    ? 'Criar Conta de Operador'
                    : 'Recuperar Minha Senha'}
                </h1>
                <p className="text-xs text-slate-500">
                  {mode === 'signin'
                    ? 'Entre com seu e-mail e senha cadastrados'
                    : mode === 'signup'
                    ? 'Cadastre seu e-mail para operar o banco digital sandbox'
                    : 'Enviaremos um link de recuperação para seu e-mail'}
                </p>
              </div>

              {/* Mode Switcher: Entrar vs Criar Conta */}
              {mode !== 'forgot' && (
                <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      setMessage(null);
                    }}
                    className={`flex-1 py-2 rounded-lg transition ${
                      mode === 'signin'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-bold'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setMessage(null);
                    }}
                    className={`flex-1 py-2 rounded-lg transition ${
                      mode === 'signup'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-bold'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Criar Conta
                  </button>
                </div>
              )}

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

              {/* Auth Form */}
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

                {mode !== 'forgot' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Senha
                      </label>

                      {/* Sugerir Senha Forte (exibido na aba Criar Conta) */}
                      {mode === 'signup' && (
                        <button
                          type="button"
                          onClick={generateStrongPassword}
                          className="text-[11px] font-bold text-[#19A999] hover:text-[#158f81] flex items-center gap-1 transition"
                          title="Gerar e copiar senha forte segura"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{copiedPassword ? 'Copiada!' : 'Sugerir Senha Forte'}</span>
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#F1613A] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Link Esqueci Minha Senha */}
                    {mode === 'signin' && (
                      <div className="flex justify-end pt-1">
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
                    )}

                    {/* Medidor de Força de Senha no Cadastro */}
                    {mode === 'signup' && password.length > 0 && (
                      <div className="space-y-1.5 pt-1 animate-fadeIn">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Força da senha:</span>
                          <span className={`font-bold ${strength.text}`}>{strength.label}</span>
                        </div>

                        <div className="grid grid-cols-4 gap-1.5 h-1.5">
                          <div className={`rounded-full transition-all ${passwordStrength >= 1 ? strength.color : 'bg-slate-200 dark:bg-slate-700'}`} />
                          <div className={`rounded-full transition-all ${passwordStrength >= 2 ? strength.color : 'bg-slate-200 dark:bg-slate-700'}`} />
                          <div className={`rounded-full transition-all ${passwordStrength >= 3 ? strength.color : 'bg-slate-200 dark:bg-slate-700'}`} />
                          <div className={`rounded-full transition-all ${passwordStrength >= 4 ? strength.color : 'bg-slate-200 dark:bg-slate-700'}`} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-[#F1613A] hover:bg-[#d94f2a] text-white font-bold text-xs rounded-xl transition shadow-lg shadow-orange-950/20 flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>
                    {loading
                      ? 'Processando...'
                      : mode === 'signin'
                      ? 'Entrar no Internet Banking'
                      : mode === 'signup'
                      ? 'Concluir Cadastro de Operador'
                      : 'Enviar Link de Recuperação'}
                  </span>
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
                      ← Voltar para a tela de Login
                    </button>
                  </div>
                )}
              </form>

              {/* Sandbox Footer Disclaimer */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  Todas as contas criadas operam exclusivamente em ambiente sandbox com saldo e transações simuladas.
                </span>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-md w-full mx-auto text-center text-slate-500 text-[11px] space-y-1">
        <p>OptmaPay Sandbox Dev Bank • Ecossistema OptmaIdea</p>
        <p>© 2026 Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};
