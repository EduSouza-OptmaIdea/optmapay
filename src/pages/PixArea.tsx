import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import { MobileQrScannerModal } from '../components/MobileQrScannerModal';
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
} from 'lucide-react';

export const PixArea: React.FC = () => {
  const { activeAccount, refreshAccounts } = useAuth();
  const [activeTab, setActiveTab] = useState<'pay' | 'receive' | 'generate'>('pay');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedInstruction, setCopiedInstruction] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Transfer Pay Pix State
  const [rawPixInput, setRawPixInput] = useState('');
  const [parsedData, setParsedData] = useState<ParsedPixData | null>(null);
  const [payAmount, setPayAmount] = useState('150.00');
  const [payDesc, setPayDesc] = useState('Transferência Pix Sandbox');
  const [payOrderId, setPayOrderId] = useState(`ORD-${Math.floor(1000 + Math.random() * 9000)}`);
  const [paying, setPaying] = useState(false);
  const [transferReceipt, setTransferReceipt] = useState<PixTransferResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dynamic QR Code State
  const [pixAmount, setPixAmount] = useState('150.00');
  const [pixDesc, setPixDesc] = useState('Pedido Venda Sandbox');
  const [dynamicOrderId, setDynamicOrderId] = useState(`ORD-${Math.floor(1000 + Math.random() * 9000)}`);
  const [generatedPayload, setGeneratedPayload] = useState<string | null>(null);
  const [copiedDynamicPayload, setCopiedDynamicPayload] = useState(false);

  if (!activeAccount) return null;

  // Static Receive Payload
  const staticPayload = generateOptmaPayPixPayload({
    receiverPixKey: activeAccount.pix_key,
    receiverName: activeAccount.name,
    receiverAccountId: activeAccount.id,
  });

  // Handle Pix Key or BR Code / OptmaPay Code Input Changes
  const handlePixInputChange = (val: string) => {
    setRawPixInput(val);
    setErrorMessage(null);
    setTransferReceipt(null);

    if (!val.trim()) {
      setParsedData(null);
      return;
    }

    const parsed = parsePixPayload(val);
    setParsedData(parsed);

    if (parsed.amount && parsed.amount > 0) {
      setPayAmount(parsed.amount.toFixed(2));
    }
    if (parsed.orderId) {
      setPayOrderId(parsed.orderId);
    }
    if (parsed.description) {
      setPayDesc(parsed.description);
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
    if (!generatedPayload) return;
    navigator.clipboard.writeText(generatedPayload);
    setCopiedDynamicPayload(true);
    setTimeout(() => setCopiedDynamicPayload(false), 2000);
  };

  const handleGenerateDynamic = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(pixAmount);
    const payload = generateOptmaPayPixPayload({
      receiverPixKey: activeAccount.pix_key,
      receiverName: activeAccount.name,
      receiverAccountId: activeAccount.id,
      amount: isNaN(val) ? 0 : val,
      orderId: dynamicOrderId,
      description: pixDesc,
    });
    setGeneratedPayload(payload);
  };

  // Perform Pix Payment Transfer
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
      setErrorMessage('Informe um valor válido maior que R$ 0,00.');
      return;
    }

    if (activeAccount.balance < val) {
      setErrorMessage(`Saldo insuficiente nesta conta (Disponível: R$ ${activeAccount.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`);
      return;
    }

    setPaying(true);

    try {
      const result = await executePixTransfer({
        senderAccountId: activeAccount.id,
        destPixKeyOrPayload: rawPixInput,
        amount: val,
        description: payDesc,
        externalReference: payOrderId,
      });

      setTransferReceipt(result);
      await refreshAccounts();
      setRawPixInput('');
      setParsedData(null);
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
            <QrCode className="w-5 h-5 text-teal-600 dark:text-[#26c6da]" />
            Área Pix Sandbox & Transferências
          </h1>
          <p className="text-xs text-slate-500">
            Transfira fundos instantaneamente entre contas via instrução Pix, Copia e Cola ou QR Code
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
                ? 'bg-teal-600 dark:bg-[#26c6da] text-white dark:text-slate-950 shadow-sm'
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
                ? 'bg-teal-600 dark:bg-[#26c6da] text-white dark:text-slate-950 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Receber (QR Code)</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('generate');
              setErrorMessage(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'generate'
                ? 'bg-[#f36c3d] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Cobrança com Valor</span>
          </button>
        </div>
      </div>

      {/* Current Active Account Card (Only User's Own Account) */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-500/10 text-[#26c6da] border border-teal-500/20">
            {activeAccount.type === 'merchant' ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-teal-400 tracking-wider">
              Sua Conta Atual ({activeAccount.type === 'merchant' ? 'Empresa' : 'Cliente'})
            </span>
            <h2 className="text-sm sm:text-base font-bold text-white leading-tight">{activeAccount.name}</h2>
            <p className="text-xs text-slate-400 font-mono">Chave Pix: {activeAccount.pix_key}</p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] text-slate-400 uppercase block">Seu Saldo Disponível</span>
          <span className="text-base sm:text-lg font-extrabold text-emerald-400 font-mono">
            R$ {activeAccount.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* ABA 1: PAGAR / TRANSFERIR PIX */}
      {activeTab === 'pay' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Send className="w-5 h-5 text-teal-600 dark:text-[#26c6da]" />
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
            <div className="p-5 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 space-y-3 shadow-xl animate-fadeIn">
              <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5" />
                <span>Comprovante de Transferência Pix Concluída</span>
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
            {/* Input Pix Key or Instruction Code */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Cole o Código Pix (Instrução OptmaPay, QR Code ou Chave):
              </label>
              <input
                type="text"
                value={rawPixInput}
                onChange={(e) => handlePixInputChange(e.target.value)}
                placeholder="Ex: OPTMAPAY://PIX/v1?to=... ou chave Pix/e-mail..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-teal-700 dark:text-[#26c6da] focus:ring-2 focus:ring-[#26c6da] outline-none"
                required
              />

              {parsedData?.merchantName && (
                <div className="mt-2 p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-xs flex items-center gap-2 text-teal-800 dark:text-teal-300">
                  <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span>
                    Destinatário identificado:{' '}
                    <strong>{parsedData.merchantName}</strong> ({parsedData.cleanKey})
                  </span>
                </div>
              )}
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
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-extrabold text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-[#26c6da] outline-none"
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
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono focus:ring-2 focus:ring-[#26c6da] outline-none"
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-[#26c6da] outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={paying}
              className="w-full py-3.5 bg-[#f36c3d] hover:bg-[#ea580c] text-white font-bold text-xs rounded-xl transition shadow-lg shadow-orange-950/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{paying ? 'Transferindo Saldo no Supabase...' : 'Confirmar e Transferir Pix Agora'}</span>
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
            <p className="text-[10px] font-mono text-teal-700 dark:text-[#26c6da] break-all bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 select-all">
              {staticPayload}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 max-w-md mx-auto">
            <button
              onClick={handleCopyStaticInstruction}
              className="w-full sm:w-auto flex-1 py-2.5 px-4 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-md"
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

      {/* ABA 3: GERAR COBRANÇA DINÂMICA */}
      {activeTab === 'generate' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#f36c3d]" />
            Gerar Cobrança com Valor e Pedido
          </h2>
          <p className="text-xs text-slate-500">
            Gera um QR Code Pix com valor predefinido e identificador de pedido para teste de checkout.
          </p>

          <form onSubmit={handleGenerateDynamic} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Valor Cobrado (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={pixAmount}
                  onChange={(e) => setPixAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-[#26c6da] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  ID do Pedido / Ref.
                </label>
                <input
                  type="text"
                  value={dynamicOrderId}
                  onChange={(e) => setDynamicOrderId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono focus:ring-2 focus:ring-[#26c6da] outline-none"
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
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-[#26c6da] outline-none"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-[#f36c3d] hover:bg-[#ea580c] text-white font-bold text-xs rounded-xl transition shadow-md shadow-orange-950/20 flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Gerar Instrução de Cobrança Pix</span>
            </button>
          </form>

          {generatedPayload && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 text-center space-y-3">
              <div className="flex justify-center p-4 bg-white rounded-xl border border-slate-200 dark:border-slate-700 w-fit mx-auto shadow-sm">
                <QRCodeSVG value={generatedPayload} size={160} />
              </div>

              <div className="space-y-1.5 max-w-lg mx-auto">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Código Pix Copia e Cola (Instrução com Valor):
                </p>
                <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 break-all bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 select-all">
                  {generatedPayload}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCopyDynamicPayload}
                className="py-2.5 px-4 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 mx-auto shadow-md"
              >
                {copiedDynamicPayload ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedDynamicPayload ? 'Código Copiado com Sucesso!' : 'Copiar Código de Cobrança'}</span>
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
