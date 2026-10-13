import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, Save, Settings2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type Config = {
  id: number;
  opening_balance_pf: number;
  opening_balance_pj: number;
  default_credit_limit: number;
  deposit_min: number;
  deposit_max: number;
  deposit_free_monthly: number;
  deposit_excess_fee: number;
  business_timezone: string;
  updated_at: string;
};
const fields: {key: keyof Config; label: string; step: string; helper: string}[] = [
  {key:'opening_balance_pf',label:'Saldo de abertura PF (fictício)',step:'0.01',helper:'Padrão: R$ 2.000,00'},
  {key:'opening_balance_pj',label:'Saldo de abertura PJ (fictício)',step:'0.01',helper:'Padrão preservado: R$ 10.000,00'},
  {key:'default_credit_limit',label:'Limite inicial do cartão de crédito',step:'0.01',helper:'Padrão: R$ 3.000,00'},
  {key:'deposit_min',label:'Depósito mínimo',step:'0.01',helper:'Nunca inferior a R$ 1,00'},
  {key:'deposit_max',label:'Depósito máximo',step:'0.01',helper:'Nunca superior a R$ 500,00'},
  {key:'deposit_free_monthly',label:'Depósitos mensais gratuitos',step:'1',helper:'Padrão: cinco por mês'},
  {key:'deposit_excess_fee',label:'Tarifa do depósito excedente',step:'0.01',helper:'R$ 0,00 até configurar uma tarifa fictícia'},
];
export const SystemConfigPage: React.FC = () => {
  const { platformRole, platformPermissions } = useAuth();
  const canEdit = platformRole === 'owner' || platformPermissions.includes('system.configure');
  const [config,setConfig] = useState<Config|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    const {data,error:e} = await supabase.rpc('platform_system_settings_get');
    if(e) setError(e.message);
    else setConfig(data as Config);
    setLoading(false);
  };
  useEffect(()=>{void load();},[]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if(!config || !canEdit || busy) return;
    setBusy(true);setError('');setNotice('');
    const {data,error:e}=await supabase.rpc('platform_system_settings_save',{
      p_opening_balance_pf: config.opening_balance_pf,
      p_opening_balance_pj: config.opening_balance_pj,
      p_default_credit_limit: config.default_credit_limit,
      p_deposit_min: config.deposit_min,
      p_deposit_max: config.deposit_max,
      p_deposit_free_monthly: config.deposit_free_monthly,
      p_deposit_excess_fee: config.deposit_excess_fee,
    });
    if(e) setError(e.message);
    else {setConfig(data as Config);setNotice('Parâmetros registrados no Supabase e auditados.');}
    setBusy(false);
  };
  return <div className="space-y-6 max-w-4xl">
    <header>
      <h2 className="font-extrabold text-2xl flex gap-2 items-center"><Settings2 className="text-teal-500"/> Regras e configurações</h2>
      <p className="text-sm text-slate-500 dark:text-slate-300 mt-2">Controle global do OptmaPay Sandbox. Os valores são fictícios e não representam dinheiro real.</p>
    </header>
    {loading && <p className="inline-flex items-center gap-2 text-sm"><RefreshCw className="animate-spin" size={17}/>Carregando parâmetros do banco...</p>}
    {error && <p role="alert" className="bg-rose-100 text-rose-800 rounded-xl p-3 flex gap-2 text-sm"><AlertCircle size={18}/>{error}</p>}
    {notice && <p role="status" className="bg-emerald-100 text-emerald-800 rounded-xl p-3 flex gap-2 text-sm"><CheckCircle2 size={18}/>{notice}</p>}
    {config && <form onSubmit={save} className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-2xl p-5 space-y-6">
      <div className="grid sm:grid-cols-2 gap-5">
        {fields.map(field=><label key={field.key} className="text-sm font-semibold">
          {field.label}
          <input disabled={!canEdit||busy} type="number" min="0" step={field.step} value={config[field.key] as number}
            onChange={e=>setConfig({...config,[field.key]:Number(e.target.value)})}
            className="block w-full p-3 mt-1 rounded-xl border dark:border-slate-600 dark:bg-slate-900 disabled:opacity-50"/>
          <span className="block text-xs font-normal text-slate-500 mt-1">{field.helper}</span>
        </label>)}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-300">Fuso operacional: {config.business_timezone}. Novas contas usam o saldo de abertura autorizado pelo banco. Os parâmetros de depósitos e cartões serão consumidos pelos respectivos motores quando suas próximas migrações forem homologadas.</p>
      <div className="flex flex-wrap justify-between items-center gap-3">
        <span className="text-xs text-slate-500">{config.updated_at ? 'Atualizado em '+new Date(config.updated_at).toLocaleString('pt-BR') : ''}</span>
        {canEdit && <button type="submit" disabled={busy} className="bg-teal-600 text-white rounded-xl px-5 py-3 font-semibold disabled:opacity-50 flex items-center gap-2"><Save size={16}/>{busy?'Salvando...':'Salvar regras'}</button>}
      </div>
    </form>}
  </div>;
};
