import React, { useEffect, useState } from 'react';
import { BadgeDollarSign, CreditCard, RefreshCw, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BankTypePolicy, getTypePolicies, saveTypePolicy } from '../services/bankPolicyService';

const money=(v:number)=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fields = [
  {key:'deposit_free_monthly',label:'Depósitos gratuitos por mês',step:'1',min:0,max:100,detail:'Depois dessa franquia, incide a tarifa fictícia configurada.'},
  {key:'deposit_excess_fee',label:'Tarifa por depósito excedente (R$)',step:'0.01',min:0,max:500,detail:'A tarifa nunca pode consumir todo o valor do depósito.'},
  {key:'card_credit_limit',label:'Limite inicial de cartão de crédito (R$)',step:'0.01',min:0,max:1000000,detail:'Aplica-se aos cartões emitidos após o salvamento. Cartões anteriores permanecem inalterados.'},
  {key:'service_monthly_fee',label:'Mensalidade de serviços (R$)',step:'0.01',min:0,max:10000,detail:'Cobrança fictícia recorrente, sem pagamento comercial real.'},
] as const;

export const FeesAndServicesPage: React.FC = () => {
  const {platformRole,platformPermissions}=useAuth();
  const canManage=platformRole==='owner'||platformPermissions.includes('system.configure');
  const [rows,setRows]=useState<BankTypePolicy[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const reload=async()=>{
    setLoading(true);setError('');
    try{setRows(await getTypePolicies());}
    catch(e:unknown){setError(e instanceof Error?e.message:'Não foi possível carregar as tarifas.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void reload();},[]);

  const change=(accountType:BankTypePolicy['account_type'],key:typeof fields[number]['key'],value:string)=>{
    setRows(old=>old.map(row=>row.account_type===accountType?{...row,[key]:Number(value)}:row));
  };
  const save=async(accountType:BankTypePolicy['account_type'])=>{
    const policy=rows.find(p=>p.account_type===accountType);
    if(!policy || saving || !canManage)return;
    if(!Number.isInteger(policy.deposit_free_monthly) ||
      fields.some(f=>!Number.isFinite(Number(policy[f.key]))||Number(policy[f.key])<f.min||Number(policy[f.key])>f.max)){
      setError('Revise os valores, inclusive a quantidade inteira de depósitos gratuitos.');return;
    }
    setSaving(accountType);setError('');setNotice('');
    try{
      await saveTypePolicy(policy,null,null);
      setNotice('Tarifas e serviços '+(accountType==='customer'?'PF':'PJ')+' atualizados e auditados.');
      await reload();
    }catch(e:unknown){setError(e instanceof Error?e.message:'Falha ao salvar políticas.');}
    finally{setSaving(null);}
  };

  return <main className="max-w-5xl space-y-5">
    <header>
      <h2 className="text-2xl font-extrabold flex items-center gap-2"><BadgeDollarSign className="text-teal-600"/> Taxas de serviços e cartões</h2>
      <p className="text-sm mt-2 text-slate-500 dark:text-slate-300">Administração de tarifas fictícias do banco sandbox, com regras independentes para pessoas físicas e jurídicas.</p>
    </header>
    <p className="border-l-4 border-teal-500 bg-teal-50 dark:bg-teal-950 rounded-lg p-4 text-sm">
      Padrões iniciais: <strong>PF R$ 0,00/mês</strong> e <strong>PJ R$ 29,90/mês</strong>. A política de mensalidade PJ passa a ser usada nos ciclos a partir de novembro de 2026. Lançamentos anteriores permanecem inalterados.
    </p>
    {loading&&<p className="text-sm flex items-center gap-2"><RefreshCw size={16} className="animate-spin"/> Consultando tarifas oficiais...</p>}
    {error&&<p role="alert" className="bg-rose-100 text-rose-800 rounded-xl p-3 text-sm">{error}</p>}
    {notice&&<p role="status" className="bg-emerald-100 text-emerald-800 rounded-xl p-3 text-sm">{notice}</p>}
    <div className="grid md:grid-cols-2 gap-4">
      {rows.map(policy=><section key={policy.account_type} className="rounded-2xl border bg-white dark:bg-slate-800 dark:border-slate-700 p-5 space-y-5">
        <h3 className="font-extrabold text-lg">{policy.account_type==='customer'?'Pessoa Física (PF)':'Pessoa Jurídica (PJ)'}</h3>
        <div className="space-y-3">
          {fields.map(field=><label className="text-sm font-semibold block" key={field.key}>
            {field.label}
            <input type="number" step={field.step} min={field.min} max={field.max}
              disabled={!canManage||saving!==null} value={policy[field.key]}
              onChange={e=>change(policy.account_type,field.key,e.target.value)}
              className="mt-1 block rounded-lg border dark:border-slate-600 dark:bg-slate-900 w-full p-3 disabled:opacity-50"/>
            <span className="font-normal block text-xs text-slate-500 mt-1">{field.detail}</span>
          </label>)}
        </div>
        <div className="border-t dark:border-slate-700 pt-3 space-y-2">
          <p className="font-bold text-sm flex items-center gap-2"><CreditCard size={16} className="text-teal-600"/> Resumo do perfil</p>
          <p className="text-sm">Serviços: <strong>{money(policy.service_monthly_fee)}/mês</strong></p>
          <p className="text-sm">Tarifa de depósito: <strong>{money(policy.deposit_excess_fee)}</strong> após {policy.deposit_free_monthly} operações gratuitas</p>
          <p className="text-sm">Novo cartão de crédito: <strong>{money(policy.card_credit_limit)}</strong></p>
        </div>
        {canManage&&<button type="button" disabled={saving!==null}
          onClick={()=>void save(policy.account_type)}
          className="bg-teal-600 text-white rounded-xl px-5 py-3 font-bold flex items-center gap-2 disabled:opacity-40">
          <Save size={17}/>{saving===policy.account_type?'Salvando...':'Salvar condições '+(policy.account_type==='customer'?'PF':'PJ')}
        </button>}
      </section>)}
    </div>
    <p className="text-xs text-slate-500">Para tratar um correntista diferenciado, utilize Administração → Condições individuais e Pix. As mensalidades e taxas bancárias apresentadas aqui não são cobrança comercial pela assinatura do software OptmaPay.</p>
  </main>;
};
