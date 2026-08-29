import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import { MobileQrScannerModal } from '../components/MobileQrScannerModal';
import { parsePixPayload, executePixTransfer, PixTransferResult } from '../lib/pixService';
import {
  QrCode,
  Copy,
  Check,
  Send,
  Sparkles,
  Building2,
  User,
  Camera,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';

export const PixArea: React.FC = () => {
  const { activeAccount, accounts, refreshAccounts } = useAuth();
  const [activeTab, setActiveTab] = useState<'pay' | 'receive' | 'generate'>('pay');
  const [copiedKey, setCopiedKey] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Transfer Pay Pix State
  const [destPixKey, setDestPixKey] = useState('');
  const [payAmount, setPayAmount] = useState('150.00');
  const [payDesc, setPayDesc] = useState('Transferência Pix Sandbox');
  const [payOrderId, setPayOrderId] = useState(`ORD-${Math.floor(1000 + Math.random() * 9000)}`);
  const [paying, setPaying] = useState(false);
  const [transferReceipt, setTransferReceipt] = useState<PixTransferResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dynamic QR Code State
  const [pixAmount, setPixAmount] = useState('150.00');
  const [pixDesc, setPixDesc] = useState('Pedido Venda Sandbox');
  const [generatedPayload, setGeneratedPayload] = useState<string | null>(null);
  const [copiedPayload, setCopiedPayload] = useState(false);

  if (!activeAccount) return null;

  const otherAccounts = accounts.filter((a) => a.id !== activeAccount.id);

  // Handle Pix Key or BR Code Input Changes with auto-detection
  const handlePixInputChange = (rawVal: string) => {
    setErrorMessage(null);
    setTransferReceipt(null);

    const parsed = parsePixPayload(rawVal);
    setDestPixKey(parsed.cleanKey);

    if (parsed.isEmv) {
      if (parsed.amount && parsed.amount > 0) {
        setPayAmount(parsed.amount.toFixed(2));
      }
      if (parsed.orderId) {
        setPayOrderId(parsed.orderId);
      }
      if (parsed.description) {
        setPayDesc(parsed.description);
      }
    }
  };

  // Find detected destination account in the local list for immediate visual confirmation
  const detectedTargetAccount = otherAccounts.find(
    (a) =>
      a.pix_key.toLowerCase() === destPixKey.trim().toLowerCase() ||
      a.cpf_cnpj.replace(/\D/g, '') === destPixKey.replace(/\D/g, '')
  );

  const handleCopyPixKey = () => {
    navigator.clipboard.writeText(activeAccount.pix_key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyGeneratedPayload = () => {
    if (!generatedPayload) return;
    navigator.clipboard.writeText(generatedPayload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handleGenerateDynamic = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(pixAmount);
    const txid = `TXID${Date.now().toString().slice(-6)}`;
    const payload = `00020126580014br.gov.bcb.pix01${activeAccount.pix_key.length}${activeAccount.pix_key}5204000053039865405${val.toFixed(2)}5802BR5915${activeAccount.name.slice(0, 15)}6009SAO PAULO62070503${txid}6304`;
    setGeneratedPayload(payload);
  };

  // Perform Pix Payment Transfer (From active account to destination Pix key)
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setTransferReceipt(null);

    if (!destPixKey.trim()) {
      setErrorMessage('Informe a chave Pix de destino.');
      return;
    }

    const val = parseFloat(payAmount);
    if (isNaN(val) || val <= 0) {
      setErrorMessage('Informe um valor válido maior que R$ 0,00.');
      return;
    }

    if (activeAccount.balance < val) {
      setErrorMessage(`Saldo insuficiente (R$ ${activeAccount.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`);
      return;
    }

    setPaying(true);

    try {
      const result = await executePixTransfer({
        senderAccountId: activeAccount.id,
        destPixKeyOrPayload: destPixKey,
        amount: val,
        description: payDesc,
        externalReference: payOrderId,
      });

      setTransferReceipt(result);
      await refreshAccounts();
      setDestPixKey('');
      setPayOrderId(`ORD-${Math.floor(1000 + Math.random() * 9000)}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao processar transferência Pix.');
    } finally {
      setPaying(false);
    }
  };

  // Handle Scanned Text from Mobile Camera or File Upload
  const handleQrScanned = (scannedText: string) => {
    handlePixInputChange(scannedText);
    setActiveTab('pay');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Área Pix Sandbox & Transferências
          </h1>
          <p className="text-xs text-slate-500">
            Transfira fundos instantaneamente entre contas via chave Pix, Copia e Cola ou QR Code
          </p>
        </div>

        {/* Action Tabs */}
        <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl gap-1">
          <button
            onClick={() => {
              setActiveTab('pay');
              setErrorMessage(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'pay'
                ? 'bg-teal-600 text-white shadow-sm'
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
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'receive'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Receber (QR Estático)</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('generate');
              setErrorMessage(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'generate'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Cobrança Dinâmica</span>
          </button>
        </div>
      </div>

      {/* Current Active Account Badge */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-teal-900/60 to-slate-900 border border-teal-500/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
            {activeAccount.type === 'merchant' ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-teal-300 tracking-wider">
              Conta Pagadora Atual ({activeAccount.type === 'merchant' ? 'Empresa' : 'Cliente'})
            </span>
            <h2 className="text-sm sm:text-base font-bold text-white leading-tight">{activeAccount.name}</h2>
            <p className="text-xs text-slate-400 font-mono">Chave Pix: {activeAccount.pix_key}</p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] text-slate-400 uppercase block">Saldo Disponível</span>
          <span className="text-base sm:text-lg font-extrabold text-emerald-400 font-mono">
            R$ {activeAccount.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* ABA 1: PAGAR / TRANSFERIR PIX VIA CELULAR OU COMPUTADOR */}
      {activeTab === 'pay' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Send className="w-5 h-5 text-teal-600" />
              Transferir Saldo via Pix
            </h2>

            <button
              onClick={() => setIsScannerOpen(true)}
              className="py-1.5 px-3 bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold text-xs rounded-xl hover:bg-teal-100 dark:hover:bg-teal-900 transition flex items-center gap-1.5 border border-teal-300 dark:border-teal-800"
            >
              <Camera className="w-4 h-4" />
              <span>Ler QR Code com Câmera</span>
            </button>
          </div>

          {/* Success Receipt Card */}
          {transferReceipt && (
            <div className="p-5 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 space-y-3 animate-fadeIn shadow-xl">
              <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5" />
                <span>Comprovante de Transferência Pix Sandbox</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-emerald-800/60">
                <div>
                  <span className="text-emerald-400/70 text-[11px] block">De (Pagador):</span>
                  <span className="font-bold text-white">{transferReceipt.senderName}</span>
                  <span className="text-[11px] font-mono text-emerald-300/80 block">
                    Novo Saldo: R$ {transferReceipt.senderBalanceAfter.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-emerald-400/70 text-[11px] block">Para (Recebedor):</span>
                  <span className="font-bold text-white">{transferReceipt.receiverName}</span>
                  <span className="text-[11px] font-mono text-emerald-300/80 block">
                    Novo Saldo: R$ {transferReceipt.receiverBalanceAfter.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-emerald-800/60 font-mono">
                <span>Valor Transferido:</span>
                <span className="text-base font-extrabold text-emerald-300">
                  R$ {transferReceipt.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {transferReceipt.webhooksDispatched > 0 && (
                <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{transferReceipt.webhooksDispatched} webhook(s) disparado(s) com sucesso.</span>
                </div>
              )}
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleExecuteTransfer} className="space-y-4">
            {/* Quick Pick Destination Account Key */}
            {otherAccounts.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Selecione uma Conta Cadastrada para Transferir:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {otherAccounts.map((acc) => {
                    const isSelected = destPixKey.toLowerCase() === acc.pix_key.toLowerCase();
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => handlePixInputChange(acc.pix_key)}
                        className={`p-2.5 rounded-xl border text-left text-xs transition flex items-center justify-between ${
                          isSelected
                            ? 'bg-teal-50 dark:bg-teal-950/80 border-teal-500 ring-2 ring-teal-500/20 font-bold'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-teal-400'
                        }`}
                      >
                        <div className="truncate">
                          <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{acc.name}</p>
                          <p className="text-[10px] font-mono text-slate-400 truncate">{acc.pix_key}</p>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 block">
                            {acc.type}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            R$ {acc.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Input Pix Key or BR Code Copia e Cola */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Chave Pix de Destino / Copia e Cola / Payload QR Code
                </label>
                {detectedTargetAccount && (
                  <span className="text-[11px] text-teal-600 dark:text-teal-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Destinatário: {detectedTargetAccount.name}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={destPixKey}
                onChange={(e) => handlePixInputChange(e.target.value)}
                placeholder="Cole a chave Pix, e-mail, CPF/CNPJ ou código EMV BR Code..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-teal-700 dark:text-teal-400 focus:ring-2 focus:ring-teal-500 outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Valor da Transferência (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-extrabold text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  ID do Pedido / Referência
                </label>
                <input
                  type="text"
                  value={payOrderId}
                  onChange={(e) => setPayOrderId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Descrição do Pagamento
              </label>
              <input
                type="text"
                value={payDesc}
                onChange={(e) => setPayDesc(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={paying}
              className="w-full py-3.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-teal-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{paying ? 'Transferindo Saldo no Supabase...' : 'Confirmar e Transferir Pix Agora'}</span>
            </button>
          </form>
        </div>
      )}

      {/* ABA 2: RECEBER PIX (QR CODE ESTÁTICO) */}
      {activeTab === 'receive' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm text-center">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
            QR Code Estático de Recebimento
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Qualquer conta pode ler este QR Code com a câmera do celular ou copiar a chave abaixo para transferir saldo diretamente para <strong>{activeAccount.name}</strong>.
          </p>

          <div className="flex justify-center p-6 bg-white rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner w-fit mx-auto">
            <QRCodeSVG value={`PIX:${activeAccount.pix_key}`} size={200} />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Sua Chave Pix Cadastrada:
            </p>
            <p className="text-sm font-mono font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-4 py-2 rounded-xl inline-block border border-teal-200 dark:border-teal-800">
              {activeAccount.pix_key}
            </p>
          </div>

          <button
            onClick={handleCopyPixKey}
            className="w-full max-w-xs mx-auto py-2.5 px-4 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-teal-900/20"
          >
            {copiedKey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiedKey ? 'Chave Copiada!' : 'Copiar Chave Pix'}</span>
          </button>
        </div>
      )}

      {/* ABA 3: GERAR COBRANÇA DINÂMICA */}
      {activeTab === 'generate' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-600" />
            Gerar QR Code Dinâmico com Valor Fixo
          </h2>
          <p className="text-xs text-slate-500">
            Gera um QR Code Pix com valor predefinido e identificador de pedido para cobrança de vendas online.
          </p>

          <form onSubmit={handleGenerateDynamic} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Valor da Cobrança (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={pixAmount}
                  onChange={(e) => setPixAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Descrição do Pedido
                </label>
                <input
                  type="text"
                  value={pixDesc}
                  onChange={(e) => setPixDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition shadow-md shadow-teal-900/20 flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Gerar QR Code Pix Dinâmico</span>
            </button>
          </form>

          {generatedPayload && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 text-center space-y-3">
              <div className="flex justify-center p-4 bg-white rounded-xl border border-slate-200 dark:border-slate-700 w-fit mx-auto shadow-sm">
                <QRCodeSVG value={generatedPayload} size={160} />
              </div>

              <div className="space-y-1.5 max-w-lg mx-auto">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Código Pix Copia e Cola:
                </p>
                <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 break-all bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 select-all">
                  {generatedPayload}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCopyGeneratedPayload}
                className="py-2 px-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 mx-auto"
              >
                {copiedPayload ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPayload ? 'Copia e Cola Copiado!' : 'Copiar Código Copia e Cola'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal Leitor de QR Code via Câmera Mobile */}
      <MobileQrScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleQrScanned}
      />
    </div>
  );
};
