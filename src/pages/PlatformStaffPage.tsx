import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, LockKeyhole, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  PlatformOperator, PLATFORM_PERMISSION_OPTIONS, OPERATIONAL_PERMISSION_CODES,
  getPlatformOperators, savePlatformOperator, changePlatformOperatorEnabled,
} from '../services/platformStaffService';

const availablePermissions = (role: 'admin' | 'user') =>
  PLATFORM_PERMISSION_OPTIONS.filter(item => role === 'admin' || OPERATIONAL_PERMISSION_CODES.includes(item.value));

export const PlatformStaffPage: React.FC = () => {
  const { platformRole } = useAuth();
  const [operators, setOperators] = useState<PlatformOperator[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [permissions, setPermissions] = useState<string[]>(['customers.read']);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setOperators(await getPlatformOperators()); }
    catch (e: any) { setError(e?.message || 'Falha ao consultar operadores.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (platformRole !== 'owner') return <p role="alert">Apenas Owner pode gerenciar autoridades da plataforma.</p>;

  const choose = (operator: PlatformOperator) => {
    if (operator.role === 'owner') return;
    setEmail(operator.email);
    setRole(operator.role);
    setPermissions(operator.permissions);
    setEnabled(operator.enabled);
    setSuccess('');
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await savePlatformOperator({ email: email.trim().toLowerCase(),role,permissions,enabled });
      setSuccess('Permissões salvas e auditadas com sucesso.');
      await load();
    } catch (e: any) { setError(e?.message || 'Falha ao salvar operador.'); }
    finally { setBusy(false); }
  };

  const changeStatus = async (operator: PlatformOperator) => {
    if (operator.role === 'owner' || busy) return;
    if (!window.confirm(`${operator.enabled ? 'Suspender' : 'Reativar'} o acesso administrativo de ${operator.email}?`)) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await changePlatformOperatorEnabled(operator.user_id,!operator.enabled);
      setSuccess('Situação do operador alterada e auditada.');
      await load();
    } catch (e: any) { setError(e?.message || 'Falha ao atualizar acesso.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <header>
      <div className="flex items-center gap-3"><ShieldCheck className="text-teal-500"/><h2 className="text-2xl font-extrabold">Equipe e permissões</h2></div>
      <p className="text-sm text-slate-500 dark:text-slate-300 mt-2">Operadores da plataforma são independentes de correntistas. Somente o Owner atribui ou retira permissões.</p>
    </header>
    {error && <p role="alert" className="rounded-xl p-3 text-sm bg-rose-100 text-rose-800">{error}</p>}
    {success && <p role="status" className="rounded-xl p-3 text-sm bg-emerald-100 text-emerald-800 inline-flex gap-2"><CheckCircle2 size={17}/>{success}</p>}
    <div className="grid lg:grid-cols-5 gap-6">
      <form onSubmit={submit} className="lg:col-span-3 bg-white dark:bg-slate-800 dark:border-slate-700 rounded-2xl border p-5 space-y-5">
        <h3 className="font-bold inline-flex gap-2"><UserPlus size={18}/> Atribuir ou atualizar acesso</h3>
        <label className="block text-sm font-medium">E-mail da identidade administrativa
          <input type="email" required autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)}
            className="w-full rounded-lg p-3 border dark:bg-slate-900 dark:border-slate-600 mt-1" placeholder="operador@exemplo.com"/>
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-300">A identidade deve existir no Supabase Auth, ter e-mail confirmado e não possuir conta ou histórico bancário fictício. Este formulário não cria credenciais.</p>
        <label className="block text-sm font-medium">Papel
          <select className="w-full rounded-lg p-3 border dark:bg-slate-900 dark:border-slate-600 mt-1" value={role}
            onChange={e=>{const v=e.target.value as 'admin'|'user';setRole(v);setPermissions(p=>p.filter(x=>availablePermissions(v).some(o=>o.value===x)));}}>
            <option value="user">User interno — operacional</option>
            <option value="admin">Admin — delegado</option>
          </select>
        </label>
        <fieldset className="space-y-2"><legend className="text-sm font-bold mb-3">Permissões explícitas</legend>
          <div className="grid sm:grid-cols-2 gap-3">
            {availablePermissions(role).map(item=><label className="flex items-start gap-2 text-sm" key={item.value}>
              <input type="checkbox" checked={permissions.includes(item.value)}
                onChange={e=>setPermissions(prev=>e.target.checked?[...prev,item.value]:prev.filter(v=>v!==item.value))}
                className="mt-1"/><span>{item.label}<span className="block text-xs text-slate-500">{item.value}</span></span>
            </label>)}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Acesso habilitado</label>
        <button type="submit" disabled={busy} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl p-3 disabled:opacity-60">{busy?'Salvando...':'Salvar permissões'}</button>
      </form>
      <section className="lg:col-span-2 bg-white dark:bg-slate-800 dark:border-slate-700 rounded-2xl border p-5 space-y-4">
        <div className="flex justify-between items-center"><h3 className="font-bold">Operadores registrados</h3><button aria-label="Atualizar operadores" onClick={()=>void load()} disabled={loading}><RefreshCw size={17}/></button></div>
        {loading && <p className="text-sm">Consultando...</p>}
        {!loading && operators.length===0 && <p className="text-sm">Nenhum operador cadastrado.</p>}
        {operators.map(operator=><article key={operator.user_id} className="border dark:border-slate-700 rounded-xl p-3 space-y-2 text-sm">
          <p className="font-semibold break-all">{operator.email}</p>
          <div className="flex flex-wrap gap-2 text-xs"><span className="rounded bg-slate-100 dark:bg-slate-700 px-2 py-1 uppercase">{operator.role}</span><span className={operator.enabled?'text-emerald-600':'text-rose-600'}>{operator.enabled?'Ativo':'Suspenso'}</span></div>
          <p className="text-xs text-slate-500">{operator.role==='owner'?'Autoridade máxima':`${operator.permissions.length} permissões delegadas`}</p>
          {operator.role!=='owner' && <div className="flex gap-3">
            <button className="text-teal-600 underline" onClick={()=>choose(operator)}>Editar</button>
            <button className="text-amber-600 underline" disabled={busy} onClick={()=>void changeStatus(operator)}>{operator.enabled?'Suspender':'Reativar'}</button>
          </div>}
          {operator.role==='owner' && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><LockKeyhole size={12}/> Protegido</span>}
        </article>)}
      </section>
    </div>
  </div>;
};
