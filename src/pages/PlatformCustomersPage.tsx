import React, { useEffect, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { getPlatformCustomers, PlatformCustomerRow } from '../services/platformStaffService';

export const PlatformCustomersPage: React.FC = () => {
  const [rows, setRows] = useState<PlatformCustomerRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setError(''); setLoading(true);
    try { setRows(await getPlatformCustomers(search)); }
    catch (e: any) { setError(e?.message || 'Não foi possível consultar correntistas.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  return <section className="space-y-5">
    <header><h2 className="text-2xl font-extrabold inline-flex items-center gap-2"><Users/> Consulta de correntistas</h2><p className="text-sm text-slate-500 dark:text-slate-300 mt-2">Visão resumida. Operadores delegados não podem assumir contas, alterar saldos ou extratos.</p></header>
    <form onSubmit={e=>{e.preventDefault();void load();}} className="flex gap-2">
      <input type="search" aria-label="Pesquisar e-mail ou conta" placeholder="Pesquisar correntista..." value={search} onChange={e=>setSearch(e.target.value)} className="flex-1 p-3 rounded-xl border dark:bg-slate-800 dark:border-slate-700 min-w-0"/>
      <button className="bg-teal-600 text-white px-4 rounded-xl" type="submit"><Search size={18}/></button>
    </form>
    {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
    {loading ? <p className="text-sm">Carregando dados autorizados...</p> : <div className="grid gap-3">
      {rows.map(u=><article key={u.user_id} className="rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 p-4">
        <p className="font-semibold break-all">{u.email}</p>
        <p className="text-sm text-slate-500 dark:text-slate-300">Contas: {u.account_count} • PF: {u.pf_accounts} • PJ: {u.pj_accounts}</p>
        <p className="text-xs text-slate-500">Cadastro: {new Date(u.created_at).toLocaleDateString('pt-BR')}</p>
      </article>)}
      {!rows.length && !error && <p>Nenhum correntista encontrado.</p>}
    </div>}
  </section>;
};
