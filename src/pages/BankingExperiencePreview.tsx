import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft, ArrowRight, Banknote,
  BookOpenCheck, CreditCard, Eye, EyeOff, FileText, GraduationCap,
  Lightbulb, PiggyBank, QrCode, ShieldCheck, Smartphone, Sparkles,
  TrendingUp, Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppMode } from '../context/AppModeContext';

/**
 * Prévia mobile-first: usa o saldo verdadeiro da conta sandbox autenticada.
 * Não cria movimentações fictícias de demonstração nem altera transações.
 * Os links conectam somente módulos existentes e protegidos.
 */
const formatMoney = (value: number): string =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const bankingShortcuts = [
  { to: '/pix', title: 'Enviar Pix', detail: 'Transferências fictícias', icon: QrCode, tone: 'teal' },
  { to: '/dashboard', title: 'Depositar', detail: 'Crédito simulado', icon: ArrowDownLeft, tone: 'indigo' },
  { to: '/boletos', title: 'Pagar conta', detail: 'Boletos de teste', icon: FileText, tone: 'amber' },
  { to: '/cartoes', title: 'Cartões', detail: 'Limite e faturas', icon: CreditCard, tone: 'slate' },
] as const;

const educationShortcuts = [
  { to: '/edu-dashboard', title: 'Minha jornada', detail: 'Aprenda fazendo', icon: GraduationCap },
  { to: '/investimentos', title: 'Cofrinhos', detail: 'Planeje objetivos', icon: PiggyBank },
  { to: '/contas-a-pagar', title: 'Vida cotidiana', detail: 'Despesas e prazos', icon: Banknote },
  { to: '/cenarios', title: 'Decisões da vida', detail: 'Explore alternativas', icon: Lightbulb },
] as const;

