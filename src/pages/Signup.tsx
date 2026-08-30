import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { AccountType } from '../types/sandbox';
import { createBankAccount } from '../lib/supabase/accountService';
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
  Building2,
  User,
  Phone,
} from 'lucide-react';

export const Signup: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, refreshAccounts } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const [accountType, setAccountType] = useState<AccountType>('merchant');
  const [name, setName] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [phone, setPhone] = useState('(11) 98877-6655');
  const [balanceFormatted, setBalanceFormatted] = useState('1.000,00');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Estado de confirmação de e-mail pendente
  const [signupSubmittedEmail, setSignupSubmittedEmail] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/dashboard');
    }
  }, [authLoading, user, navigate]);

  // Timer de cooldown para reenvio de e-mail
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Gerador de CPF / CNPJ Fictício
  const generateFakeDocument = () => {
    if (accountType === 'merchant') {
      const random = Math.floor(10000000000000 + Math.random() * 90000000000000);
      const str = random.toString().slice(0, 14);
      setCpfCnpj(`${str.slice(0, 2)}.${str.slice(2, 5)}.${str.slice(5, 8)}/${str.slice(8, 12)}-${str.slice(12)}`);
    } else {
      const random = Math.floor(10000000000 + Math.random() * 90000000000);
      const str = random.toString().slice(0, 11);
      setCpfCnpj(`${str.slice(0, 3)}.${str.slice(3, 6)}.${str.slice(6, 9)}-${str.slice(9)}`);
    }
  };

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

  const handleBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, '');
    if (!raw) raw = '0';
    const num = parseFloat(raw) / 100;
    setBalanceFormatted(
      num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  };

  const parseFormattedBalance = (formatted: string): number => {
    const clean = formatted.replace(/\./g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  };

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

    if (!name.trim()) {
      setMessage({ type: 'error', text: 'Informe o Nome do Titular ou Razão Social.' });
      return;
    }

    if (!cpfCnpj.trim()) {
      setMessage({ type: 'error', text: 'Informe o CPF ou CNPJ fictício.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    const initialBal = parseFormattedBalance(balanceFormatted);
    const pixKey = email.trim();

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            account_name: name.trim(),
            account_type: accountType,
            cpf_cnpj: cpfCnpj.trim(),
            phone: phone.trim(),
            initial_balance: initialBal,
            pix_key: pixKey,
          },
        },
      });

      if (error) {
        if (error.message.includes('security') || error.message.includes('429') || error.status === 429) {
          throw new Error('Muitas tentativas em curto intervalo. Aguarde cerca de 30 segundos.');
        }
        throw error;
      }

      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setMessage({
          type: 'error',
          text: 'Este e-mail já possui cadastro. Acesse a tela de login ou redefina sua senha.',
        });
        return;
      }

      // Se autenticou com sessão ativa de imediato
      if (data.session && data.user) {
        await createBankAccount(data.user.id, {
          name: name.trim(),
          type: accountType,
          cpf_cnpj: cpfCnpj.trim(),
          phone: phone.trim(),
          initialBalance: initialBal,
          pixKey,
        });
        await refreshAccounts();
        navigate('/dashboard');
      } else {
        // Confirmação de e-mail requerida
        setSignupSubmittedEmail(email.trim());
        setResendCooldown(60);
      }
    } catch (err: any) {
      let friendly = err.message || 'Erro ao realizar cadastro.';
      if (friendly.includes('User already registered')) {
        friendly = 'Este e-mail já possui cadastro. Faça login ou recupere sua senha.';
      }
      setMessage({ type: 'error', text: friendly });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 flex flex-col justify-between p-4 sm:p-8 selection:bg-[#F1613A] selection:text-white">
      {/* Header */}
      <header className="max-w-xl w-full mx-auto flex items-center justify-between py-2">
        <Link to="/">
          <Logo heightClass="h-9 sm:h-10" />
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 hidden sm:inline">Já tem conta?</span>
          <Link
            to="/login"
            className="text-xs text-[#19A999] hover:underline font-bold flex items-center gap-1"
          >
            <span>Acessar Conta</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Main Form Container (Sem menu lateral) */}
      <main className="max-w-xl w-full mx-auto my-8">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
          
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
                  Enviamos o link de ativação para:
                </p>
                <div className="inline-block px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 font-mono font-bold text-xs text-[#F1613A]">
                  {signupSubmittedEmail}
                </div>
              </div>

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
                  <span>Próximos passos:</span>
                </p>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <li>Clique no botão <strong>"Confirmar minha conta"</strong> no e-mail recebido.</li>
                  <li>Sua conta sandbox será aberta instantaneamente com o saldo de <strong>R$ {balanceFormatted}</strong> e os dados informados.</li>
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

                <Link
                  to="/login"
                  className="w-full py-3 bg-[#19A999] hover:bg-[#158f81] text-white font-bold text-xs rounded-xl transition shadow-lg shadow-teal-950/20 flex items-center justify-center gap-2"
                >
                  <span>Ir para Acessar Conta</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1 text-center">
                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Criar Conta de Operador Sandbox
                </h1>
                <p className="text-xs text-slate-500">
                  Informe seus dados de acesso e configure sua conta bancária de testes
                </p>
              </div>

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

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* 1. Credenciais de Acesso */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#F1613A]">
                    1. Credenciais de Acesso
                  </span>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Seu E-mail
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu.email@empresa.com.br"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#F1613A] outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Senha de Acesso
                      </label>
                      <button
                        type="button"
                        onClick={generateStrongPassword}
                        className="text-[11px] font-bold text-[#19A999] hover:underline flex items-center gap-1"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{copiedPassword ? 'Copiada!' : 'Sugerir Senha Forte'}</span>
                      </button>
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
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#F1613A] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {password.length > 0 && (
                      <div className="space-y-1 pt-1">
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
                </div>

                {/* 2. Dados da Conta Bancária Sandbox */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#19A999]">
                    2. Dados da Conta Bancária Sandbox
                  </span>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Tipo de Pessoa
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setAccountType('merchant')}
                        className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 ${
                          accountType === 'merchant'
                            ? 'bg-teal-50 dark:bg-teal-950/80 border-[#19A999] text-[#19A999] font-bold ring-2 ring-[#19A999]/20'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Building2 className="w-4 h-4" />
                        <div>
                          <p className="text-xs">Pessoa Jurídica (PJ)</p>
                          <p className="text-[10px] font-normal text-slate-500">Recebedor de vendas</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setAccountType('customer')}
                        className={`p-3 rounded-xl border text-left transition flex items-center gap-2.5 ${
                          accountType === 'customer'
                            ? 'bg-blue-50 dark:bg-blue-950/80 border-blue-500 text-blue-600 dark:text-blue-400 font-bold ring-2 ring-blue-500/20'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <User className="w-4 h-4" />
                        <div>
                          <p className="text-xs">Pessoa Física (PF)</p>
                          <p className="text-[10px] font-normal text-slate-500">Pagador de compras</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nome do Titular ou Razão Social
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={accountType === 'merchant' ? 'Ex: Minha Empresa Vendas LTDA' : 'Ex: Carlos Silva'}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#19A999] outline-none font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {accountType === 'merchant' ? 'CNPJ Fictício' : 'CPF Fictício'}
                        </label>
                        <button
                          type="button"
                          onClick={generateFakeDocument}
                          className="text-[10px] text-[#19A999] hover:underline font-bold"
                        >
                          Gerar Fictício
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        value={cpfCnpj}
                        onChange={(e) => setCpfCnpj(e.target.value)}
                        placeholder={accountType === 'merchant' ? '00.000.000/0000-00' : '000.000.000-00'}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#19A999] outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Telefone (Fictício)
                      </label>
                      <div className="relative">
                        <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="(11) 98877-6655"
                          className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#19A999] outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Saldo Inicial Fictício (R$)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">R$</span>
                        <input
                          type="text"
                          required
                          value={balanceFormatted}
                          onChange={handleBalanceChange}
                          className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-extrabold text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-[#19A999] outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Chave Pix Padrão (E-mail)
                      </label>
                      <input
                        type="text"
                        disabled
                        value={email || 'Será o mesmo e-mail digitado'}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-500 dark:text-slate-400 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-[#F1613A] hover:bg-[#d94f2a] text-white font-bold text-xs rounded-xl transition shadow-lg shadow-orange-950/20 flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{loading ? 'Criando Conta...' : 'Concluir Cadastro e Abrir Conta Sandbox'}</span>
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  Ambiente de testes seguro: saldo fictício sem movimentação financeira real.
                </span>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-xl w-full mx-auto text-center text-slate-500 text-[11px] space-y-1">
        <p>OptmaPay Sandbox Dev Bank • Ecossistema OptmaIdea</p>
        <p>© 2026 Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};
