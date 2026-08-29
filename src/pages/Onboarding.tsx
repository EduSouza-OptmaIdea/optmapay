import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createBankAccount } from '../lib/supabase/accountService';
import { Logo } from '../components/Logo';
import { Building2, User, Sparkles, ArrowRight, ShieldCheck, CheckCircle2, Wallet, QrCode, Key } from 'lucide-react';
import { AccountType } from '../types/sandbox';
import { getStoredAnonKey } from '../lib/supabase/client';
import { SupabaseConfigModal } from '../components/SupabaseConfigModal';

export const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const { user, isUnauthorized, refreshAccounts, setActiveAccountId } = useAuth();

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>('merchant');
  const [name, setName] = useState('OptmaIdea Vendas & Soluções LTDA');
  const [cpfCnpj, setCpfCnpj] = useState('45.892.102/0001-90');
  const [phone, setPhone] = useState('(11) 98877-6655');
  const [initialBalance, setInitialBalance] = useState('10000');
  const [pixKey, setPixKey] = useState('vendas@optmaidea.com.br');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);


  const handleTypeChange = (type: AccountType) => {
    setAccountType(type);
    if (type === 'merchant') {
      setName('OptmaIdea Vendas & Soluções LTDA');
      setCpfCnpj('45.892.102/0001-90');
      setInitialBalance('10000');
      setPixKey('vendas@optmaidea.com.br');
    } else {
      setName('Carlos Eduardo Silva (Cliente Teste)');
      setCpfCnpj('123.456.789-00');
      setInitialBalance('3500');
      setPixKey('carlos.silva.teste@optmapay.fake');
    }
  };

  const generateFakeCpfCnpj = () => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const userId = user ? user.id : '00000000-0000-0000-0000-000000000001';
    const val = parseFloat(initialBalance);

    try {
      const created = await createBankAccount(userId, {
        name,
        type: accountType,
        cpf_cnpj: cpfCnpj,
        phone,
        initialBalance: isNaN(val) ? 0 : val,
        pixKey,
      });

      if (created) {
        await refreshAccounts();
        setActiveAccountId(created.id);
        navigate('/');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao criar conta no Supabase.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-4 sm:p-8">
      {/* Header Landing */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-2">
        <Logo showBadge={true} />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsConfigModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-teal-400 font-medium transition shadow-sm"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Configurar Supabase</span>
          </button>
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-mono">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            <span>Ambiente Sandbox</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl w-full mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Side: Hero Info & Live Card Preview */}
        <div className="lg:col-span-5 space-y-6">
          <div className="space-y-3">
            <span className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider bg-teal-950 text-teal-300 border border-teal-800 rounded-full inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Internet Banking Sandbox
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Abra uma Conta Digital Fictícia para Testar Vendas
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              Crie a conta da sua empresa recebedora ou de um cliente pagador. Saldo fictício, cartões virtuais e chave Pix salvos em tempo real no Supabase.
            </p>
          </div>

          {/* Live Card Preview */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-teal-800 via-teal-900 to-slate-950 border border-teal-500/30 shadow-2xl space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {accountType === 'merchant' ? (
                  <Building2 className="w-5 h-5 text-teal-400" />
                ) : (
                  <User className="w-5 h-5 text-blue-400" />
                )}
                <span className="text-xs font-bold uppercase text-teal-200">
                  Conta {accountType === 'merchant' ? 'Empresa (Merchant)' : 'Cliente (Customer)'}
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold bg-white/10 px-2 py-0.5 rounded text-amber-300">
                SANDBOX
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-lg font-bold text-white truncate">{name || 'Nome do Titular'}</p>
              <p className="text-xs text-teal-200/80 font-mono">CPF/CNPJ: {cpfCnpj || '00.000.000/0000-00'}</p>
            </div>

            <div className="pt-3 border-t border-teal-700/50 flex items-center justify-between text-xs font-mono">
              <div>
                <span className="text-[10px] text-teal-300/80 uppercase block">Saldo Inicial Fictício</span>
                <span className="text-lg font-extrabold text-emerald-400">
                  R$ {(parseFloat(initialBalance) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
        <div className="lg:col-span-7 bg-slate-800 border border-slate-700 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Wallet className="w-5 h-5 text-teal-400" />
              Formulário de Abertura de Conta
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Preencha os dados fictícios abaixo. Não é necessário dinheiro real nem dados bancários reais.
            </p>
          </div>

          {(errorMsg || isUnauthorized || !getStoredAnonKey()) && (
            <div className="p-4 rounded-2xl bg-amber-950/60 border border-amber-800/80 text-amber-200 text-xs space-y-3">
              <div className="flex items-start gap-2.5">
                <Key className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-300">
                    {errorMsg?.includes('Invalid API key') || isUnauthorized || !getStoredAnonKey()
                      ? 'Chave API Anon do Supabase necessária'
                      : errorMsg}
                  </p>
                  <p className="text-[11px] text-amber-300/80 mt-0.5">
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
            {/* Account Type Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Qual o Perfil da Conta?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleTypeChange('merchant')}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-3 ${
                    accountType === 'merchant'
                      ? 'bg-teal-950/80 border-teal-500 text-white font-bold'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <Building2 className={`w-5 h-5 ${accountType === 'merchant' ? 'text-teal-400' : 'text-slate-500'}`} />
                  <div>
                    <p className="text-xs">Empresa (Merchant)</p>
                    <p className="text-[10px] text-slate-400 font-normal">Recebedor de vendas & duplicatas</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleTypeChange('customer')}
                  className={`p-3 rounded-xl border text-left transition flex items-center gap-3 ${
                    accountType === 'customer'
                      ? 'bg-blue-950/80 border-blue-500 text-white font-bold'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <User className={`w-5 h-5 ${accountType === 'customer' ? 'text-blue-400' : 'text-slate-500'}`} />
                  <div>
                    <p className="text-xs">Cliente (Customer)</p>
                    <p className="text-[10px] text-slate-400 font-normal">Pagador PF/PJ de testes</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome do Titular ou Razão Social
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    {accountType === 'merchant' ? 'CNPJ Fictício' : 'CPF Fictício'}
                  </label>
                  <button
                    type="button"
                    onClick={generateFakeCpfCnpj}
                    className="text-[10px] text-teal-400 hover:underline"
                  >
                    Gerar Novo
                  </button>
                </div>
                <input
                  type="text"
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Saldo Inicial Fictício (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono font-bold text-emerald-400 focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Chave Pix Padrão
                </label>
                <input
                  type="text"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition shadow-xl shadow-teal-950/40 flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              <span>{loading ? 'Abrindo Conta no Supabase...' : 'Abrir Conta Digital e Acessar Banco'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto text-center text-slate-500 text-[11px]">
        OptmaPay Sandbox • Microcosmos OptmaIdea • Persistência em Tempo Real via PostgreSQL Supabase
      </footer>

      {/* Supabase Config Modal */}
      <SupabaseConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onSaved={async () => {
          await refreshAccounts();
          setErrorMsg(null);
        }}
      />
    </div>
  );
};