export const BankingExperiencePreview: React.FC = () => {
  const { activeAccount, user } = useAuth();
  const { mode, setMode } = useAppMode();
  const [balanceVisible, setBalanceVisible] = useState(true);

  if (!activeAccount) {
    return (
      <section className="rounded-3xl border bg-white p-6 text-sm dark:border-slate-700 dark:bg-slate-800">
        <h1 className="font-bold text-lg">Uma experiência feita para você</h1>
        <p className="mt-2 text-slate-500">Selecione ou crie sua conta sandbox para visualizar a nova página inicial.</p>
        <Link to="/dashboard" className="mt-4 inline-flex items-center gap-2 font-bold text-teal-700 dark:text-teal-300">
          Ir para minhas contas <ArrowRight size={16}/>
        </Link>
      </section>
    );
  }

  const balance = Number(activeAccount.balance || 0);
  const accountType = activeAccount.type === 'merchant' ? 'Pessoa jurídica' : 'Pessoa física';
  const headline = mode === 'edu' ? 'Aprenda a cuidar das suas escolhas' : 'Seu banco de testes, mais simples';

  return (
    <main className="mx-auto max-w-6xl space-y-5 pb-8" aria-label="Nova experiência de banco sandbox">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">
            <Sparkles size={15}/> Nova experiência • prévia para homologação
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">{headline}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            Olá, {activeAccount.name || user?.email || 'explorador'}.
            Tudo aqui é simulado: sem uso de dinheiro real.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-xs font-bold text-teal-900 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-200">
          <ShieldCheck size={16}/> Ambiente seguro de simulação
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#29324E] via-[#182C42] to-[#075C5A] p-5 text-white shadow-lg sm:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-14 h-48 w-48 rounded-full border-[32px] border-white/5" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-teal-100/80">Saldo disponível • sandbox</p>
              <p className="mt-3 break-all text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl" aria-live="polite">
                {balanceVisible ? formatMoney(balance) : '••••••'}
              </p>
              <p className="mt-2 text-xs text-teal-100/75">
                {accountType} · Agência {activeAccount.agency} · Conta {activeAccount.account_number}
              </p>
            </div>
            <button
              type="button"
              aria-label={balanceVisible ? 'Ocultar saldo' : 'Mostrar saldo'}
              aria-pressed={balanceVisible}
              onClick={() => setBalanceVisible(value => !value)}
              className="shrink-0 rounded-xl border border-white/20 bg-white/10 p-3 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {balanceVisible ? <EyeOff size={20}/> : <Eye size={20}/>}
            </button>
          </div>
          <div className="relative mt-7 flex flex-wrap gap-2">
            <Link to="/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#29324E] transition hover:bg-teal-50">
              <Wallet size={17}/> Extrato completo
            </Link>
            <Link to="/pix-limites" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/35 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20">
              <ShieldCheck size={17}/> Meus limites
            </Link>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-[28px] border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 sm:p-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-teal-700 dark:text-teal-300">Seu espaço</p>
            <h2 className="mt-2 text-xl font-extrabold">{mode === 'edu' ? 'Aprender sem medo de errar' : 'Teste suas integrações'}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {mode === 'edu'
                ? 'Descubra como organizar gastos, poupar e lidar com imprevistos usando apenas valores fictícios.'
                : 'Valide jornadas de pagamento, recibos, limites e retornos de APIs em um ambiente isolado.'}
            </p>
          </div>
          <Link
            to={mode === 'edu' ? '/edu-dashboard' : '/dev'}
            className="mt-5 inline-flex min-h-11 items-center justify-between rounded-xl bg-[#F1613A] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#DA522E]"
          >
            {mode === 'edu' ? 'Explorar atividades' : 'Abrir área dev'} <ArrowRight size={18}/>
          </Link>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="banking-actions-title">
        <div className="flex items-center justify-between gap-2">
          <h2 id="banking-actions-title" className="text-lg font-extrabold">O que deseja fazer?</h2>
          <span className="text-xs text-slate-500">Serviços disponíveis</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {bankingShortcuts.map(action => (
            <Link
              key={action.to}
              to={action.to}
              className="group flex min-h-32 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 dark:border-slate-700 dark:bg-slate-800"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                <action.icon size={22}/>
              </span>
              <span className="mt-3 text-sm font-extrabold">{action.title}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">{action.detail}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold">Aprendizado no seu ritmo</h2>
            <button
              type="button"
              onClick={() => setMode(mode === 'edu' ? 'dev' : 'edu')}
              className="text-xs font-bold text-teal-700 underline decoration-teal-400 underline-offset-4 dark:text-teal-300"
            >
              {mode === 'edu' ? 'Mudar para Dev' : 'Mudar para Educação'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {educationShortcuts.map(action => (
              <Link key={action.to} to={action.to}
                className="flex min-h-32 flex-col justify-between rounded-2xl border border-slate-200 bg-[#F8F6F2] p-4 transition hover:border-teal-300 dark:border-slate-700 dark:bg-slate-800">
                <action.icon size={22} className="text-[#F1613A]"/>
                <span className="text-sm font-bold">{action.title}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{action.detail}</span>
              </Link>
            ))}
          </div>
        </div>
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">
            <BookOpenCheck size={18}/> Educação aplicada
          </p>
          <h3 className="mt-3 font-extrabold text-lg">Uma escolha de cada vez</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Antes de confirmar um pagamento, compare o valor, a finalidade e quanto continuará disponível para suas necessidades.
          </p>
          <Link to="/cenarios" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-teal-700 dark:text-teal-300">
            Treinar decisões <ArrowRight size={16}/>
          </Link>
        </aside>
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 px-5 py-4 text-sm dark:border-slate-600">
        <div className="flex flex-wrap items-center gap-2 font-bold">
          <TrendingUp size={18} className="text-teal-600"/> Próximos módulos: bolsa fictícia, loja de simulações e contas familiares.
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          Estão em planejamento. Esta prévia não oferece transações adicionais, nem usa cotações de mercado ou saldo inventado. Compras e investimentos futuros dependerão da configuração administrativa.
        </p>
      </section>
      <p className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
        <Smartphone size={15}/> Experiência em homologação. As operações financeiras existentes continuam nos módulos originais.
      </p>
    </main>
  );
};
