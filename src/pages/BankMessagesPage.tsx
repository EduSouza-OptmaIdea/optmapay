import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCircle2, RefreshCw } from 'lucide-react';
import { getMyBankMessages, markBankMessageRead, BankMessage } from '../services/bankPolicyService';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export const BankMessagesPage: React.FC = () => {
  const {user}=useAuth();
  const [items,setItems]=useState<BankMessage[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    setBusy(true);setError('');
    try{setItems(await getMyBankMessages());}
    catch(e:unknown){setError(e instanceof Error?e.message:'Não foi possível consultar as mensagens.');}
    finally{setBusy(false);}
  },[]);
  useEffect(()=>{
    void load();
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},25000);
    const channel=user?.id ? supabase.channel('bank-inbox-'+user.id)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'platform_messages',filter:'user_id=eq.'+user.id},()=>{void load();}).subscribe():null;
    return ()=>{clearInterval(timer);if(channel)void supabase.removeChannel(channel);};
  },[load,user?.id]);
  const open=async(item:BankMessage)=>{
    if(item.read_at)return;
    try{
      await markBankMessageRead(item.id);
      setItems(list=>list.map(x=>x.id===item.id?{...x,read_at:new Date().toISOString()}:x));
    }catch(e:unknown){setError(e instanceof Error?e.message:'Não foi possível marcar mensagem como lida.');}
  };
  const unread=items.filter(x=>!x.read_at).length;
  return <main className="max-w-4xl space-y-5">
    <header className="flex justify-between items-center gap-3">
      <div><h1 className="font-extrabold text-2xl flex gap-2 items-center"><Bell className="text-teal-600"/> Central de Mensagens</h1>
        <p className="text-sm text-slate-500 mt-2">Avisos sobre a conta, solicitações de limites e educação financeira. Sem SMS ou WhatsApp.</p></div>
      <button aria-label="Atualizar mensagens" type="button" onClick={()=>void load()} className="rounded-lg border dark:border-slate-600 p-2"><RefreshCw size={17} className={busy?'animate-spin':''}/></button>
    </header>
    {error && <p role="alert" className="p-3 bg-rose-100 text-rose-800 rounded-lg text-sm">{error}</p>}
    <p className="text-xs text-slate-500">{unread} mensagem(ns) não lida(s) • Atualização automática enquanto esta página estiver visível</p>
    {!items.length && !busy && <p className="text-sm border rounded-xl p-5">Nenhuma mensagem no momento.</p>}
    <div className="space-y-3">
      {items.map(item=><article key={item.id} className={'border rounded-2xl p-4 bg-white dark:bg-slate-800 dark:border-slate-700 space-y-3 '+(!item.read_at?'border-teal-500 shadow-sm':'')}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h2 className="font-bold flex gap-2 items-center">{item.title}{!item.read_at && <span className="w-2 h-2 rounded-full bg-teal-500"/>}</h2>
            <p className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString('pt-BR')} • {item.category==='policy'?'Limites e políticas':item.category}</p></div>
          {item.read_at?<span className="text-xs text-slate-500 flex items-center gap-1"><CheckCircle2 size={15}/> Lida</span>:
            <button onClick={()=>void open(item)} className="text-xs font-bold text-teal-600 underline">Marcar como lida</button>}
        </div>
        <p className="text-sm whitespace-pre-line leading-relaxed">{item.body}</p>
      </article>)}
    </div>
  </main>;
};
