import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import { MobileQrScannerModal } from '../components/MobileQrScannerModal';
import { supabase } from '../lib/supabase';
import { SandboxTransaction } from '../types/sandbox';
import {
  parsePixPayload,
  executePixTransfer,
  generateOptmaPayPixPayload,
  PixTransferResult,
  ParsedPixData,
} from '../lib/pixService';
import {
  QrCode,
  Copy,
  Check,
  Send,
  Sparkles,
  Building2,
  User,
  Camera,
  CheckCircle2,
  AlertCircle,
  Link2,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Clock,
  Printer,
  FileCheck2,
  X,
  RotateCcw,
  ListOrdered,
  Lock,
} from 'lucide-react';

interface StoredPixCharge {
  id: string;
  txRef: string;
  amount: number;
  description: string;
  payload: string;
  createdAt: number;
  expiresAt: number;
  paid: boolean;
  payerName?: string;
  paidAt?: string;
}

export const PixArea: React.FC = () => {
  const { activeAccount, refreshAccounts } = useAuth();
  const [activeTab, setActiveTab] = useState<'pay' | 'receive' | 'generate' | 'charges'>('pay');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedInstruction, setCopiedInstruction] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Transfer Pay Pix State - Starts with 0.00
  const [rawPixInput, setRawPixInput] = useState('');
  const [parsedData, setParsedData] = useState<ParsedPixData | null>(null);
  const [payAmount, setPayAmount] = useState('0.00');
  const [payDesc, setPayDesc] = useState('');
  const [paying, setPaying] = useState(false);
  const [transferReceipt, setTransferReceipt] = useState<PixTransferResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedReceiptText, setCopiedReceiptText] = useState(false);

  // Dynamic QR Code State
  const [pixAmount, setPixAmount] = useState('10.00');
  const [pixDesc, setPixDesc] = useState('');
  const [generatedPayload, setGeneratedPayload] = useState<string | null>(null);
  const [generatedTxRef, setGeneratedTxRef] = useState<string | null>(null);
  const [generatedExpiresAt, setGeneratedExpiresAt] = useState<number | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(600);
  const [copiedDynamicPayload, setCopiedDynamicPayload] = useState(false);

  // Histórico de Cobranças Geradas
  const [storedCharges, setStoredCharges] = useState<StoredPixCharge[]>([]);

  // Status de liquidação em tempo real do QR Code gerado
  const [dynamicChargePaid, setDynamicChargePaid] = useState<{
    paid: boolean;
    payerName?: string;
    amount?: number;
    paidAt?: string;
  } | null>(null);

  // Modal Devolução Pix
  const [selectedTxForRefund, setSelectedTxForRefund] = useState<SandboxTransaction | null>(null);
  const [refundMode, setRefundMode] = useState<'total' | 'partial'>('total');
  const [partialAmount, setPartialAmount] = useState('');
  const [refundReason, setRefundReason] = useState('Cancelamento de compra');
  const [processingRefund, setProcessingRefund] = useState(false);
  const [refundSuccessMessage, setRefundSuccessMessage] = useState<string | null>(null);
  const [refundErrorMessage, setRefundErrorMessage] = useState<string | null>(null);

  // Dedicated Pix Statement State
  const [pixTransactions, setPixTransactions] = useState<SandboxTransaction[]>([]);
  const [loadingPixTx, setLoadingPixTx] = useState(false);

  const activeAccountRef = useRef(activeAccount);
  activeAccountRef.current = activeAccount;

  // Carrega cobranças salvas do localStorage
  useEffect(() => {
    if (!activeAccount?.id) return;
    const key = `optmapay_pix_charges_${activeAccount.id}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        setStoredCharges(JSON.parse(raw));
      } catch {
        setStoredCharges([]);
      }
    } else {
      setStoredCharges([]);
    }
  }, [activeAccount?.id]);

  const saveCharges = (newCharges: StoredPixCharge[]) => {
    setStoredCharges(newCharges);
    if (activeAccount?.id) {
      localStorage.setItem(`optmapay_pix_charges_${activeAccount.id}`, JSON.stringify(newCharges));
    }
  };

  // Timer de Contagem Regressiva de 10 Minutos (600 segundos)
  useEffect(() => {
    if (!generatedExpiresAt || dynamicChargePaid?.paid) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((generatedExpiresAt - Date.now()) / 1000));
      setCountdownSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [generatedExpiresAt, dynamicChargePaid?.paid]);

  // BAIXA AUTOMÁTICA ULTRA-RÁPIDA (POLLING ATIVO A CADA 800MS ENQUANTO QR CODE ABERTO)
  useEffect(() => {
    if (!generatedTxRef || !activeAccount?.id || dynamicChargePaid?.paid) return;

    const pollSettlement = async () => {
      try {
        const { data } = await supabase
          .from('transactions')
          .select('*')
          .eq('account_id', activeAccount.id)
          .eq('external_reference', generatedTxRef)
          .eq('direction', 'in')
          .maybeSingle();

        if (data) {
          setDynamicChargePaid({
            paid: true,
            payerName: data.counterparty_name || 'Cliente Pagador',
            amount: Number(data.amount),
            paidAt: data.created_at,
          });

          // Atualiza lista de cobranças persistidas
          setStoredCharges((prev) => {
            const updated = prev.map((ch) =>
              ch.txRef === generatedTxRef
                ? {
                    ...ch,
                    paid: true,
                    payerName: data.counterparty_name || 'Cliente Pagador',
                    paidAt: data.created_at,
                  }
                : ch
            );
            if (activeAccount?.id) {
              localStorage.setItem(`optmapay_pix_charges_${activeAccount.id}`, JSON.stringify(updated));
            }
            return updated;
          });

          fetchPixTransactions();
          refreshAccounts();
        }
      } catch {
        // Silencioso
      }
    };

    const interval = setInterval(pollSettlement, 800);
    pollSettlement();

    return () => clearInterval(interval);
  }, [generatedTxRef, activeAccount?.id, dynamicChargePaid?.paid]);

  const fetchPixTransactions = async () => {
    if (!activeAccount) return;
    setLoadingPixTx(true);
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('account_id', activeAccount.id)
      .eq('type', 'pix')
      .gte('created_at', sixtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    setPixTransactions((data || []) as SandboxTransaction[]);
    setLoadingPixTx(false);
  };

  useEffect(() => {
    fetchPixTransactions();

    const handleRealtime = (e: any) => {
      fetchPixTransactions();

      if (e.detail?.new) {
        const row = e.detail.new;
        if (
          row.account_id === activeAccountRef.current?.id &&
          row.direction === 'in' &&
          row.external_reference
        ) {
          if (generatedTxRef && row.external_reference === generatedTxRef) {
            setDynamicChargePaid({
              paid: true,
              payerName: row.counterparty_name || 'Cliente Pagador',
              amount: Number(row.amount),
              paidAt: row.created_at,
            });
          }

          setStoredCharges((prev) => {
            const updated = prev.map((ch) =>
              ch.txRef === row.external_reference
                ? {
                    ...ch,
                    paid: true,
                    payerName: row.counterparty_name || 'Cliente Pagador',
                    paidAt: row.created_at,
                  }
                : ch
            );
            if (activeAccountRef.current?.id) {
              localStorage.setItem(
                `optmapay_pix_charges_${activeAccountRef.current.id}`,
                JSON.stringify(updated)
              );
            }
            return updated;
          });
        }
      }
    };

    window.addEventListener('optmapay:realtime_update', handleRealtime);
    return () => {
      window.removeEventListener('optmapay:realtime_update', handleRealtime);
    };
  }, [activeAccount?.id, generatedTxRef]);

  if (!activeAccount) return null;

  // Static Receive Payload
  const staticPayload = generateOptmaPayPixPayload({
    receiverPixKey: activeAccount.pix_key,
    receiverName: activeAccount.name,
    receiverAccountId: activeAccount.id,
  });

  // Validação de entrada de Pix
  const handlePixInputChange = (val: string) => {
    setRawPixInput(val);
    setErrorMessage(null);

    if (!val.trim()) {
      setParsedData(null);
      setPayAmount('0.00');
      setPayDesc('');
      return;
    }

    const parsed = parsePixPayload(val);
    setParsedData(parsed);

    // Valida se a instrução expirou (regra de 10 minutos)
    if (parsed.isOptmaPayCode && val.includes('ts=')) {
      try {
        const urlParams = new URLSearchParams(val.split('?')[1]);
        const tsStr = urlParams.get('ts');
        if (tsStr) {
          const creationTs = parseInt(tsStr, 10);
          const tenMinutesMs = 10 * 60 * 1000;
          if (Date.now() - creationTs > tenMinutesMs) {
            setErrorMessage('Atenção: Esta instrução de cobrança Pix expirou após 10 minutos e não pode mais ser paga.');
          }
        }
      } catch {
        // Ignora
      }
    }

    if (parsed.amount && parsed.amount > 0) {
      setPayAmount(parsed.amount.toFixed(2));
    } else {
      setPayAmount('0.00');
    }

    if (parsed.description) {
      setPayDesc(parsed.description);
    } else if (parsed.merchantName) {
      setPayDesc(`Pagamento para ${parsed.merchantName}`);
    }
  };

  const handleCopyCleanKey = () => {
    navigator.clipboard.writeText(activeAccount.pix_key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyStaticInstruction = () => {
    navigator.clipboard.writeText(staticPayload);
    setCopiedInstruction(true);
    setTimeout(() => setCopiedInstruction(false), 2000);
  };

  const handleCopyDynamicPayload = () => {
    // Bloqueia cópia se já foi paga ou expirou
    if (!generatedPayload || dynamicChargePaid?.paid || countdownSeconds <= 0) return;
    navigator.clipboard.writeText(generatedPayload);
    setCopiedDynamicPayload(true);
    setTimeout(() => setCopiedDynamicPayload(false), 2000);
  };

  const handleGenerateDynamic = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(pixAmount);
    const randomTxRef = `TXN-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const finalDescription = pixDesc.trim() || 'Cobrança Pix Sandbox';
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000; // 10 Minutos

    const payload = generateOptmaPayPixPayload({
      receiverPixKey: activeAccount.pix_key,
      receiverName: activeAccount.name,
      receiverAccountId: activeAccount.id,
      amount: isNaN(val) ? 0 : val,
      orderId: randomTxRef,
      description: finalDescription,
    });

    setGeneratedTxRef(randomTxRef);
    setGeneratedPayload(payload);
    setGeneratedExpiresAt(expiresAt);
    setCountdownSeconds(600);
    setDynamicChargePaid(null);

    // Salva na lista de cobranças gerenciadas
    const newCharge: StoredPixCharge = {
      id: crypto.randomUUID ? crypto.randomUUID() : `ch_${Date.now()}`,
      txRef: randomTxRef,
      amount: isNaN(val) ? 0 : val,
      description: finalDescription,
      payload,
      createdAt: now,
      expiresAt,
      paid: false,
    };

    saveCharges([newCharge, ...storedCharges.slice(0, 49)]);
  };

  // Execução de Transferência Pix
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setTransferReceipt(null);

    const targetKey = parsedData?.cleanKey || rawPixInput.trim();
    if (!targetKey) {
      setErrorMessage('Informe a chave Pix ou código de instrução de destino.');
      return;
    }

    const val = parseFloat(payAmount);
    if (isNaN(val) || val <= 0) {
      setErrorMessage('Informe um valor de transferência válido maior que R$ 0,00.');
      return;
    }

    if (activeAccount.balance < val) {
      setErrorMessage(
        `Saldo insuficiente nesta conta (Disponível: R$ ${activeAccount.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`
      );
      return;
    }

    setPaying(true);

    try {
      const result = await executePixTransfer({
        senderAccountId: activeAccount.id,
        destPixKeyOrPayload: rawPixInput,
        amount: val,
        description: payDesc.trim() || undefined,
      });

      setTransferReceipt(result);
      await refreshAccounts();
      await fetchPixTransactions();

      setRawPixInput('');
      setParsedData(null);
      setPayAmount('0.00');
      setPayDesc('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao processar transferência Pix.');
    } finally {
      setPaying(false);
    }
  };

  // Execução de Devolução Pix
  const handleExecuteRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTxForRefund || !activeAccount) return;

    const refundAmountNum =
      refundMode === 'total'
        ? Number(selectedTxForRefund.amount)
        : parseFloat(partialAmount);

    if (isNaN(refundAmountNum) || refundAmountNum <= 0) {
      setRefundErrorMessage('Informe um valor de devolução válido.');
      return;
    }

    if (refundAmountNum > Number(selectedTxForRefund.amount)) {
      setRefundErrorMessage(
        `O valor de devolução não pode exceder o valor original de R$ ${Number(selectedTxForRefund.amount).toFixed(2)}.`
      );
      return;
    }

    if (activeAccount.balance < refundAmountNum) {
      setRefundErrorMessage(
        `Saldo insuficiente para realizar a devolução (Disponível: R$ ${activeAccount.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`
      );
      return;
    }

    setProcessingRefund(true);
    setRefundErrorMessage(null);

    try {
      const { data, error } = await supabase.rpc('refund_pix', {
        p_original_transaction_id: selectedTxForRefund.id,
        p_refund_amount: refundAmountNum,
        p_reason: refundReason.trim() || 'Devolução Pix',
      });

      if (error) throw error;

      setRefundSuccessMessage(
        `Devolução de R$ ${refundAmountNum.toFixed(2)} concluída com sucesso para ${data.receiver_name}!`
      );
      await refreshAccounts();
      await fetchPixTransactions();

      setTimeout(() => {
        setSelectedTxForRefund(null);
        setRefundSuccessMessage(null);
      }, 2500);
    } catch (err: any) {
      setRefundErrorMessage(err.message || 'Falha ao processar devolução Pix.');
    } finally {
      setProcessingRefund(false);
    }
  };

  const handleCopyReceiptText = () => {
    if (!transferReceipt) return;
    const text = `COMPROVANTE DE TRANSFERÊNCIA PIX - OPTMAPAY SANDBOX
------------------------------------------------
Valor: R$ ${transferReceipt.amount.toFixed(2)}
Data/Hora: ${new Date(transferReceipt.transactionDate).toLocaleString('pt-BR')}
Autenticação: ${transferReceipt.externalReference}

ORIGEM:
Nome: ${transferReceipt.senderName}
Chave Pix: ${transferReceipt.senderPixKey || 'N/A'}

DESTINO:
Nome: ${transferReceipt.receiverName}
Chave Pix: ${transferReceipt.receiverPixKey || 'N/A'}

Ambiente: Sandbox Dev Bank (realMoney: false)
------------------------------------------------`;
    navigator.clipboard.writeText(text);
    setCopiedReceiptText(true);
    setTimeout(() => setCopiedReceiptText(false), 2000);
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[#19A999]" />
            Área Pix Sandbox & Cobranças
          </h1>
          <p className="text-xs text-slate-500">
            Transfira fundos, emita QR Codes com baixa automática em tempo real e validade de 10 minutos
          </p>
        </div>

        {/* Action Tabs */}
        <div className="flex flex-wrap bg-slate-200 dark:bg-slate-800 p-1 rounded-xl gap-1 text-xs font-bold">
          <button
            onClick={() => {
              setActiveTab('pay');
              setErrorMessage(null);
            }}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'pay'
                ? 'bg-[#19A999] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Pagar / Enviar</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('receive');
              setErrorMessage(null);
            }}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'receive'
                ? 'bg-[#19A999] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Receber (Estático)</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('generate');
              setErrorMessage(null);
            }}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'generate'
                ? 'bg-[#F1613A] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Cobrança com Valor</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('charges');
              setErrorMessage(null);
            }}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'charges'
                ? 'bg-[#19A999] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Minhas Cobranças</span>
          </button>
        </div>
      </div>

      {/* Account Info Bar */}
      <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-700 text-[#19A999] shadow-sm">
            {activeAccount.type === 'merchant' ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-semibold uppercase">
              Sua Conta Atual ({activeAccount.type === 'merchant' ? 'Empresa' : 'Cliente'})
            </span>
            <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{activeAccount.name}</p>
            <p className="font-mono text-[11px] text-slate-500">Chave Pix: {activeAccount.pix_key}</p>
          </div>
        </div>

        <div className="text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 dark:border-slate-700">
          <span className="text-[10px] text-slate-400 font-semibold uppercase">Seu Saldo Disponível</span>
          <p className="text-lg font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
            R$ {activeAccount.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* MODAL COMPROVANTE PROFISSIONAL DE TRANSFERÊNCIA PIX */}
      {transferReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl space-y-0">
            <div className="bg-[#29324E] text-white p-6 text-center relative border-b-4 border-[#19A999]">
              <button
                onClick={() => setTransferReceipt(null)}
                className="absolute right-4 top-4 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center mb-2">
                <FileCheck2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold">Comprovante de Transferência Pix</h3>
              <p className="text-xs text-teal-300">OptmaPay Sandbox Dev Bank</p>
            </div>

            <div className="p-6 space-y-5 text-xs text-slate-700 dark:text-slate-300">
              <div className="text-center py-2 border-b border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[11px] text-slate-400 font-semibold uppercase">Valor Transferido</span>
                <p className="text-3xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                  R$ {transferReceipt.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[11px] text-slate-400">
                  {new Date(transferReceipt.transactionDate).toLocaleString('pt-BR')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Origem (Pagador)</span>
                  <p className="font-bold text-slate-900 dark:text-white text-xs">{transferReceipt.senderName}</p>
                  <p className="font-mono text-[10px] text-slate-500 truncate">{transferReceipt.senderPixKey}</p>
                  <p className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-bold pt-1">
                    Seu Saldo: R$ {transferReceipt.senderBalanceAfter.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Destino (Recebedor)</span>
                  <p className="font-bold text-slate-900 dark:text-white text-xs">{transferReceipt.receiverName}</p>
                  <p className="font-mono text-[10px] text-slate-500 truncate">{transferReceipt.receiverPixKey}</p>
                  <p className="text-[10px] text-slate-400 italic pt-1">Transferência creditada instantaneamente</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-mono text-slate-500 space-y-1">
                <div className="flex justify-between">
                  <span>Autenticação Digital:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{transferReceipt.externalReference}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ambiente:</span>
                  <span>Sandbox (realMoney: false)</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCopyReceiptText}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2"
                >
                  {copiedReceiptText ? <Check className="w-4 h-4 text-teal-500" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedReceiptText ? 'Copiado!' : 'Copiar Texto'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 py-3 bg-[#19A999] hover:bg-[#158f81] text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir / Salvar PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 1: PAGAR / TRANSFERIR PIX */}
      {activeTab === 'pay' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Send className="w-4 h-4 text-[#19A999]" />
              Transferir Saldo via Pix
            </h2>

            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="py-1.5 px-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 text-[#19A999] font-bold text-xs transition flex items-center gap-1.5 border border-teal-500/20"
            >
              <Camera className="w-4 h-4" />
              <span>Ler QR Code com Câmera</span>
            </button>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleExecuteTransfer} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Cole o Código Pix (Instrução OptmaPay, QR Code ou Chave):
              </label>
              <input
                type="text"
                value={rawPixInput}
                onChange={(e) => handlePixInputChange(e.target.value)}
                placeholder="Ex: OPTMAPAY://PIX/v1?to=... ou chave Pix/e-mail..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#19A999] outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Valor da Transferência (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-[#19A999] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição do Pagamento (Opcional)
                </label>
                <input
                  type="text"
                  value={payDesc}
                  onChange={(e) => setPayDesc(e.target.value)}
                  placeholder="Ex: Pagamento de serviços / Compras"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#19A999] outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={paying}
              className="w-full py-3.5 bg-[#F1613A] hover:bg-[#d94f2a] text-white font-bold text-xs rounded-xl transition shadow-lg shadow-orange-950/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {paying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>{paying ? 'Processando Transferência Pix...' : 'Confirmar e Transferir Pix Agora'}</span>
            </button>
          </form>
        </div>
      )}

      {/* ABA 2: RECEBER PIX (QR CODE ESTÁTICO) */}
      {activeTab === 'receive' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-5 shadow-sm text-center">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
            QR Code de Recebimento — {activeAccount.name}
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Aponte a câmera do celular de outra conta para este QR Code para transferir saldo instantaneamente.
          </p>

          <div className="flex justify-center p-6 bg-white rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner w-fit mx-auto">
            <QRCodeSVG value={staticPayload} size={200} />
          </div>

          <div className="space-y-1.5 max-w-lg mx-auto">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Código de Instrução Pix OptmaPay:
            </p>
            <p className="text-[10px] font-mono text-[#19A999] break-all bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 select-all">
              {staticPayload}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 max-w-md mx-auto">
            <button
              onClick={handleCopyStaticInstruction}
              className="w-full sm:w-auto flex-1 py-2.5 px-4 bg-[#19A999] hover:bg-[#158f81] text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-md"
            >
              {copiedInstruction ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedInstruction ? 'Instrução Copiada!' : 'Copiar Código Pix Completo'}</span>
            </button>

            <button
              onClick={handleCopyCleanKey}
              className="w-full sm:w-auto py-2.5 px-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2"
            >
              {copiedKey ? <Check className="w-4 h-4 text-teal-500" /> : <Link2 className="w-4 h-4" />}
              <span>{copiedKey ? 'Chave Copiada!' : 'Apenas Chave'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ABA 3: GERAR COBRANÇA DINÂMICA COM VALIDADE DE 10 MINUTOS & BAIXA INSTANTÂNEA */}
      {activeTab === 'generate' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#F1613A]" />
            Gerar Cobrança Pix com Valor
          </h2>
          <p className="text-xs text-slate-500">
            Gera um QR Code dinâmico com valor predefinido válido por <strong>10 minutos</strong> e baixa automática em tempo real.
          </p>

          <form onSubmit={handleGenerateDynamic} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Valor Cobrado (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={pixAmount}
                  onChange={(e) => setPixAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-[#19A999] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição do Pedido (Opcional)
                </label>
                <input
                  type="text"
                  value={pixDesc}
                  onChange={(e) => setPixDesc(e.target.value)}
                  placeholder="Ex: Pedido de Venda Online #1024"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#19A999] outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-[#F1613A] hover:bg-[#d94f2a] text-white font-bold text-xs rounded-xl transition shadow-md shadow-orange-950/20 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Gerar Instrução de Cobrança Pix (Válida por 10 Minutos)</span>
            </button>
          </form>

          {/* EXIBIÇÃO DO QR CODE GERADO COM STATUS & TIMER */}
          {generatedPayload && (
            <div className="pt-6 border-t border-slate-200 dark:border-slate-700 space-y-4">
              <div className="flex items-center justify-center">
                {dynamicChargePaid?.paid ? (
                  <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-500 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-3 shadow-md">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                    <div>
                      <p className="font-extrabold text-sm">PIX PAGO COM SUCESSO! (Baixa Realizada)</p>
                      <p className="text-[11px]">Pagador: <strong>{dynamicChargePaid.payerName}</strong> • R$ {dynamicChargePaid.amount?.toFixed(2)}</p>
                    </div>
                  </div>
                ) : countdownSeconds > 0 ? (
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500 animate-spin" />
                    <span>
                      Aguardando Pagamento do Cliente • Tempo restante: <strong>{formatCountdown(countdownSeconds)}</strong>
                    </span>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-500 text-xs flex items-center gap-2">
                    <Lock className="w-4 h-4 text-rose-500" />
                    <span>Cobrança Pix Expirada após 10 minutos (Não pode mais ser utilizada)</span>
                  </div>
                )}
              </div>

              <div className="flex justify-center p-4 bg-white rounded-2xl border border-slate-200 dark:border-slate-700 w-fit mx-auto shadow-sm">
                <QRCodeSVG value={generatedPayload} size={180} />
              </div>

              <div className="space-y-1.5 max-w-lg mx-auto text-center">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Código Pix Copia e Cola:
                </p>
                <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 break-all bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 select-all text-left">
                  {generatedPayload}
                </p>
              </div>

              {/* Botão de Cópia com Bloqueio Inteligente se Paga ou Expirada */}
              {dynamicChargePaid?.paid ? (
                <div className="py-2.5 px-6 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold text-xs rounded-xl flex items-center justify-center gap-2 mx-auto w-fit">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>✓ Cobrança Liquidada (Código Desativado)</span>
                </div>
              ) : countdownSeconds <= 0 ? (
                <div className="py-2.5 px-6 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-400 font-bold text-xs rounded-xl flex items-center justify-center gap-2 mx-auto w-fit">
                  <Lock className="w-4 h-4 text-slate-400" />
                  <span>Cobrança Expirada (Código Desativado)</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleCopyDynamicPayload}
                  className="py-2.5 px-6 bg-[#19A999] hover:bg-[#158f81] text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 mx-auto shadow-md"
                >
                  {copiedDynamicPayload ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedDynamicPayload ? 'Código Copiado!' : 'Copiar Código de Cobrança'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ABA 4: GERENCIAR COBRANÇAS PIX EMITIDAS */}
      {activeTab === 'charges' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-[#19A999]" />
              Minhas Cobranças Pix Emitidas
            </h2>
            <button
              onClick={() => saveCharges([])}
              className="text-xs text-slate-400 hover:text-rose-500"
            >
              Limpar Lista
            </button>
          </div>

          {storedCharges.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
              Nenhuma cobrança gerada nesta sessão. Gere uma cobrança na aba "Cobrança com Valor".
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/60 overflow-x-auto text-xs">
              {storedCharges.map((ch) => {
                const isExpired = Date.now() > ch.expiresAt && !ch.paid;
                const statusBadge = ch.paid ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 font-bold text-[10px]">
                    Paga
                  </span>
                ) : isExpired ? (
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 font-bold text-[10px]">
                    Expirada
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 font-bold text-[10px]">
                    Aguardando Pagamento
                  </span>
                );

                const canCopy = !ch.paid && !isExpired;

                return (
                  <div key={ch.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{ch.description}</span>
                        {statusBadge}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Ref: {ch.txRef} • Criada em: {new Date(ch.createdAt).toLocaleTimeString('pt-BR')}
                        {ch.payerName ? ` • Paga por: ${ch.payerName}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100">
                        R$ {ch.amount.toFixed(2)}
                      </span>

                      {canCopy ? (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(ch.payload);
                            alert('Código Pix copiado para a área de transferência!');
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition"
                          title="Copiar Código Pix"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <div
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed"
                          title={ch.paid ? 'Cobrança já foi paga' : 'Cobrança expirada'}
                        >
                          <Lock className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* EXTRATO EXCLUSIVO DE PIX COM BOTÃO DE DEVOLUÇÃO */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#19A999]" />
              Extrato Exclusivo de Pix ({activeAccount.name})
            </h2>
            <p className="text-xs text-slate-500">
              Histórico de transferências Pix enviadas e recebidas (Clique em um Pix recebido para estornar/devolver)
            </p>
          </div>
          <button
            onClick={fetchPixTransactions}
            className="p-2 text-slate-400 hover:text-teal-600 transition flex items-center gap-1 text-xs self-end sm:self-auto"
            title="Atualizar extrato Pix"
          >
            <RefreshCw className={`w-4 h-4 ${loadingPixTx ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {pixTransactions.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            Nenhuma transferência Pix realizada ou recebida por esta conta nos últimos 60 dias.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60 overflow-x-auto">
            {pixTransactions.map((tx) => {
              const isIn = tx.direction === 'in';
              return (
                <div
                  key={tx.id}
                  onClick={() => {
                    if (isIn) {
                      setSelectedTxForRefund(tx);
                      setRefundMode('total');
                      setPartialAmount(Number(tx.amount).toFixed(2));
                      setRefundErrorMessage(null);
                      setRefundSuccessMessage(null);
                    }
                  }}
                  className={`py-3 flex items-center justify-between gap-4 text-xs transition ${
                    isIn ? 'hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-xl shrink-0 ${
                        isIn
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isIn ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span>{isIn ? `Pix Recebido de ${tx.counterparty_name || 'Conta Externa'}` : `Pix Enviado para ${tx.counterparty_name || 'Conta Externa'}`}</span>
                        {isIn && (
                          <span className="px-1.5 py-0.5 bg-teal-500/10 text-[#19A999] rounded text-[9px] font-semibold">
                            Devolver Pix
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {tx.description ? `${tx.description} • ` : ''}
                        {tx.external_reference ? `Ref: ${tx.external_reference} • ` : ''}
                        {new Date(tx.created_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className={`font-bold ${isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {isIn ? '+' : '-'} R$ {Number(tx.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      PIX {tx.environment.toUpperCase()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL DEVOLUÇÃO / ESTORNO PIX (PARCIAL OU TOTAL) */}
      {selectedTxForRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-base">
                <RotateCcw className="w-5 h-5" />
                <h3>Devolução de Pix Recebido</h3>
              </div>
              <button
                onClick={() => setSelectedTxForRefund(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {refundSuccessMessage ? (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-500 text-emerald-700 dark:text-emerald-300 text-center space-y-2 animate-fadeIn text-xs">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
                <p className="font-bold text-sm">{refundSuccessMessage}</p>
                <p className="text-[11px] text-slate-500">Saldo estornado e atualizado em tempo real.</p>
              </div>
            ) : (
              <form onSubmit={handleExecuteRefund} className="space-y-4 text-xs">
                {refundErrorMessage && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-400 text-rose-700 dark:text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{refundErrorMessage}</span>
                  </div>
                )}

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Pix Original Recebido</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                    R$ {Number(selectedTxForRefund.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-slate-500">De: <strong>{selectedTxForRefund.counterparty_name || 'Conta Pagadora'}</strong></p>
                  <p className="text-slate-400 text-[10px]">Data: {new Date(selectedTxForRefund.created_at).toLocaleString('pt-BR')}</p>
                </div>

                <div className="space-y-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300">
                    Tipo de Devolução
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRefundMode('total')}
                      className={`py-2 px-3 rounded-xl border font-bold transition ${
                        refundMode === 'total'
                          ? 'bg-teal-50 dark:bg-teal-950/80 border-[#19A999] text-[#19A999]'
                          : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Devolução Total (100%)
                    </button>

                    <button
                      type="button"
                      onClick={() => setRefundMode('partial')}
                      className={`py-2 px-3 rounded-xl border font-bold transition ${
                        refundMode === 'partial'
                          ? 'bg-teal-50 dark:bg-teal-950/80 border-[#19A999] text-[#19A999]'
                          : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Devolução Parcial
                    </button>
                  </div>
                </div>

                {refundMode === 'partial' && (
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Valor a Devolver (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={Number(selectedTxForRefund.amount)}
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono font-bold text-rose-600 outline-none focus:ring-2 focus:ring-rose-500"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Motivo da Devolução (Opcional)
                  </label>
                  <input
                    type="text"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="Ex: Cancelamento de pedido / Valor divergente"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs outline-none focus:ring-2 focus:ring-[#19A999]"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTxForRefund(null)}
                    className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={processingRefund}
                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {processingRefund && <RefreshCw className="w-4 h-4 animate-spin" />}
                    <span>{processingRefund ? 'Processando...' : 'Confirmar Devolução'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal Scanner QR Code Câmera */}
      {isScannerOpen && (
        <MobileQrScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScanSuccess={(code) => {
            handlePixInputChange(code);
            setIsScannerOpen(false);
          }}
        />
      )}
    </div>
  );
};
