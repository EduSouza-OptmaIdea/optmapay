import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Printer, RefreshCw, ShieldCheck, X } from 'lucide-react';
import {
  SandboxDepositQuote,
  SandboxDepositReceipt,
  previewSandboxDeposit,
  confirmSandboxDeposit,
  newDepositIdempotencyKey,
  fetchEffectiveBankPolicy,
  EffectiveBankPolicy,
} from '../services/sandboxDepositService';

const makeReceiptLabel = (receipt: SandboxDepositReceipt): string => receipt.receipt_label || 'Comprovante fictício OptmaPay '+receipt.operation_id.slice(0,13);
const money = (amount: number) => Number(amount).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
const escapeHtml = (text: unknown): string => String(text ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
}[c] || c));

function receiptHtml(receipt: SandboxDepositReceipt, accountName: string): string {
  const rows = [
    ['Conta',accountName],
    ['Data/hora',new Date(receipt.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' (Brasília)'],
    ['Operação nº',String(receipt.deposit_number)],
    ['Valor informado',money(receipt.amount)],
    ['Tarifa fictícia',money(receipt.fee_amount)],
    ['Valor creditado',money(receipt.net_amount)],
    ['Saldo fictício após operação',money(receipt.new_balance)],
    ['Referência',receipt.operation_id],
    ['Lançamento',receipt.transaction_id],
    ...(receipt.fee_transaction_id ? [['Lançamento da tarifa',receipt.fee_transaction_id]] : []),
  ];
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(makeReceiptLabel(receipt))}</title>
    <style>body{font-family:Arial,sans-serif;color:#182d34;background:#f7f9fa;margin:0;padding:36px}
    main{background:white;max-width:550px;margin:0 auto;padding:36px;border:1px solid #ddd;border-radius:16px}
    h1{font-size:25px}h2{font-size:16px;color:#047857}.flag{padding:12px;background:#effcf6;color:#065f46;font-weight:bold;border-radius:8px}
    dl div{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #eee;padding:12px 0}
    dt{font-size:13px;color:#64748b}dd{margin:0;text-align:right;font-weight:bold;overflow-wrap:anywhere;font-size:13px}
    small{display:block;color:#64748b;line-height:1.6;margin-top:20px}
    .print{display:block;margin:18px auto;background:#0f766e;color:white;padding:12px;border:0;border-radius:8px;cursor:pointer}
    @media print{body{padding:0;background:white}.print{display:none}main{border:0;max-width:100%}}</style></head>
    <body><main><h1>${escapeHtml(makeReceiptLabel(receipt))}</h1><h2>Comprovante de depósito simulado</h2>
    <p class="flag">SIMULAÇÃO EDUCACIONAL — NENHUM DINHEIRO REAL</p>
    <dl>${rows.map(([key,val])=>`<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(val)}</dd></div>`).join('')}</dl>
    <small>Ambiente Sandbox • Operação fictícia sem valor de pagamento ou transferência real.
    Identificador de idempotência: ${escapeHtml(receipt.idempotency_key)}.</small></main>
    <button class="print" onclick="window.print()">Imprimir comprovante</button></body></html>`;
}

function printReceipt(receipt: SandboxDepositReceipt, accountName: string): void {
  const popup = window.open('', '_blank', 'width=680,height=820');
  if(!popup) throw new Error('Seu navegador bloqueou a janela de impressão. Use Baixar comprovante.');
  popup.document.open();
  popup.document.write(receiptHtml(receipt, accountName));
  popup.document.close();
  popup.focus();
}

function downloadReceipt(receipt: SandboxDepositReceipt, accountName: string): void {
  const blob = new Blob([receiptHtml(receipt,accountName)],{type:'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href=url;
  anchor.download=`optmapay-comprovante-${receipt.operation_id}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

interface Props {
  accountId: string;
  accountName: string;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export const SandboxDepositDialog: React.FC<Props> = ({accountId,accountName,onClose,onSuccess}) => {
  const [amount,setAmount] = useState('500');
  const [policy,setPolicy] = useState<EffectiveBankPolicy | null>(null);
  const [description,setDescription] = useState('Depósito fictício OptmaPay');
  const [quote,setQuote] = useState<SandboxDepositQuote|null>(null);
  const [quoteLoading,setQuoteLoading] = useState(false);
  const [submitting,setSubmitting] = useState(false);
  const [error,setError] = useState('');
  const [receipt,setReceipt] = useState<SandboxDepositReceipt|null>(null);
  const idempotency = useRef<{key:string;signature:string;fee:number}|null>(null);

  const numericAmount = Number(amount);
  const validAmount = amount.trim()!=='' && Number.isFinite(numericAmount) && numericAmount>0 && numericAmount===Number(numericAmount.toFixed(2)) && Math.round(numericAmount*100)%5===0;

  useEffect(()=>{
    let active=true;
    fetchEffectiveBankPolicy(accountId).then(p=>{if(active)setPolicy(p);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Erro ao consultar política de depósitos.');});
    return ()=>{active=false;};
  },[accountId]);

  useEffect(()=>{
    if(receipt) return;
    setQuote(null);
    setError('');
    if(!validAmount || !policy || numericAmount < Number(policy.deposit_min) || numericAmount > Number(policy.deposit_max)) return;
    let cancelled=false;
    const handle = setTimeout(async()=>{
      setQuoteLoading(true);
      try{
        const value=await previewSandboxDeposit(accountId,numericAmount);
        if(!cancelled) setQuote(value);
      }catch(e:unknown){
        if(!cancelled) setError(e instanceof Error?e.message:'Não foi possível cotar este depósito.');
      }finally{if(!cancelled)setQuoteLoading(false);}
    },240);
    return ()=>{cancelled=true;clearTimeout(handle);};
  },[accountId,amount,receipt,policy]);

  const confirm = async (event:React.FormEvent) => {
    event.preventDefault();
    if(!quote || !validAmount || submitting || receipt || quote.amount!==numericAmount) return;
    const signature=`${accountId}:${numericAmount}:${description.trim()||'Depósito fictício OptmaPay'}`;
    setSubmitting(true);setError('');
    try{
      if(!idempotency.current || idempotency.current.signature!==signature)
        idempotency.current={key:newDepositIdempotencyKey(),signature,fee:quote.fee_amount};
      const token=idempotency.current;
      const result=await confirmSandboxDeposit(accountId,numericAmount,description,token.key,token.fee);
      setReceipt(result);
      try{await onSuccess();}catch{ /* Receipt is authoritative even if refresh fails. */ }
    }catch(e:unknown){
      setError(e instanceof Error?e.message:'Não foi possível confirmar o depósito.');
      try{setQuote(await previewSandboxDeposit(accountId,numericAmount));}catch{ /* Keep original quote for safe retry. */ }
    }finally{setSubmitting(false);}
  };

  return <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3">
    <section role="dialog" aria-modal="true" aria-label="Depósito fictício" className="w-full max-w-lg max-h-[95vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-2xl p-5 sm:p-6 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div><h2 className="text-xl font-extrabold">Depósito fictício</h2>
          <p className="text-xs text-slate-500 dark:text-slate-300 mt-1">Conta: {accountName}</p></div>
        <button type="button" onClick={onClose} disabled={submitting} aria-label="Fechar" className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40"><X size={19}/></button>
      </header>
      <p className="rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-900 dark:text-teal-100 p-3 text-xs flex items-start gap-2"><ShieldCheck size={18} className="shrink-0"/>Simulação para testes e educação financeira. Nenhum dinheiro real será depositado ou transferido.</p>
      {error && <p role="alert" className="rounded-xl p-3 bg-rose-100 text-rose-800 text-sm flex items-start gap-2"><AlertCircle size={18} className="shrink-0"/>{error}</p>}
      {receipt ? <div className="space-y-4">
        <p role="status" className="rounded-xl bg-emerald-100 text-emerald-800 p-3 font-bold flex items-center gap-2"><CheckCircle2 size={21}/>Depósito registrado com sucesso!</p>
        <p className="font-semibold text-sm break-all">{makeReceiptLabel(receipt)}</p>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt>Depósito</dt><dd className="font-bold">{money(receipt.amount)}</dd></div>
          <div className="flex justify-between"><dt>Tarifa</dt><dd className="font-bold">{money(receipt.fee_amount)}</dd></div>
          <div className="flex justify-between border-t dark:border-slate-600 pt-2"><dt>Crédito líquido</dt><dd className="font-extrabold text-emerald-600">{money(receipt.net_amount)}</dd></div>
          <div className="flex justify-between"><dt>Saldo após operação</dt><dd className="font-bold">{money(receipt.new_balance)}</dd></div>
        </dl>
        <p className="text-xs text-slate-500 break-all">Referência: {receipt.operation_id}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={()=>{try{printReceipt(receipt,accountName);}catch(e:unknown){setError(e instanceof Error?e.message:'Falha na impressão.');}}} className="flex-1 px-3 py-3 border rounded-xl flex items-center justify-center gap-2 text-sm font-bold"><Printer size={17}/>Imprimir</button>
          <button type="button" onClick={()=>downloadReceipt(receipt,accountName)} className="flex-1 px-3 py-3 bg-teal-600 text-white rounded-xl flex items-center justify-center gap-2 text-sm font-bold"><Download size={17}/>Baixar HTML</button>
        </div>
        <button type="button" onClick={onClose} className="w-full p-3 text-sm font-bold">Concluir</button>
      </div> : <form onSubmit={confirm} className="space-y-4">
        <label className="block text-xs font-bold">Valor do depósito (R$)
          <input required type="number" step="0.05" min={policy?.deposit_min ?? 1} max={policy?.deposit_max ?? 500} value={amount}
            onChange={e=>{setAmount(e.target.value);idempotency.current=null;}}
            className="block mt-1 w-full p-3 rounded-xl border dark:border-slate-600 dark:bg-slate-900 font-mono text-base"/>
        </label>
        <p className="text-xs text-slate-500">Valores em múltiplos de R$ 0,05. Limites desta conta: {policy ? `${money(policy.deposit_min)} a ${money(policy.deposit_max)}` : "Consultando limites PF/PJ..."}</p>
        {!validAmount && <p role="alert" className="text-xs text-rose-600">Informe valor positivo, com centavos em múltiplos de R$ 0,05.</p>}
        <label className="block text-xs font-bold">Descrição
          <input type="text" maxLength={160} value={description}
            onChange={e=>{setDescription(e.target.value);idempotency.current=null;}}
            className="block mt-1 w-full p-3 rounded-xl border dark:border-slate-600 dark:bg-slate-900 text-sm"/>
        </label>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-4 space-y-2 text-sm" aria-live="polite">
          {quoteLoading && <p className="flex gap-2 items-center"><RefreshCw className="animate-spin" size={15}/>Calculando tarifa atual...</p>}
          {quote && !quoteLoading && quote.amount===numericAmount && <>
            <div className="flex justify-between"><span>Depósito simulado</span><strong>{money(quote.amount)}</strong></div>
            <div className="flex justify-between"><span>Tarifa ({quote.next_deposit_number}º depósito do mês)</span><strong>{money(quote.fee_amount)}</strong></div>
            <div className="flex justify-between border-t dark:border-slate-700 pt-2"><span>Crédito líquido</span><strong className="text-teal-600">{money(quote.net_amount)}</strong></div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{quote.free_monthly} depósitos gratuitos/mês • {quote.free_remaining} restantes neste mês • Período {quote.period}</p>
          </>}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-300">A confirmação salva o depósito, eventual tarifa e o novo saldo em uma única operação. Repetir a mesma solicitação não duplica o crédito.</p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className="flex-1 rounded-xl p-3 text-sm font-bold bg-slate-100 dark:bg-slate-700">Cancelar</button>
          <button type="submit" disabled={submitting || quoteLoading || !quote || !policy || quote.amount!==numericAmount || !validAmount} className="flex-1 rounded-xl p-3 text-sm font-bold bg-teal-600 text-white disabled:opacity-40">{submitting?'Confirmando...':'Confirmar depósito'}</button>
        </div>
      </form>}
    </section>
  </div>;
};
