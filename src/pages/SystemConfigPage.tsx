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
  pix_night_start_hour: number;
  pix_night_end_hour: number;
  updated_at: string;
};
const fields: {key: keyof Config; label: string; step: string; helper: string}[] = [
  {key:'opening_balance_pf',label:'Saldo de abertura PF (fictício)',step:'0.01',helper:'Padrão: R$ 2.000,00'},
  {key:'opening_balance_pj',label:'Saldo de abertura PJ (fictício)',step:'0.01',helper:'Padrão preservado: R$ 10.000,00'},
];
type TypePolicy = {
  account_type: 'customer' | 'merchant';
  deposit_min: number; deposit_max: number;
  pix_daily_limit: number; pix_night_limit: number;
  deposit_free_monthly: number; deposit_excess_fee: number;
  card_credit_limit: number; service_monthly_fee: number;
};
const bankMoney = (v: number) => Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const SystemConfigPage: React.FC = () => {
  const { platformRole, platformPermissions } = useAuth();
  const canEdit = platformRole === 'owner' || platformPermissions.includes('system.configure');
  const [config,setConfig] = useState<Config|null>(null);
  const [typePolicies,setTypePolicies] = useState<TypePolicy[]>([]);
  const [savingType,setSavingType] = useState<string | null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    const [settings, types] = await Promise.all([supabase.rpc('platform_system_settings_get'),supabase.rpc('platform_type_policies_list')]);
    if(settings.error || types.error) setError(settings.error?.message || types.error?.message || 'Erro ao consultar políticas.');
    else {setConfig(settings.data as Config);setTypePolicies((types.data || []) as TypePolicy[]);}
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
  const patchType = (kind: TypePolicy['account_type'], key: keyof TypePolicy, value: number) => {
    setTypePolicies(rows=>rows.map(p=>p.account_type===kind ? {...p,[key]:value} : p));
  };
  const saveType = async (kind: TypePolicy['account_type']) => {
    const policy=typePolicies.find(row=>row.account_type===kind);
    if(!policy || !canEdit || !config) return;
    setSavingType(kind);setError('');setNotice('');
    try {
      const {error:e}=await supabase.rpc('platform_type_policy_save_v2',{
        p_account_type:kind,p_deposit_min:policy.deposit_min,p_deposit_max:policy.deposit_max,
        p_pix_daily_limit:policy.pix_daily_limit,p_pix_night_limit:policy.pix_night_limit,
        p_pix_night_start_hour:config.pix_night_start_hour,p_pix_night_end_hour:config.pix_night_end_hour,
        p_deposit_free_monthly:policy.deposit_free_monthly,p_deposit_excess_fee:policy.deposit_excess_fee,
        p_card_credit_limit:policy.card_credit_limit,p_service_monthly_fee:policy.service_monthly_fee,
      });
      if(e) throw e;
      setNotice('Política '+(kind==='customer'?'PF':'PJ')+' salva e auditada no PostgreSQL.');
      await load();
    } catch(e:unknown){setError(e instanceof Error?e.message:String(e));}
    finally{setSavingType(null);}
  };
  return <div className="space-y-6 max-w-4xl">
    <header>
      <h2 className="font-extrabold text-2xl flex gap-2 items-center"><Settings2 className="text-teal-500"/> Regras e configurações</h2>
      <p className="text-sm text-slate-500 dark:text-slate-300 mt-2">Controle global do OptmaPay Sandbox. Os valores são fictícios e não representam dinheiro real.</p>
    </header>
    {loading && <p className="inline-flex items-center gap-2 text-sm"><RefreshCw className="animate-spin" size={17}/>Carregando parâmetros do banco...</p>}
    {error && <p role="alert" className="bg-rose-100 text-rose-800 rounded-xl p-3 flex gap-2 text-sm"><AlertCircle size={18}/>{error}</p>}
    {notice && <p role="status" className="bg-emerald-100 text-emerald-800 rounded-xl p-3 flex gap-2 text-sm"><CheckCircle2 size={18}/>{notice}</p>}
    {config && <section className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-2xl p-5 space-y-5">
      <h3 className="text-lg font-extrabold">Limites gerais por perfil — Pessoa Física e Pessoa Jurídica</h3>
      <p className="text-xs text-slate-500 dark:text-slate-300">As exceções para clientes específicos são cadastradas em Condições individuais. Depósitos exigem múltiplos de R$ 0,05. Todos os valores são fictícios.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        {typePolicies.map(policy=><div key={policy.account_type} className="border dark:border-slate-600 rounded-xl p-4 space-y-3">
          <h4 className="font-bold">{policy.account_type==='customer'?'Pessoa Física (PF)':'Pessoa Jurídica (PJ)'}</h4>
          {([
            ['deposit_min','Depósito mínimo (R$)','0.05'],
            ['deposit_max','Depósito máximo (R$)','0.05'],
            ['pix_daily_limit','Pix diário (R$)','0.01'],
            ['pix_night_limit','Pix noturno (R$)','0.01'],
            ['deposit_free_monthly','Depósitos gratuitos/mês','1'],
            ['deposit_excess_fee','Tarifa de depósito excedente (R$)','0.01'],
            ['card_credit_limit','Limite inicial de cartão crédito (R$)','0.01'],
            ['service_monthly_fee','Mensalidade fictícia de serviços (R$)','0.01'],
          ] as const).map(([key,label,step])=><label key={key} className="text-xs font-semibold block">{label}
            <input type="number" required min={key==='deposit_min'||key==='deposit_max'?0.05:0} max={key==='deposit_max'||key==='card_credit_limit'?1000000:key.startsWith('pix')?10000000:key==='deposit_free_monthly'?100:key==='service_monthly_fee'?10000:undefined}
              step={step} disabled={!canEdit||savingType!==null} value={policy[key]}
              onChange={e=>patchType(policy.account_type,key,Number(e.target.value))}
              className="block w-full p-2 mt-1 rounded-lg border dark:border-slate-600 dark:bg-slate-900"/>
          </label>)}
          <p className="text-xs text-slate-500">Máximo de depósito: {bankMoney(policy.deposit_max)} • Mensalidade: {bankMoney(policy.service_monthly_fee)}. Cartões existentes não têm o limite alterado automaticamente.</p>
          {canEdit && <button type="button" disabled={savingType!==null} onClick={()=>void saveType(policy.account_type)} className="rounded-lg bg-teal-600 text-white font-bold text-xs px-4 py-2 disabled:opacity-50">{savingType===policy.account_type?'Salvando...':'Salvar política '+(policy.account_type==='customer'?'PF':'PJ')}</button>}
        </div>)}
      </div>
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        {([['pix_night_start_hour','Início da noite'],['pix_night_end_hour','Fim da noite']] as const).map(([key,label])=>
          <label key={key} className="text-xs font-bold">{label}
            <select disabled={!canEdit} value={config[key]} onChange={e=>setConfig({...config,[key]:Number(e.target.value)})}
              className="block w-full p-2 border rounded-lg dark:bg-slate-900 dark:border-slate-600 mt-1">
              {Array.from({length:24},(_,i)=><option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>)}
            </select>
          </label>)}
      </div>
      <p className="text-xs text-slate-500">Horário de Brasília. A janela noturna é gravada ao salvar uma política PF ou PJ e vale para ambas.</p>
    </section>}
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
      <p className="text-xs text-slate-500 dark:text-slate-300">Fuso operacional: {config.business_timezone}. Novas contas usam o saldo de abertura autorizado pelo banco. Limites, franquias e tarifas de depósito, Pix, emissão de cartão de crédito e mensalidade fictícia são definidos por perfil PF/PJ. O motor de mensalidades PJ usa a nova política a partir de novembro de 2026; não altera cobranças passadas.</p>
      <div className="flex flex-wrap justify-between items-center gap-3">
        <span className="text-xs text-slate-500">{config.updated_at ? 'Atualizado em '+new Date(config.updated_at).toLocaleString('pt-BR') : ''}</span>
        {canEdit && <button type="submit" disabled={busy} className="bg-teal-600 text-white rounded-xl px-5 py-3 font-semibold disabled:opacity-50 flex items-center gap-2"><Save size={16}/>{busy?'Salvando...':'Salvar regras'}</button>}
      </div>
    </form>}
  </div>;
};
