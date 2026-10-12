import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Crown,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  superAdminFetchActivity,
  superAdminFetchUserMetrics,
  superAdminListUsers,
  SuperAdminActivityRow,
  SuperAdminUserMetrics,
  SuperAdminUserRow,
} from '../lib/supabase/accountService';

type Tab = 'users' | 'activity';
type ActivityCategory = 'all' | 'auth' | 'conta' | 'transacao' | 'cartao' | 'boleto';

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return null;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function statusLabel(status: string) {
  if (status === 'active') return 'Ativo';
  if (status === 'pending_confirmation') return 'Aguardando confirmação';
  if (status === 'blocked') return 'Bloqueado';
  return status || '—';
}

export const SuperAdminUsersActivity: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('users');
  const [metrics, setMetrics] = useState<SuperAdminUserMetrics | null>(null);
  const [users, setUsers] = useState<SuperAdminUserRow[]>([]);
  const [activities, setActivities] = useState<SuperAdminActivityRow[]>([]);
  const [search, setSearch] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityCategory, setActivityCategory] = useState<ActivityCategory>('all');
  const [selectedUser, setSelectedUser] = useState<SuperAdminUserRow | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async (query: string = search) => {
    setLoadingUsers(true);
    setError(null);
    try {
      const [rows, met] = await Promise.all([
        superAdminListUsers(query, 300, 0),
        superAdminFetchUserMetrics(),
      ]);
      setUsers(rows);
      setMetrics(met);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar os usuários.');
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadActivities = async (
    userId: string | null = selectedUser?.user_id || null,
    query: string = activitySearch
  ) => {
    setLoadingActivities(true);
    setError(null);
    try {
      const rows = await superAdminFetchActivity(userId, query, 300, 0);
      setActivities(rows);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar as atividades.');
    } finally {
      setLoadingActivities(false);
    }
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadUsers('');
    loadActivities(null, '');
  }, [isSuperAdmin]);

  const filteredActivities = useMemo(() => {
    if (activityCategory === 'all') return activities;
    return activities.filter((row) => row.category === activityCategory);
  }, [activities, activityCategory]);

  const openUserActivity = async (user: SuperAdminUserRow) => {
    setSelectedUser(user);
    setTab('activity');
    setActivitySearch('');
    setActivityCategory('all');
    await loadActivities(user.user_id, '');
  };

  if (!isSuperAdmin) {
    return (
      <div className="max-w-2xl mx-auto mt-12 p-6 rounded-3xl border border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-rose-600 shrink-0" />
          <div>
            <h1 className="font-bold text-rose-800 dark:text-rose-300">Área restrita</h1>
            <p className="text-xs text-rose-700/80 dark:text-rose-300/80 mt-1">
              A autorização de Super Admin não foi confirmada pelo servidor.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-[#1367A2] text-white p-6 sm:p-8 border border-slate-700 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-amber-500 text-slate-950 shadow-lg">
              <Crown className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black">Usuários & Atividades</h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-3xl">
                Visão de supervisão do OptmaPay Sandbox para acompanhar cadastros, confirmação de e-mail,
                contas abertas e movimentações fictícias dos usuários de teste.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                Autoridade validada no Supabase
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={async () => {
              await Promise.all([loadUsers(search), loadActivities(selectedUser?.user_id || null, activitySearch)]);
            }}
            className="self-start lg:self-center inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold transition"
          >
            <RefreshCw className={'w-4 h-4 ' + (loadingUsers || loadingActivities ? 'animate-spin' : '')} />
            Atualizar agora
          </button>
        </div>
      </div>

      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <Metric label="Usuários" value={metrics.totalUsers} icon={<User className="w-4 h-4" />} />
          <Metric label="Confirmados" value={metrics.confirmedUsers} icon={<CheckCircle2 className="w-4 h-4" />} />
          <Metric label="Aguardando e-mail" value={metrics.pendingConfirmation} icon={<Clock className="w-4 h-4" />} />
          <Metric label="Login nas últimas 24h" value={metrics.signedInLast24h} icon={<Activity className="w-4 h-4" />} />
          <Metric label="Contas PF" value={metrics.customerAccounts} icon={<User className="w-4 h-4" />} />
          <Metric label="Contas PJ" value={metrics.merchantAccounts} icon={<Building2 className="w-4 h-4" />} />
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-900 w-fit">
        <button
          type="button"
          onClick={() => setTab('users')}
          className={tab === 'users'
            ? 'px-4 py-2 rounded-xl text-xs font-bold transition bg-white dark:bg-slate-800 text-[#1367A2] shadow-sm'
            : 'px-4 py-2 rounded-xl text-xs font-bold transition text-slate-500 hover:text-slate-900 dark:hover:text-white'}
        >
          Usuários
        </button>
        <button
          type="button"
          onClick={() => setTab('activity')}
          className={tab === 'activity'
            ? 'px-4 py-2 rounded-xl text-xs font-bold transition bg-white dark:bg-slate-800 text-[#1367A2] shadow-sm'
            : 'px-4 py-2 rounded-xl text-xs font-bold transition text-slate-500 hover:text-slate-900 dark:hover:text-white'}
        >
          Atividades
        </button>
      </div>

      {tab === 'users' ? (
        <section className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white">Usuários cadastrados</h2>
              <p className="text-xs text-slate-500 mt-1">
                Inclui usuários confirmados, pendentes de confirmação e contas de smoke test.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                loadUsers(search);
              }}
              className="flex gap-2"
            >
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome, conta ou e-mail..."
                  className="pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs w-56 sm:w-72"
                />
              </div>
              <button className="px-3 py-2 rounded-xl bg-[#1367A2] text-white text-xs font-bold">
                Buscar
              </button>
            </form>
          </div>

          {loadingUsers ? (
            <div className="p-12 flex items-center justify-center gap-2 text-xs text-slate-500">
              <RefreshCw className="w-4 h-4 animate-spin" /> Carregando usuários...
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {users.map((row) => (
                <article key={row.user_id} className="p-4 sm:p-5 hover:bg-slate-50/80 dark:hover:bg-slate-900/30 transition">
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                    <div className="min-w-0 flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-[#1367A2]/10 text-[#1367A2] flex items-center justify-center shrink-0">
                        {row.account_type === 'merchant' ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">{row.display_name}</h3>
                          <span
                            className={
                              row.status === 'active'
                                ? 'text-[9px] font-black uppercase px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                : row.status === 'pending_confirmation'
                                ? 'text-[9px] font-black uppercase px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-600 border-amber-500/30'
                                : 'text-[9px] font-black uppercase px-2 py-0.5 rounded-full border bg-rose-500/10 text-rose-600 border-rose-500/30'
                            }
                          >
                            {statusLabel(row.status)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-mono truncate mt-0.5">{row.email}</p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Cadastro: {formatDate(row.created_at)} • Último login: {formatDate(row.last_sign_in_at)}
                        </p>
                        {row.account_names && (
                          <p className="text-[10px] text-slate-500 mt-1">
                            Conta(s): <strong>{row.account_names}</strong>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] min-w-fit">
                      <Mini label="Saldo" value={formatMoney(Number(row.total_balance)) || 'R$ 0,00'} />
                      <Mini label="Transações" value={String(row.transaction_count)} />
                      <Mini label="Cartões" value={String(row.card_count)} />
                      <Mini label="Boletos" value={String(row.boleto_count)} />
                      <Mini label="Contas" value={String(row.account_count)} />
                    </div>

                    <button
                      type="button"
                      onClick={() => openUserActivity(row)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#1367A2]/30 text-[#1367A2] dark:text-sky-400 text-xs font-bold hover:bg-[#1367A2]/10 transition shrink-0"
                    >
                      Ver atividades <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </article>
              ))}

              {users.length === 0 && (
                <div className="p-12 text-center text-xs text-slate-400">Nenhum usuário encontrado.</div>
              )}
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-700 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-slate-900 dark:text-white">Atividades dos usuários</h2>
                  {selectedUser && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                      {selectedUser.display_name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Cadastro, último login, abertura de conta, transações, cartões e boletos do Sandbox.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedUser && (
                  <button
                    type="button"
                    onClick={async () => {
                      setSelectedUser(null);
                      await loadActivities(null, activitySearch);
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-xs font-bold"
                  >
                    Mostrar todos
                  </button>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    loadActivities(selectedUser?.user_id || null, activitySearch);
                  }}
                  className="flex gap-2"
                >
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      value={activitySearch}
                      onChange={(e) => setActivitySearch(e.target.value)}
                      placeholder="Buscar atividade..."
                      className="pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs w-52 sm:w-64"
                    />
                  </div>
                  <button className="px-3 py-2 rounded-xl bg-[#1367A2] text-white text-xs font-bold">
                    Buscar
                  </button>
                </form>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(['all','auth','conta','transacao','cartao','boleto'] as ActivityCategory[]).map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActivityCategory(category)}
                  className={
                    activityCategory === category
                      ? 'px-3 py-1.5 rounded-xl text-[10px] font-bold border transition bg-[#1367A2] text-white border-[#1367A2]'
                      : 'px-3 py-1.5 rounded-xl text-[10px] font-bold border transition bg-slate-50 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700'
                  }
                >
                  {category === 'all' ? 'Todas' : category === 'auth' ? 'Acesso' : category.charAt(0).toUpperCase() + category.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {loadingActivities ? (
            <div className="p-12 flex items-center justify-center gap-2 text-xs text-slate-500">
              <RefreshCw className="w-4 h-4 animate-spin" /> Carregando atividades...
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredActivities.map((row) => (
                <article key={row.event_id} className="p-4 sm:p-5">
                  <div className="flex gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center shrink-0">
                      <ActivityIcon category={row.category} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">{row.summary}</p>
                          <p className="text-[10px] text-slate-500 mt-1">
                            {row.account_name || 'Sem conta bancária'} {row.user_email ? '• ' + row.user_email : ''}
                          </p>
                        </div>
                        <div className="sm:text-right shrink-0">
                          <p className="text-[10px] text-slate-400">{formatDate(row.occurred_at)}</p>
                          {row.amount !== null && (
                            <p className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200 mt-1">
                              {formatMoney(Number(row.amount))}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-900 text-slate-500">
                          {row.category}
                        </span>
                        {row.status && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            {row.status.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}

              {filteredActivities.length === 0 && (
                <div className="p-12 text-center text-xs text-slate-400">Nenhuma atividade encontrada neste filtro.</div>
              )}
            </div>
          )}
        </section>
      )}

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-[11px] text-slate-600 dark:text-slate-300">
        <strong className="text-amber-700 dark:text-amber-400">Sandbox:</strong> esta área acompanha somente dados
        fictícios e eventos do ambiente OptmaPay de testes. O acesso global é concedido exclusivamente por autorização
        server-side do Super Admin.
      </div>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: number; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
    <div className="flex items-center justify-between text-slate-400">
      <span className="text-[9px] font-black uppercase">{label}</span>
      {icon}
    </div>
    <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{value}</p>
  </div>
);

const Mini: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 min-w-[74px]">
    <p className="text-[9px] uppercase font-bold text-slate-400">{label}</p>
    <p className="font-mono font-bold text-[11px] text-slate-700 dark:text-slate-200 mt-0.5">{value}</p>
  </div>
);

const ActivityIcon: React.FC<{ category: string }> = ({ category }) => {
  if (category === 'auth') return <ShieldCheck className="w-4 h-4 text-emerald-500" />;
  if (category === 'conta') return <Building2 className="w-4 h-4 text-sky-500" />;
  if (category === 'cartao') return <CreditCard className="w-4 h-4 text-purple-500" />;
  if (category === 'boleto') return <FileText className="w-4 h-4 text-amber-500" />;
  return <Activity className="w-4 h-4 text-[#1367A2]" />;
};
