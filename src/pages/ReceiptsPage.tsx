import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, Copy,
  FileCheck2, FileText, Filter, Printer, RefreshCw, Search, ShieldCheck, X,
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import {
  fetchBankReceipt, fetchBankReceipts, ReceiptDetail, ReceiptFilter,
  ReceiptKind, ReceiptSummary,
} from '../services/receiptService';

const money = (amount: number): string =>
  Number(amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const when = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

const FILTERS: { value: ReceiptFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pix_sent', label: 'Pix enviados' },
  { value: 'pix_received', label: 'Pix recebidos' },
  { value: 'deposit', label: 'Depósitos' },
  { value: 'pix_refund', label: 'Devoluções Pix' },
];

const KIND_LABELS: Record<ReceiptKind, string> = {
  deposit: 'Depósito fictício',
  pix_sent: 'Pix enviado',
  pix_received: 'Pix recebido',
  pix_refund: 'Devolução Pix',
};

function ReceiptField({ label, value, mono = false }: {
  label: string; value: React.ReactNode; mono?: boolean;
}) {
  return <div className="border-b border-slate-200 py-3 last:border-0">
    <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className={'mt-1 break-words text-sm font-semibold text-slate-900 ' +
      (mono ? 'font-mono text-xs break-all' : '')}>{value}</dd>
  </div>;
}

function toClipboardText(receipt: ReceiptDetail): string {
  const lines = [
    receipt.receipt_label, 'OPTMAPAY SANDBOX — DOCUMENTO FICTÍCIO',
    `Tipo: ${KIND_LABELS[receipt.kind]}`,
    `Valor: ${money(receipt.amount)}`,
    `Data: ${when(receipt.created_at)} (Brasília)`,
    `Identificador: ${receipt.receipt_id}`,
  ];
  if (receipt.kind === 'deposit') {
    lines.push(
      `Conta: ${receipt.account_name}`,
      `Tarifa fictícia: ${money(receipt.fee_amount)}`,
      `Crédito líquido: ${money(receipt.net_amount)}`,
      `Saldo após o depósito: ${money(receipt.new_balance)}`,
      `Lançamento: ${receipt.transaction_id}`,
    );
  } else {
    lines.push(
      `Origem: ${receipt.sender_name}`,
      `Destino: ${receipt.receiver_name}`,
      `Referência: ${receipt.reference}`,
    );
    if (receipt.related_transaction_id) {
      lines.push(`Transação relacionada: ${receipt.related_transaction_id}`);
    }
    lines.push('Identificadores de Pix consultados no cadastro atual, não no registro histórico.');
  }
  return lines.concat('Comprovante fictício — não movimenta dinheiro real.').join('\n');
}

function ReceiptViewer({ receipt, onClose }: {
  receipt: ReceiptDetail; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toClipboardText(receipt));
      setCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Não foi possível copiar. Verifique as permissões do navegador.');
    }
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-3 backdrop-blur-sm sm:p-6" role="presentation">
    <style>{`
      /* Apenas o comprovante deve aparecer no PDF e na impressão. */
      @media print {
        html, body { background: white !important; }
        body * { visibility: hidden !important; }
        #optmapay-history-print, #optmapay-history-print * {
          visibility: visible !important;
        }
        #optmapay-history-print {
          position: absolute !important;
          left: 0 !important; top: 0 !important; width: 100% !important;
          max-width: none !important; max-height: none !important;
          overflow: visible !important; border: 0 !important;
          border-radius: 0 !important; box-shadow: none !important;
          background: white !important; color: #101828 !important;
        }
        #optmapay-history-actions, #optmapay-history-close {
          display: none !important;
        }
        @page { margin: 12mm; }
      }
    `}</style>
    <div id="optmapay-history-print" role="dialog" aria-modal="true" aria-labelledby="receipt-history-heading"
      className="relative w-full max-w-lg overflow-y-auto rounded-[28px] bg-[#fffdf7] text-slate-900 shadow-2xl max-h-[92vh]">
      <button id="optmapay-history-close" type="button" aria-label="Fechar comprovante"
        onClick={onClose} className="absolute right-4 top-4 rounded-xl p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">
        <X size={20}/>
      </button>
      <div className="px-5 pb-5 pt-7 sm:px-7">
        <div className="flex items-center gap-3 pr-8">
          <Logo variant="light" heightClass="h-7 sm:h-9"/>
          <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white">SANDBOX</span>
        </div>
        <p className="mt-7 text-xs font-semibold text-slate-500">{KIND_LABELS[receipt.kind]}</p>
        <h2 id="receipt-history-heading" className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
          {money(receipt.amount)}
        </h2>
        <p className="mt-2 text-xs text-slate-500">{when(receipt.created_at)} (Brasília)</p>
        <p className="mt-3 break-all text-xs font-semibold text-slate-600">{receipt.receipt_label}</p>
      </div>
      <div className="border-t border-slate-200 px-5 py-4 sm:px-7">
        <dl>
          {receipt.kind === 'deposit' ? <>
            <ReceiptField label="Conta beneficiária" value={receipt.account_name}/>
            <ReceiptField label="Valor informado" value={money(receipt.amount)}/>
            <ReceiptField label="Tarifa fictícia" value={money(receipt.fee_amount)}/>
            <ReceiptField label="Crédito líquido" value={money(receipt.net_amount)}/>
            <ReceiptField label="Saldo após a operação" value={money(receipt.new_balance)}/>
            <ReceiptField label="Operação nº" value={receipt.deposit_number}/>
            <ReceiptField label="ID do lançamento" value={receipt.transaction_id} mono/>
            {receipt.fee_transaction_id &&
              <ReceiptField label="Lançamento da tarifa" value={receipt.fee_transaction_id} mono/>}
            <ReceiptField label="ID da operação" value={receipt.operation_id} mono/>
          </> : <>
            <ReceiptField label="Origem" value={receipt.sender_name}/>
            <ReceiptField label="Chave Pix da origem (cadastro atual)" value={receipt.sender_pix_key || 'Não disponível'} mono/>
            <ReceiptField label="Destino" value={receipt.receiver_name}/>
            <ReceiptField label="Chave Pix do destino (cadastro atual)" value={receipt.receiver_pix_key || 'Não disponível'} mono/>
            <ReceiptField label="ID da transação" value={receipt.transaction_id} mono/>
            <ReceiptField label="Referência" value={receipt.reference} mono/>
            {receipt.related_transaction_id &&
              <ReceiptField label="Transação relacionada" value={receipt.related_transaction_id} mono/>}
            {Number(receipt.refunded_amount)>0 &&
              <ReceiptField label="Valor já devolvido" value={money(receipt.refunded_amount)}/>}
            {receipt.status === 'refunded' &&
              <ReceiptField label="Situação" value="Movimentação com devolução registrada"/>}
          </>}
        </dl>
        <p className="mt-5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-amber-900">
          Documento fictício OptmaPay Sandbox · sem movimentação de dinheiro real
        </p>
        {receipt.kind !== 'deposit' && <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Este comprovante foi recuperado do lançamento histórico. As chaves Pix exibidas
          refletem o cadastro atual e podem ser diferentes das utilizadas no momento da transação.
        </p>}
      </div>
      <div id="optmapay-history-actions" className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-white/65 px-5 py-4 sm:px-7">
        <button type="button" onClick={() => void copy()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-bold hover:bg-white">
          {copied ? <Check size={17}/> : <Copy size={17}/>} {copied ? 'Copiado!' : 'Copiar'}
        </button>
        <button type="button" onClick={() => window.print()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white hover:bg-slate-800">
          <Printer size={17}/> Imprimir / PDF
        </button>
        {copyError && <p role="alert" className="col-span-2 text-xs text-rose-600">{copyError}</p>}
      </div>
    </div>
  </div>;
}

export const ReceiptsPage: React.FC = () => {
  const { activeAccount } = useAuth();
  const accountId = activeAccount?.id || '';
  const [kind, setKind] = useState<ReceiptFilter>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [rows, setRows] = useState<ReceiptSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReceiptDetail | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const listVersion = useRef(0);
  const detailVersion = useRef(0);

  useEffect(() => {
    const version = ++listVersion.current;
    ++detailVersion.current;
    setDetail(null);
    setRows([]);
    setTotal(0);
    setError('');
    if (!accountId) return;
    setLoading(true);
    void fetchBankReceipts({
      accountId, kind, search: appliedSearch, from: fromDate, to: toDate, limit: 20, offset: 0,
    }).then(result => {
      if (listVersion.current !== version) return;
      setRows(result.items);
      setTotal(result.total);
    }).catch((reason: unknown) => {
      if (listVersion.current !== version) return;
      setError(reason instanceof Error ? reason.message : 'Não foi possível consultar os comprovantes.');
    }).finally(() => {
      if (listVersion.current === version) setLoading(false);
    });
  }, [accountId, kind, appliedSearch, fromDate, toDate, revision]);

  const loadMore = async () => {
    if (!accountId || loadingMore || loading || rows.length >= total) return;
    const version = listVersion.current;
    setLoadingMore(true);
    try {
      const result = await fetchBankReceipts({
        accountId, kind, search: appliedSearch,
        from: fromDate, to: toDate, limit: 20, offset: rows.length,
      });
      if (listVersion.current !== version) return;
      setRows(prev => {
        const known = new Set(prev.map(item => item.receipt_id));
        return [...prev, ...result.items.filter(item => !known.has(item.receipt_id))];
      });
      setTotal(result.total);
    } catch (reason: unknown) {
      if (listVersion.current === version) {
        setError(reason instanceof Error ? reason.message : 'Não foi possível carregar mais comprovantes.');
      }
    } finally {
      if (listVersion.current === version) setLoadingMore(false);
    }
  };

  const openReceipt = async (row: ReceiptSummary) => {
    if (!accountId) return;
    const version = ++detailVersion.current;
    setDetailLoadingId(row.receipt_id);
    setError('');
    try {
      const found = await fetchBankReceipt(accountId, row.kind, row.receipt_id);
      if (detailVersion.current === version) setDetail(found);
    } catch (reason: unknown) {
      if (detailVersion.current === version) {
        setError(reason instanceof Error ? reason.message : 'Não foi possível recuperar o comprovante.');
      }
    } finally {
      if (detailVersion.current === version) setDetailLoadingId(null);
    }
  };

  const clearFilters = () => {
    setKind('all'); setSearch(''); setAppliedSearch('');
    setFromDate(''); setToDate('');
    setRevision(n => n + 1);
  };

  return <main className="mx-auto max-w-5xl space-y-5 pb-8">
    <header className="space-y-2">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">
        <ShieldCheck size={16}/> OptmaPay Sandbox
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold sm:text-3xl">
            <FileCheck2 className="text-teal-600"/> Meus comprovantes
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
            Recupere comprovantes fictícios de Pix e depósitos sempre que precisar.
          </p>
        </div>
        <button type="button" onClick={() => setRevision(n => n + 1)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold dark:border-slate-700">
          <RefreshCw size={17}/> Atualizar
        </button>
      </div>
    </header>

    {activeAccount ? <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm dark:border-teal-900 dark:bg-teal-950">
      <p className="font-bold">{activeAccount.name}</p>
      <p className="text-xs text-slate-600 dark:text-slate-300">
        Agência {activeAccount.agency} · Conta {activeAccount.account_number}
      </p>
    </div> : <section className="rounded-xl border p-5 text-sm dark:border-slate-700">
      Selecione uma conta para consultar seus comprovantes. <Link to="/dashboard" className="font-bold text-teal-600 underline">Ir para a conta</Link>
    </section>}

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><Filter size={17}/> Localizar comprovantes</h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo de comprovante">
        {FILTERS.map(filter => <button key={filter.value} type="button"
          disabled={!accountId}
          aria-pressed={kind === filter.value}
          onClick={() => setKind(filter.value)}
          className={'min-h-10 rounded-xl px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ' +
            (kind === filter.value
              ? 'bg-teal-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-200')}>
          {filter.label}
        </button>)}
      </div>
      <form className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end" onSubmit={event => {event.preventDefault();setAppliedSearch(search.trim());}}>
        <label className="min-w-0 flex-1 text-xs font-bold text-slate-600 dark:text-slate-300">
          Descrição, referência ou identificador
          <div className="mt-1 flex gap-2">
            <input type="search" value={search} maxLength={120} disabled={!accountId}
              onChange={event => setSearch(event.target.value)}
              placeholder="Pesquisar comprovante"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm dark:border-slate-600"/>
            <button type="submit" aria-label="Pesquisar comprovantes" disabled={!accountId}
              className="rounded-xl bg-slate-900 px-3 text-white disabled:opacity-50"><Search size={18}/></button>
          </div>
        </label>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">De
            <input type="date" value={fromDate} disabled={!accountId} max={toDate || undefined}
              onChange={event => setFromDate(event.target.value)}
              className="mt-1 block min-w-0 w-full rounded-xl border border-slate-300 bg-transparent px-2 py-2.5 text-sm dark:border-slate-600"/>
          </label>
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Até
            <input type="date" value={toDate} disabled={!accountId} min={fromDate || undefined}
              onChange={event => setToDate(event.target.value)}
              className="mt-1 block min-w-0 w-full rounded-xl border border-slate-300 bg-transparent px-2 py-2.5 text-sm dark:border-slate-600"/>
          </label>
        </div>
      </form>
      {(kind !== 'all' || appliedSearch || fromDate || toDate) && <button type="button"
        onClick={clearFilters} className="mt-3 text-xs font-bold text-teal-700 underline dark:text-teal-300">
        Limpar filtros
      </button>}
    </section>

    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}

    <section className="space-y-3" aria-label="Histórico de comprovantes">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">Histórico</h2>
        <span className="text-xs text-slate-500">{loading ? 'Consultando...' : `${rows.length} de ${total} comprovante(s)`}</span>
      </div>
      {loading && <div role="status" className="flex items-center gap-2 rounded-2xl border bg-white p-5 text-sm dark:border-slate-700 dark:bg-slate-800">
        <RefreshCw size={18} className="animate-spin"/> Recuperando documentos com segurança...
      </div>}
      {!loading && !!accountId && rows.length === 0 && !error &&
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-800">
          <FileText size={30} className="mx-auto text-slate-400"/>
          <h3 className="mt-3 font-bold">Nenhum comprovante encontrado</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-500 dark:text-slate-300">
            Os documentos disponíveis são gerados a partir de movimentações Pix confirmadas
            e depósitos com registro original. Operações antigas sem comprovante emitido
            permanecem consultáveis no extrato.
          </p>
        </div>}
      {!loading && rows.map(row => <article key={row.receipt_id}
        className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className={'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ' +
            (row.direction === 'out'
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300')}>
            {row.direction === 'out' ? <ArrowUpRight size={21}/> : <ArrowDownLeft size={21}/>}
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-extrabold">{KIND_LABELS[row.kind]}</h3>
            <p className="text-xs text-slate-500">{when(row.created_at)}</p>
            <p className="break-words text-xs text-slate-600 dark:text-slate-300">
              {row.counterparty_name || row.description || 'Operação sandbox'}
            </p>
            <p className="max-w-full truncate font-mono text-[10px] text-slate-400" title={row.reference}>
              {row.reference}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-700 sm:border-0 sm:pt-0">
          <p className={'text-lg font-extrabold tabular-nums ' +
            (row.direction === 'out' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
            {row.direction === 'out' ? '− ' : '+ '}{money(row.amount)}
          </p>
          <button type="button" onClick={() => void openReceipt(row)}
            disabled={!!detailLoadingId}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
            {detailLoadingId === row.receipt_id ? <RefreshCw size={15} className="animate-spin"/> : <FileText size={15}/>}
            {detailLoadingId === row.receipt_id ? 'Abrindo...' : 'Ver comprovante'}
            <ChevronDown size={14} className="-rotate-90"/>
          </button>
        </div>
      </article>)}

      {!loading && rows.length < total && <button type="button" onClick={() => void loadMore()}
        disabled={loadingMore} className="mx-auto flex min-h-11 items-center gap-2 rounded-xl border border-teal-400 px-5 text-sm font-bold text-teal-700 disabled:opacity-50 dark:text-teal-300">
        {loadingMore ? <RefreshCw size={16} className="animate-spin"/> : <CalendarDays size={16}/>}
        {loadingMore ? 'Carregando...' : 'Carregar comprovantes anteriores'}
      </button>}
    </section>
    <p className="flex gap-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
      <ShieldCheck size={18} className="shrink-0"/>
      Todos os documentos desta área representam operações fictícias. Não têm valor de
      comprovante bancário real, não envolvem dinheiro verdadeiro e são acessíveis
      somente pelo titular da conta sandbox.
    </p>
    {detail && <ReceiptViewer receipt={detail} onClose={() => setDetail(null)}/>}
  </main>;
};
