import React, { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, BookOpen, CreditCard, LayoutDashboard, LogOut, MessageSquare, Settings, ShieldCheck, Users, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/Logo';
import { AdminLogin } from './AdminLogin';
import { SuperAdminUsersActivity } from './SuperAdminUsersActivity';
import { PlatformStaffPage } from './PlatformStaffPage';
import { PlatformCustomersPage } from './PlatformCustomersPage';
import { superAdminFetchUserMetrics, SuperAdminUserMetrics } from '../lib/supabase/accountService';

const navigation = [
  { to: '/admin', label: 'Visão geral', icon: LayoutDashboard },
  { to: '/admin/correntistas', label: 'Correntistas e atividades', icon: Users },
  { to: '/admin/configuracoes', label: 'Regras e configurações', icon: Settings },
  { to: '/admin/operadores', label: 'Equipe e permissões', icon: ShieldCheck },
  { to: '/admin/mensagens', label: 'Central de mensagens', icon: MessageSquare },
  { to: '/admin/educacao', label: 'Educação e módulos futuros', icon: BookOpen },
];

const PendingModule = ({ title, description }: { title: string; description: string }) => (
  <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
    <h2 className="text-xl font-bold">{title}</h2>
    <p className="text-sm text-slate-500 dark:text-slate-300 mt-3">{description}</p>
    <p className="text-xs text-amber-700 dark:text-amber-300 mt-4">Módulo em preparação. Nenhuma configuração é simulada como persistida.</p>
  </section>
);

const AdminOverview = () => {
  const [metrics, setMetrics] = useState<SuperAdminUserMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    superAdminFetchUserMetrics().then(data => { if (active) setMetrics(data); }).catch(e => {
      if (active) setError(e?.message || 'Não foi possível carregar os indicadores.');
    });
    return () => { active = false; };
  }, []);
  return <div className="space-y-6">
    <div>
      <h2 className="text-2xl font-extrabold">Visão geral da plataforma</h2>
      <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">Administração do OptmaPay Sandbox, independente das contas bancárias fictícias.</p>
    </div>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    <div className="grid sm:grid-cols-3 gap-4">
      <div className="p-5 rounded-2xl border bg-white dark:bg-slate-800 dark:border-slate-700"><Users className="text-teal-500 mb-3"/><p className="text-sm font-bold">Correntistas</p><p className="text-xs text-slate-500 mt-2">Consulte usuários, contas e atividade operacional no módulo dedicado.</p><Link to="/admin/correntistas" className="text-sm text-teal-600 inline-flex gap-1 mt-4">Abrir consulta <ArrowRight size={15}/></Link></div>
      <div className="p-5 rounded-2xl border bg-white dark:bg-slate-800 dark:border-slate-700"><Wallet className="text-teal-500 mb-3"/><p className="text-sm font-bold">Operações fictícias</p><p className="text-xs text-slate-500 mt-2">Informações operacionais sem assumir contas de terceiros.</p></div>
      <div className="p-5 rounded-2xl border bg-white dark:bg-slate-800 dark:border-slate-700"><CreditCard className="text-teal-500 mb-3"/><p className="text-sm font-bold">Políticas globais</p><p className="text-xs text-slate-500 mt-2">Depósitos, tarifas, saldos iniciais e cartões terão configurações autorizadas e auditadas.</p></div>
    </div>
    <div className="rounded-2xl border dark:border-slate-700 p-5"><Activity size={20} className="text-teal-500"/><h3 className="font-bold mt-2">Status administrativo</h3><p className="text-sm text-slate-500 dark:text-slate-300 mt-2">{metrics ? 'Consulta de métricas administrativas disponível.' : 'Carregando indicadores autorizados...'}</p></div>
  </div>;
};

export const AdminArea: React.FC = () => {
  const { user, loading, isPlatformStaff, platformRole, platformPermissions, signOut } = useAuth();
  const navigate = useNavigate();
  if (loading) return <div className="min-h-screen flex items-center justify-center">Validando autoridade administrativa...</div>;
  if (!user) return <AdminLogin />;
  if (!isPlatformStaff) return <div className="min-h-screen flex items-center justify-center p-8"><div role="alert" className="space-y-4"><h1 className="font-bold">Acesso administrativo não autorizado</h1><p>Esta sessão não possui permissão para administrar a plataforma.</p><button className="rounded-xl bg-teal-600 text-white px-4 py-2" onClick={async()=>{await signOut();navigate('/admin');}}>Sair e entrar com uma conta administrativa</button><div><Link className="text-teal-600 underline" to="/">Voltar à página inicial</Link></div></div></div>;
  const can = (permission: string) => platformRole === 'owner' || platformPermissions.includes(permission);
  const denied = <p role="alert">Sem permissão administrativa para este módulo.</p>;
  return <div className="min-h-screen bg-[#F8F6F2] dark:bg-[#0F172A] text-slate-900 dark:text-slate-100">
    <header className="bg-white dark:bg-slate-900 border-b dark:border-slate-700 px-5 py-4 flex flex-wrap justify-between items-center gap-4">
      <div className="flex items-center gap-4"><Logo heightClass="h-8"/><div className="border-l pl-4 dark:border-slate-700"><h1 className="font-extrabold">Administração OptmaPay</h1><p className="text-xs text-slate-500">Controle da plataforma • Sandbox</p></div></div>
      <button onClick={async()=>{await signOut();navigate('/');}} className="inline-flex items-center gap-2 text-sm font-semibold rounded-xl border dark:border-slate-700 px-4 py-2"><LogOut size={16}/> Sair</button>
    </header>
    <div className="max-w-7xl mx-auto md:flex">
      <nav aria-label="Administração" className="md:w-64 shrink-0 p-4 flex md:flex-col gap-2 overflow-x-auto border-b md:border-b-0 md:border-r dark:border-slate-700">
        {navigation.map(item=><Link key={item.to} to={item.to} className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-3 text-sm font-semibold hover:bg-white dark:hover:bg-slate-800"><item.icon size={18}/>{item.label}</Link>)}
      </nav>
      <main className="p-5 sm:p-8 flex-1 min-w-0"><Routes>
        <Route index element={<AdminOverview/>}/>
        <Route path="correntistas" element={<SuperAdminUsersActivity/>}/>
        <Route path="configuracoes" element={<PendingModule title="Regras e configurações" description="Parâmetros financeiros configuráveis serão implementados com validação no banco e auditoria."/>}/>
        <Route path="operadores" element={<PendingModule title="Equipe e permissões" description="Perfis Owner, Admin e User interno serão independentes das contas de correntista."/>}/>
        <Route path="mensagens" element={<PendingModule title="Central de mensagens" description="Comunicações segmentadas e auditadas serão disponibilizadas após implantação do backend."/>}/>
        <Route path="educacao" element={<PendingModule title="Educação, investimentos e OptmaShop" description="Módulos educacionais e simulados separados dos controles administrativos."/>}/>
        <Route path="*" element={<Navigate to="/admin" replace/>}/>
      </Routes></main>
    </div>
  </div>;
};
