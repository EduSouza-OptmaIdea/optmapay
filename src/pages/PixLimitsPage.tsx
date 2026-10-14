import React, { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Clock, Info, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  PixLimitSnapshot, PixLimitRequest, getPixSnapshot,
  getMyPixRequests, sendPixLimitRequest, dispatchQueuedBankEmails,
} from '../services/bankPolicyService';

const money = (n:number) => Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const PixLimitsPage: React.FC = () => {
  const { activeAccount }=useAuth();
  const [snapshot,setSnapshot]=useState<PixLimitSnapshot|null>(null);
  const [requests,setRequests]=useState<PixLimitRequest[]>([]);
  const [daily,setDaily]=useState('');
  const [night,setNight]=useState('');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const accountId=activeAccount?.id;
  const load=useCallback(async()=>{
    if(!accountId)return;
    setLoading(true);setError('');
    try{
      const [current,history]=await Promise.all([getPixSnapshot(accountId),getMyPixRequests(accountId)]);
      setSnapshot(current);setRequests(history);
      setDaily(String(current.pix_daily_limit));
      setNight(String(current.pix_night_limit));
    }catch(e:unknown){setError(e instanceof Error?e.message:'Falha ao consultar seus limites.');}
    finally{setLoading(false);}
  },[accountId]);
  useEffect(()=>{void load();},[load]);

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!accountId || !snapshot || busy)return;
    setBusy(true);setError('');setSuccess('');
    try{
      const d=Number(daily),n=Number(night);
      if(!Number.isFinite(d)||!Number.isFinite(n)||d<=0||n<0||n>d||
        (d<=Number(snapshot.pix_daily_limit)&&n<=Number(snapshot.pix_night_limit))) {
        throw new Error('Solicite aumento de pelo menos um dos limites, sem reduzir os atuais.');
      }
      const result=await sendPixLimitRequest(accountId,d,n,reason.trim());
      setSuccess('Solicitação enviada à administração. A decisão aparecerá na Central de Mensagens e será encaminhada por e-mail quando o serviço estiver disponível.');
      setReason('');
      await load();
      void dispatchQueuedBankEmails(result.id);
    }catch(e:unknown){setError(e instanceof Error?e.message:'Não foi possível solicitar o aumento.');}
    finally{setBusy(false);}
  };

  const pending=requests.some(r=>r.status==='pending');
  return <div className="max-w-4xl space-y-6">
    <header className="space-y-2">
      <Link to="/pix" className="text-teal-600 text-xs underline">← Voltar ao Pix</Link>
      <h1 className="text-2xl font-extrabold flex items-center gap-2"><ShieldCheck className="text-teal-600"/> Meus limites Pix</h1>
      <p className="text-sm text-slate-500 dark:text-slate-300">Controle de gastos e prevenção de uso indevido. Os valores e as transferências são apenas simulações.</p>
    </header>
    {loading && <p className="flex items-center gap-2 text-sm"><RefreshCw size={15} className="animate-spin"/> Consultando seu banco de testes...</p>}
    {error && <p role="alert" className="p-3 rounded-xl bg-rose-100 text-rose-800 text-sm">{error}</p>}
    {success && <p role="status" className="p-3 rounded-xl bg-emerald-100 text-emerald-800 text-sm">{success}</p>}
    {snapshot && <section className="bg-white dark:bg-slate-800 rounded-2xl p-5 border dark:border-slate-700 space-y-4">
      <h2 className="font-bold">Limites da conta {activeAccount?.name}</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Pix diário</p>
          <p className="text-2xl font-black">{money(snapshot.pix_daily_limit)}</p>
          <p className="text-xs mt-2">Utilizado hoje: {money(snapshot.used_daily)}</p>
          <p className="text-xs text-teal-600 font-bold">Disponível hoje: {money(snapshot.remaining_daily)}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Pix noturno</p>
          <p className="text-2xl font-black">{money(snapshot.pix_night_limit)}</p>
          <p className="text-xs mt-2">Utilizado nesta data: {money(snapshot.used_night)}</p>
          <p className="text-xs text-teal-600 font-bold">Saldo noturno: {money(snapshot.remaining_night)}</p>
        </div>
      </div>
      <p className="text-xs flex items-center gap-2 text-slate-500"><Clock size={16}/> Noite: {String(snapshot.pix_night_start_hour).padStart(2,'0')}h às {String(snapshot.pix_night_end_hour).padStart(2,'0')}h • Fuso {snapshot.timezone}. O limite diário também se aplica durante a noite.</p>
      <p className="font-bold text-sm">Disponível para uma nova transferência agora: {money(snapshot.active_remaining)}</p>
      {snapshot.has_override && <p className="text-xs text-indigo-600">Esta conta possui condições individuais autorizadas pela administração.</p>}
    </section>}
    {snapshot && <form onSubmit={submit} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border dark:border-slate-700 space-y-4">
      <h2 className="font-bold flex gap-2 items-center"><ArrowUpRight size={17}/> Solicitar aumento de limite</h2>
      {pending ? <p className="text-sm text-amber-700 dark:text-amber-300">Já existe solicitação aguardando análise para esta conta. Aguarde a resposta antes de enviar outra.</p> : <>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm font-medium">Limite diário solicitado (R$)
            <input required type="number" step="0.01" min={snapshot.pix_daily_limit} max="10000000" value={daily} onChange={e=>setDaily(e.target.value)}
              className="w-full mt-1 rounded-lg border dark:bg-slate-900 dark:border-slate-700 p-3"/>
          </label>
          <label className="text-sm font-medium">Limite noturno solicitado (R$)
            <input required type="number" step="0.01" min={snapshot.pix_night_limit} max="10000000" value={night} onChange={e=>setNight(e.target.value)}
              className="w-full mt-1 rounded-lg border dark:bg-slate-900 dark:border-slate-700 p-3"/>
          </label>
        </div>
        <label className="text-sm font-medium">Por que deseja aumentar o limite?
          <textarea minLength={10} maxLength={700} required rows={3} value={reason} onChange={e=>setReason(e.target.value)}
            placeholder="Ex.: Pretendo testar pagamentos maiores e acompanhar os gastos da minha conta."
            className="w-full mt-1 rounded-lg border dark:bg-slate-900 dark:border-slate-700 p-3"/>
        </label>
        <button disabled={busy} type="submit" className="flex items-center gap-2 justify-center bg-teal-600 text-white rounded-xl font-bold px-5 py-3 disabled:opacity-50"><Send size={16}/>{busy?'Registrando...':'Enviar para análise'}</button>
      </>}
      <p className="text-xs text-slate-500 flex gap-2"><Info size={17} className="shrink-0"/>O pedido não aumenta os limites automaticamente. A administração poderá aprovar ou recusar, registrando a justificativa em auditoria. Não usamos SMS ou WhatsApp.</p>
    </form>}
    <section className="bg-white dark:bg-slate-800 rounded-2xl p-5 border dark:border-slate-700 space-y-3">
      <div className="flex items-center justify-between"><h2 className="font-bold">Histórico de solicitações</h2><button type="button" onClick={()=>void load()} className="text-xs text-teal-600 underline">Atualizar</button></div>
      {!requests.length && <p className="text-sm text-slate-500">Você ainda não solicitou mudança de limites.</p>}
      {requests.map(r=><article key={r.id} className="border dark:border-slate-700 rounded-xl p-3 text-sm space-y-1">
        <p className="font-bold">{r.status==='pending'?'Em análise':r.status==='approved'?'Aprovado':'Não aprovado'} • {new Date(r.created_at).toLocaleString('pt-BR')}</p>
        <p>Diário: {money(r.requested_daily_limit)} • Noturno: {money(r.requested_night_limit)}</p>
        {r.review_note && <p className="text-xs text-slate-500">Justificativa da decisão: {r.review_note}</p>}
      </article>)}
      <Link to="/mensagens" className="text-xs text-teal-600 underline">Abrir Central de Mensagens</Link>
    </section>
  </div>;
};
