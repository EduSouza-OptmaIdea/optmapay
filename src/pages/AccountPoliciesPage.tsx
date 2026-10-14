import React, { useEffect, useState } from 'react';
import { Check, Clock, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { fetchEffectiveBankPolicy } from '../services/sandboxDepositService';
import {
  BankAccountSummary, BankAccountOverride, PixLimitRequest,
  findAccounts,getAccountOverride,saveAccountOverride,
  getAdminPixRequests,reviewPixLimitRequest,dispatchQueuedBankEmails,
} from '../services/bankPolicyService';

const money=(value:number|null|undefined)=>(Number(value||0)).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const toOptional=(value:string):number|null=>value.trim()===''?null:Number(value);
export const AccountPoliciesPage:React.FC=()=>{
  const [tab,setTab]=useState<'requests'|'exceptions'>('requests');
  const [search,setSearch]=useState('');
  const [accounts,setAccounts]=useState<BankAccountSummary[]>([]);
  const [selected,setSelected]=useState<BankAccountSummary|null>(null);
  const [effective,setEffective]=useState<Awaited<ReturnType<typeof fetchEffectiveBankPolicy>>|null>(null);
  const [override,setOverride]=useState<BankAccountOverride>({});
  const [min,setMin]=useState(''); const [max,setMax]=useState('');
  const [daily,setDaily]=useState(''); const [night,setNight]=useState('');
  const [freeDeposits,setFreeDeposits]=useState('');
  const [depositFee,setDepositFee]=useState('');
  const [cardLimit,setCardLimit]=useState('');
  const [monthlyFee,setMonthlyFee]=useState('');
  const [reason,setReason]=useState('');
  const [expiry,setExpiry]=useState('');
  const [requests,setRequests]=useState<PixLimitRequest[]>([]);
  const [status,setStatus]=useState<'pending'|'all'|'approved'|'rejected'>('pending');
  const [reviewId,setReviewId]=useState<string|null>(null);
  const [reviewNote,setReviewNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  const loadRequests=async(filter:typeof status=status)=>{
    setLoading(true);setError('');
    try{setRequests(await getAdminPixRequests(filter));}
    catch(e:unknown){setError(e instanceof Error?e.message:'Falha ao buscar pedidos.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void loadRequests('pending');},[]);
  const loadAccounts=async()=>{
    setLoading(true);setError('');
    try{setAccounts(await findAccounts(search.trim()));}
    catch(e:unknown){setError(e instanceof Error?e.message:'Falha ao buscar correntistas.');}
    finally{setLoading(false);}
  };
  const selectAccount=async(account:BankAccountSummary)=>{
    setSelected(account);setLoading(true);setError('');setSuccess('');
    try{
      const [eff,ov]=await Promise.all([fetchEffectiveBankPolicy(account.id),getAccountOverride(account.id)]);
      setEffective(eff);setOverride(ov);
      setMin(ov.deposit_min==null?'':String(ov.deposit_min));
      setMax(ov.deposit_max==null?'':String(ov.deposit_max));
      setDaily(ov.pix_daily_limit==null?'':String(ov.pix_daily_limit));
      setNight(ov.pix_night_limit==null?'':String(ov.pix_night_limit));
      setFreeDeposits(ov.deposit_free_monthly==null?'':String(ov.deposit_free_monthly));
      setDepositFee(ov.deposit_excess_fee==null?'':String(ov.deposit_excess_fee));
      setCardLimit(ov.card_credit_limit==null?'':String(ov.card_credit_limit));
      setMonthlyFee(ov.service_monthly_fee==null?'':String(ov.service_monthly_fee));
      setReason(ov.reason||'');
      setExpiry(ov.valid_until?new Date(ov.valid_until).toISOString().slice(0,10):'');
    }catch(e:unknown){setError(e instanceof Error?e.message:'Não foi possível carregar condições.');}
    finally{setLoading(false);}
  };
  const save=async(e:React.FormEvent)=>{
    e.preventDefault();if(!selected||busy)return;
    setBusy(true);setError('');setSuccess('');
    try{
      const obj={
        deposit_min:toOptional(min),deposit_max:toOptional(max),
        pix_daily_limit:toOptional(daily),pix_night_limit:toOptional(night),
        deposit_free_monthly:toOptional(freeDeposits),deposit_excess_fee:toOptional(depositFee),
        card_credit_limit:toOptional(cardLimit),service_monthly_fee:toOptional(monthlyFee),
      };
      if(Object.entries(obj).some(([k,v])=>v!==null&&(!Number.isFinite(v)||
        ((k==='deposit_min'||k==='deposit_max')&&Math.round(v*100)%5!==0))))throw new Error('Valores inválidos. Depósitos exigem múltiplos de R$ 0,05.');
      await saveAccountOverride(selected.id,obj,reason,expiry?new Date(expiry+'T23:59:59-03:00').toISOString():null);
      await selectAccount(selected);
      setSuccess('Exceção individual salva, registrada em auditoria e aplicada pelo motor bancário.');
    }catch(e:unknown){setError(e instanceof Error?e.message:'Não foi possível salvar condições.');}
    finally{setBusy(false);}
  };
  const review=async(request:PixLimitRequest,decision:'approved'|'rejected')=>{
    if(busy)return;
    if(reviewNote.trim().length<8){setError('Informe uma justificativa com pelo menos 8 caracteres.');return;}
    setBusy(true);setError('');setSuccess('');
    try{
      await reviewPixLimitRequest(request.id,decision,reviewNote);
      setReviewId(null);setReviewNote('');
      setSuccess(decision==='approved'?'Aumento aprovado e aplicado à conta. Cliente notificado na aplicação.':'Pedido recusado. Cliente notificado na aplicação.');
      await loadRequests(status);
      void dispatchQueuedBankEmails(request.id);
    }catch(e:unknown){setError(e instanceof Error?e.message:'Falha ao analisar solicitação.');}
    finally{setBusy(false);}
  };
  return <div className="max-w-6xl space-y-5">
    <header><h2 className="text-2xl font-extrabold flex gap-2 items-center"><ShieldCheck className="text-teal-500"/> Condições individuais e análise Pix</h2>
      <p className="text-sm text-slate-500 dark:text-slate-300 mt-2">Regras gerais PF/PJ em Configurações; aqui ficam exceções justificadas por correntista e aprovação de solicitações. Todas as decisões são auditadas.</p></header>
    <div className="flex gap-2 flex-wrap">
      <button type="button" onClick={()=>{setTab('requests');void loadRequests(status);}} className={'rounded-lg px-4 py-2 text-sm font-bold '+(tab==='requests'?'bg-teal-600 text-white':'border dark:border-slate-700')}>Solicitações Pix</button>
      <button type="button" onClick={()=>{setTab('exceptions');void loadAccounts();}} className={'rounded-lg px-4 py-2 text-sm font-bold '+(tab==='exceptions'?'bg-teal-600 text-white':'border dark:border-slate-700')}>Condições individuais</button>
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-100 text-rose-800 p-3 text-sm">{error}</p>}
    {success && <p role="status" className="rounded-xl bg-emerald-100 text-emerald-800 p-3 text-sm">{success}</p>}
    {tab==='requests'&&<section className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <label className="text-sm font-semibold">Situação
          <select className="ml-2 rounded-lg border p-2 dark:bg-slate-800 dark:border-slate-700" value={status} onChange={e=>{const v=e.target.value as typeof status;setStatus(v);void loadRequests(v);}}>
            <option value="pending">Pendentes</option><option value="approved">Aprovados</option><option value="rejected">Recusados</option><option value="all">Todos</option>
          </select>
        </label>
        <button type="button" onClick={()=>void loadRequests()} className="text-sm text-teal-600 underline flex items-center gap-2"><RefreshCw size={16}/> Atualizar</button>
      </div>
      {loading&&<p>Buscando pedidos...</p>}
      {!loading&&!requests.length&&<p className="border rounded-xl p-5 text-sm">Nenhuma solicitação encontrada para o filtro.</p>}
      {requests.map(req=><article key={req.id} className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-2xl p-5 space-y-3">
        <div className="flex justify-between gap-3 flex-wrap">
          <div><h3 className="font-bold">{req.account_name||'Conta'}</h3><p className="text-xs text-slate-500">{req.customer_email} • {req.account_type==='customer'?'PF':'PJ'}</p></div>
          <span className="text-sm font-bold flex gap-2 items-center"><Clock size={16}/>{req.status==='pending'?'Pendente':req.status==='approved'?'Aprovado':'Recusado'}</span>
        </div>
        <div className="flex gap-4 flex-wrap text-sm"><span>Pix diário: <strong>{money(req.requested_daily_limit)}</strong></span><span>Noturno: <strong>{money(req.requested_night_limit)}</strong></span></div>
        <p className="text-sm whitespace-pre-line">Motivo do cliente: {req.reason}</p>
        <p className="text-xs text-slate-500">{new Date(req.created_at).toLocaleString('pt-BR')}</p>
        <button type="button" className="text-xs text-teal-600 underline"
          onClick={async()=>{await dispatchQueuedBankEmails(req.id);setSuccess('Reprocessamento da fila de e-mails solicitado. As mensagens da aplicação permanecem disponíveis.');}}>
          Reprocessar e-mails pendentes deste pedido
        </button>
        {req.review_note&&<p className="text-sm">Justificativa da decisão: {req.review_note}</p>}
        {req.status==='pending'&&<div className="space-y-2">
          {reviewId===req.id?<div className="space-y-2">
            <label className="block text-sm">Justificativa administrativa
              <textarea className="w-full mt-1 p-3 rounded-lg border dark:bg-slate-900 dark:border-slate-700" rows={2} minLength={8} maxLength={600} value={reviewNote} onChange={e=>setReviewNote(e.target.value)}
                placeholder="Explique a decisão para o cliente."/>
            </label>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} type="button" onClick={()=>void review(req,'approved')} className="rounded-lg px-4 py-2 bg-teal-600 text-white font-bold text-xs flex items-center gap-1"><Check size={15}/>Aprovar e aplicar</button>
              <button disabled={busy} type="button" onClick={()=>void review(req,'rejected')} className="rounded-lg px-4 py-2 bg-rose-600 text-white font-bold text-xs flex items-center gap-1"><X size={15}/>Recusar</button>
              <button type="button" onClick={()=>setReviewId(null)} className="p-2 text-xs underline">Cancelar</button>
            </div>
          </div>:<button type="button" onClick={()=>{setReviewId(req.id);setReviewNote('');}} className="text-teal-600 text-sm underline">Analisar solicitação</button>}
        </div>}
      </article>)}
    </section>}
    {tab==='exceptions'&&<div className="grid lg:grid-cols-5 gap-5">
      <section className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 p-4 space-y-3">
        <h3 className="font-bold">Localizar correntista</h3>
        <form onSubmit={e=>{e.preventDefault();void loadAccounts();}} className="flex gap-2">
          <input aria-label="Nome, e-mail ou conta" placeholder="Nome, e-mail, número" value={search} onChange={e=>setSearch(e.target.value)}
            className="min-w-0 flex-1 p-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700"/>
          <button aria-label="Pesquisar" className="rounded-lg bg-teal-600 text-white px-3"><Search size={18}/></button>
        </form>
        {loading&&<p className="text-sm">Consultando...</p>}
        <div className="max-h-[520px] overflow-y-auto space-y-2">
          {accounts.map(a=><button type="button" key={a.id} onClick={()=>void selectAccount(a)}
            className={'w-full text-left border rounded-xl p-3 text-sm dark:border-slate-700 '+(selected?.id===a.id?'border-teal-600 bg-teal-50 dark:bg-teal-950':'')}>
            <span className="font-bold block">{a.name}</span>
            <span className="text-xs text-slate-500 block truncate">{a.email} • {a.type==='customer'?'PF':'PJ'}</span>
            {a.has_override&&<span className="text-xs text-teal-600">Condição individual cadastrada</span>}
          </button>)}
        </div>
      </section>
      <section className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-2xl border dark:border-slate-700 p-5">
        {!selected?<p className="text-sm text-slate-500">Selecione uma conta para visualizar e ajustar as exceções.</p>:<form onSubmit={save} className="space-y-4">
          <h3 className="font-bold">Condições de {selected.name}</h3>
          {effective&&<p className="text-xs text-slate-500">Efetivas: depósito {money(effective.deposit_min)}–{money(effective.deposit_max)}; Pix diário {money(effective.pix_daily_limit)}, noturno {money(effective.pix_night_limit)}</p>}
          <p className="text-xs text-slate-500">Deixe um campo vazio para usar o padrão PF/PJ. Nenhuma exceção é aplicada sem salvamento e justificativa. Alterações no limite inicial de cartão valem para cartões emitidos depois; não modificam cartões existentes.</p>
          {effective && <p className="text-xs text-slate-500">Política atual: {effective.deposit_free_monthly} depósitos grátis/mês, tarifa {money(effective.deposit_excess_fee)}, cartão {money(effective.card_credit_limit)}, serviços {money(effective.service_monthly_fee)}/mês.</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            {([
              ['deposit_min','Depósito mínimo','0.05',min,setMin],
              ['deposit_max','Depósito máximo','0.05',max,setMax],
              ['pix_daily_limit','Pix diário','0.01',daily,setDaily],
              ['pix_night_limit','Pix noturno','0.01',night,setNight],
              ['deposit_free_monthly','Depósitos gratuitos por mês','1',freeDeposits,setFreeDeposits],
              ['deposit_excess_fee','Tarifa de depósito excedente','0.01',depositFee,setDepositFee],
              ['card_credit_limit','Limite inicial de cartão crédito','0.01',cardLimit,setCardLimit],
              ['service_monthly_fee','Mensalidade fictícia de serviços','0.01',monthlyFee,setMonthlyFee],
            ] as const).map(([key,label,step,value,setValue])=><label key={key} className="text-xs font-semibold">{label} (R$)
              <input type="number" step={step} min="0" value={value} onChange={e=>setValue(e.target.value)}
                className="block w-full mt-1 p-3 border dark:bg-slate-900 dark:border-slate-700 rounded-lg" placeholder="Padrão PF/PJ"/>
            </label>)}
          </div>
          <label className="block text-xs font-semibold">Validade da exceção (opcional)
            <input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}
              className="block w-full mt-1 p-3 border dark:bg-slate-900 dark:border-slate-700 rounded-lg"/>
          </label>
          <label className="block text-xs font-semibold">Justificativa obrigatória
            <textarea required minLength={8} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}
              className="block w-full mt-1 p-3 border dark:bg-slate-900 dark:border-slate-700 rounded-lg" rows={3}/>
          </label>
          <button type="submit" disabled={busy||loading} className="rounded-xl bg-teal-600 text-white font-bold px-4 py-3 disabled:opacity-50">{busy?'Salvando...':'Salvar condições individuais'}</button>
          {override.updated_at&&<p className="text-xs text-slate-500">Última alteração: {new Date(override.updated_at).toLocaleString('pt-BR')}</p>}
        </form>}
      </section>
    </div>}
  </div>;
};
