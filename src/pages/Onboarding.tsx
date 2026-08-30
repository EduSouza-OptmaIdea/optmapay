import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createBankAccount } from '../lib/supabase/accountService';
import { Logo } from '../components/Logo';
import { Building2, User, Sparkles, ShieldCheck, Wallet, Key, RefreshCw } from 'lucide-react';
import { AccountType } from '../types/sandbox';
import { getStoredAnonKey } from '../lib/supabase/client';
import { SupabaseConfigModal } from '../components/SupabaseConfigModal';

export const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const { user, isUnauthorized, refreshAccounts, setActiveAccountId } = useAuth();

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>('merchant');
  const [name, setName] = useState('Minha Empresa Sandbox LTDA');
  const [cpfCnpj, setCpfCnpj] = useState('45.892.102/0001-90');
  const [phone, setPhone] = useState('(11) 98877-6655');
  const [initialBalanceFormatted, setInitialBalanceFormatted] = useState('10.000,00');
  const [pixKey, setPixKey] = useState(user?.email || 'vendas@optmaidea.com.br');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user?.email) {
      setPixKey(user.email);
    }
  }, [user?.email]);

  const handleTypeChange = (type: AccountType) => {
    setAccountType(type);
    if (type === 'merchant') {
      setName('Minha Empresa Sandbox LTDA');
      setCpfCnpj('45.892.102/0001-90');
      setInitialBalanceFormatted('10.000,00');
      setPixKey(user?.email || 'vendas@optmaidea.com.br');
    } else {
      setName('Cliente Teste Comprador');
      setCpfCnpj('824.636.200-65');
      setInitialBalanceFormatted('2.500,00');
      setPixKey(user?.email || 'cliente@optmapay.fake');
    }
  };

  const handleBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, '');
    if (!raw) raw = '0';
    const num = parseFloat(raw) / 100;
    setInitialBalanceFormatted(
      num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  };

  const parseFormattedBalance = (formatted: string): number => {
    const clean = formatted.replace(/\./g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const val = parseFormattedBalance(initialBalanceFormatted);

    try {
      const created = await createBankAccount(user.id, {
        name,
        type: accountType,
        cpf_cnpj: cpfCnpj,
        phone,
        initialBalance: val,
        pixKey: pixKey.trim(),
      });

      if (created) {
        await refreshAccounts();
        setActiveAccountId(created.id);
        navigate('/dashboard');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao criar conta no Supabase.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F2] dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 flex flex-col justify-between p-4 sm:p-8 selection:bg-[#F1613A] selection:text-white">
      {/* Header Landing */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-2">
        <Link to="/">
          <Logo heightClass="h-9 sm:h-10" />
        </Link>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsConfigModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs text-[#19A999] font-medium transition shadow-sm"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Configurar Supabase</span>
          </button>
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 font-mono">
            <ShieldCheck className="w-4 h-4 text-[#19A999]" />
            <span>Ambiente Sandbox</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl w-full mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Side: Hero Info & Live Card Preview */}
        <div className="lg:col-span-5 space-y-6">
          <div className="space-y-3">
            <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-teal-500/10 text-[#19A999] border border-teal-500/20 rounded-full inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Internet Banking Sandbox
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
              Abra sua Conta Digital Fictícia para Testar Vendas
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Crie a conta de Pessoa Jurídica (PJ) ou Pessoa Física (PF) vinculada exclusivamente ao seu e-mail de operador. Saldo fictício e chave Pix salvos em tempo real no Supabase.
            </p>
          </div>

          {/* Live Card Preview */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[#29324E] via-slate-900 to-[#0F172A] border border-slate-700 shadow-2xl space-y-4 relative overflow-hidden text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {accountType === 'merchant' ? (
                  <Building2 className="w-5 h-5 text-[#19A999]" />
                ) : (
                  <User className="w-5 h-5 text-blue-400" />
                )}
                <span className="text-xs font-bold uppercase text-teal-200">
                  Conta {accountType === 'merchant' ? 'Pessoa Jurídica (PJ)' : 'Pessoa Física (PF)'}
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold bg-white/10 px-2 py-0.5 rounded text-[#FAA832]">
                SANDBOX
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-lg font-bold text-white truncate">{name || 'Nome do Titular'}</p>
              <p className="text-xs text-teal-200/80 font-mono">CPF/CNPJ: {cpfCnpj || '00.000.000/0000-00'}</p>
              <p className="text-xs text-teal-300 font-mono truncate">Chave Pix: {pixKey || 'pix@email.com'}</p>
            </div>

            <div className="pt-3 border-t border-slate-700 flex items-center justify-between text-xs font-mono">
              <div>
                <span className="text-[10px] text-teal-300/80 uppercase block">Saldo Inicial Fictício</span>
                <span className="text-lg font-extrabold text-emerald-400">
                  R$ {initialBalanceFormatted}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-teal-300/80 uppercase block">Agência / Conta</span>
                <span className="text-white font-bold">0001 • 40592-8</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Account Opening Form */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#19A999]" />
              Formulário de Abertura de Conta
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Preencha os dados fictícios abaixo. Não é necessário dinheiro real nem dados bancários reais.
            </p>
          </div>

          {(errorMsg || isUnauthorized || !getStoredAnonKey()) && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs space-y-3">
              <div className="flex items-start gap-2.5">
                <Key className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    {errorMsg?.includes('Invalid API key') || isUnauthorized || !getStoredAnonKey()
                      ? 'Chave API Anon do Supabase necessária'
                      : errorMsg}
                  </p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                    Insira a chave pública (`anon`) do seu projeto Supabase para salvar e sincronizar os dados.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(true)}
                className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-md"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Inserir Chave Anon do Supabase</span>
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account Type Selector: Pessoa Jurídica vs Pessoa Física */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Qual o Perfil da Conta?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleTypeChange('merchant')}
                  className={`p-3.5 rounded-2xl border text-left transition flex items-center gap-3 ${
                    accountType === 'merchant'
                      ? 'bg-teal-50 dark:bg-teal-950/80 border-[#19A999] text-slate-900 dark:text-white font-bold ring-2 ring-[#19A999]/20'
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                  }`}
                >
                  <Building2 className={`w-5 h-5 ${accountType === 'merchant' ? 'text-[#19A999]' : 'text-slate-400'}`} />
                  <div>
                    <p className="text-xs">Pessoa Jurídica (PJ)</p>
                    <p className="text-[10px] text-slate-500 font-normal">Recebedor de vendas & duplicatas</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleTypeChange('customer')}
                  className={`p-3.5 rounded-2xl border text-left transition flex items-center gap-3 ${
                    accountType === 'customer'
                      ? 'bg-blue-50 dark:bg-blue-950/80 border-blue-500 text-slate-900 dark:text-white font-bold ring-2 ring-blue-500/20'
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                  }`}
                >
                  <User className={`w-5 h-5 ${accountType === 'customer' ? 'text-blue-500' : 'text-slate-400'}`} />
                  <div>
                    <p className="text-xs">Pessoa Física (PF)</p>
                    <p className="text-[10px] text-slate-500 font-normal">Pagador de compras & testes</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Titular ou Razão Social
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#19A999] outline-none font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {accountType === 'merchant' ? 'CNPJ Fictício' : 'CPF Fictício'}
                </label>
                <input
                  type="text"
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#19A999] outline-none"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Saldo Inicial Fictício (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400">R$</span>
                  <input
                    type="text"
                    value={initialBalanceFormatted}
                    onChange={handleBalanceChange}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-extrabold text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-[#19A999] outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chave Pix Padrão (E-mail do Cadastro)
                </label>
                <input
                  type="text"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="seu.email@empresa.com.br"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#19A999] outline-none"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-[#F1613A] hover:bg-[#d94f2a] text-white font-bold text-xs rounded-xl transition shadow-lg shadow-orange-950/20 flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Criando Conta no Supabase...' : 'Abrir Conta Digital e Acessar Banco'}</span>
            </button>
          </form>
        </div>
      </main>

      {/* Footer Disclaimer */}
      <footer className="max-w-6xl w-full mx-auto text-center text-slate-500 text-xs space-y-1">
        <p>OptmaPay Sandbox Dev Bank • Ecossistema OptmaIdea</p>
        <p>© 2026 Todos os direitos reservados. Ambiente estritamente simulado.</p>
      </footer>

      <SupabaseConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onSaved={refreshAccounts}
      />
    </div>
  );
};
