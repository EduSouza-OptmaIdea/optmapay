import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import { triggerWebhookEvents } from '../lib/webhookEngine';
import { MobileQrScannerModal } from '../components/MobileQrScannerModal';
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
} from 'lucide-react';

export const PixArea: React.FC = () => {
  const { activeAccount, accounts, refreshAccounts } = useAuth();
  const [activeTab, setActiveTab] = useState<'pay' | 'receive' | 'generate'>('pay');
  const [copiedKey, setCopiedKey] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Transfer Pay Pix State
  const [destPixKey, setDestPixKey] = useState('');
  const [payAmount, setPayAmount] = useState('150.00');
  const [payDesc, setPayDesc] = useState('Pagamento Pix via Celular');
  const [payOrderId, setPayOrderId] = useState('PEDIDO-CEL-991');
  const [paying, setPaying] = useState(false);
  const [payResult, setPayResult] = useState<string | null>(null);

  // Dynamic QR Code State
  const [pixAmount, setPixAmount] = useState('150.00');
  const [pixDesc, setPixDesc] = useState('Pedido #1085 - Venda Online');
  const [generatedPayload, setGeneratedPayload] = useState<string | null>(null);

  // Simulation State
  const [selectedPayerId, setSelectedPayerId] = useState<string>('');
  const [simAmount, setSimAmount] = useState('150.00');
  const [simOrderId, setSimOrderId] = useState('ORD-9982');
  const [simLoading, setSimLoading] = useState(false);

  if (!activeAccount) return null;

  const otherAccounts = accounts.filter((a) => a.id !== activeAccount.id);

  const handleCopyPixKey = () => {
    navigator.clipboard.writeText(activeAccount.pix_key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleGenerateDynamic = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(pixAmount);
    const txid = `TXID${Date.now().toString().slice(-8)}`;
    const payload = `00020126580014br.gov.bcb.pix01${activeAccount.pix_key.length}${activeAccount.pix_key}5204000053039865405${val.toFixed(2)}5802BR5915OPTMAPAY SANDBOX6009SAO PAULO62070503***6304${txid}`;
    setGeneratedPayload(payload);
  };

  // Perform Pix Payment Transfer (From active account to destination Pix key)
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destPixKey.trim()) {
      alert('Informe a chave Pix de destino.');
      return;
    }

    const val = parseFloat(payAmount);
    if (isNaN(val) || val <= 0) return;

    if (activeAccount.balance < val) {
      alert('Saldo insuficiente na conta atual para realizar a transferência Pix.');
      return;
    }

    setPaying(true);
    setPayResult(null);

    try {
      // 1. Execute Atomic RPC transfer_pix in Supabase
      const { data, error } = await supabase.rpc('transfer_pix', {
        p_sender_account_id: activeAccount.id,
        p_receiver_pix_key: destPixKey.trim(),
        p_amount: val,
        p_description: payDesc,
        p_external_reference: payOrderId,
      });

      if (error) throw new Error(error.message);

      // 2. Trigger Webhooks to destination account if registered
      const receiverAcc = accounts.find((a) => a.pix_key === destPixKey.trim());
      let dispatched = 0;
      if (receiverAcc) {
        dispatched = await triggerWebhookEvents({
          userId: receiverAcc.user_id || '',
          accountId: receiverAcc.id,
          event: 'pix.paid',
          payloadData: {
            orderId: payOrderId,
            externalReference: payOrderId,
            amount: val,
            status: 'paid',
            senderPixKey: activeAccount.pix_key,
            receiverPixKey: destPixKey.trim(),
            realMoney: false,
            environment: 'sandbox',
          },
        });
      }

      setPayResult(`✅ Transferência Pix de R$ ${val.toFixed(2)} enviada com sucesso! ${dispatched} Webhook(s) disparado(s).`);
      await refreshAccounts();
      setDestPixKey('');
    } catch (err: any) {
      setPayResult(`❌ Erro no Pix: ${err.message}`);
    } finally {
      setPaying(false);
    }
  };

  // Handle Scanned Text from Mobile Camera or File Upload
  const handleQrScanned = (scannedText: string) => {
    let extractedKey = scannedText;

    // If payload format starts with PIX:
    if (scannedText.startsWith('PIX:')) {
      extractedKey = scannedText.replace('PIX:', '');
    }

    setDestPixKey(extractedKey);
    setActiveTab('pay');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            Área Pix Mobile & Transferências
          </h1>
          <p className="text-xs text-slate-500">
            Transfira fundos entre contas acessando no celular via chave Pix ou câmera
          </p>
        </div>

        {/* Action Tabs */}
        <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl gap-1">
          <button
            onClick={() => setActiveTab('pay')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'pay'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Pagar / Enviar</span>
          </button>
          <button
            onClick={() => setActiveTab('receive')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'receive'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Receber</span>
          </button>
          <button
            onClick={() => setActiveTab('generate')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'generate'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Cobrar</span>
          </button>
        </div>
      </div>

      {/* ABA 1: PAGAR / TRANSFERIR PIX VIA CELULAR */}
      {activeTab === 'pay' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Send className="w-5 h-5 text-teal-600" />
              Enviar Pix da Conta: {activeAccount.name}
            </h2>

            <button
              onClick={() => setIsScannerOpen(true)}
              className="py-1.5 px-3 bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold text-xs rounded-xl hover:bg-teal-200 transition flex items-center gap-1.5 border border-teal-300 dark:border-teal-800"
            >
              <Camera className="w-4 h-4" />
              <span>Ler QR Code com Câmera</span>
            </button>
          </div>

          {payResult && (
            <div className="p-3.5 rounded-xl bg-slate-900 text-white font-mono text-xs shadow-md">
              {payResult}
            </div>
          )}

          <form onSubmit={handleExecuteTransfer} className="space-y-4">
            {/* Quick Pick Destination Account Key */}
            {otherAccounts.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Ou Escolha uma Conta de Destino no Sistema:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {otherAccounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setDestPixKey(acc.pix_key)}
                      className={`p-2.5 rounded-xl border text-left text-xs transition flex items-center justify-between ${
                        destPixKey === acc.pix_key
                          ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500 font-bold'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-teal-300'
                      }`}
                    >
                      <div className="truncate">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{acc.name}</p>
                        <p className="text-[10px] font-mono text-slate-400 truncate">{acc.pix_key}</p>
                      </div>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ml-2">
                        {acc.type}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Chave Pix de Destino / Copia e Cola
              </label>
              <input
                type="text"
                value={destPixKey}
                onChange={(e) => setDestPixKey(e.target.value)}
                placeholder="vendas@optmaidea.com.br"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-teal-700 dark:text-teal-400"
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
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-extrabold text-emerald-600 dark:text-emerald-400"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Saldo Disponível: R$ {activeAccount.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  ID do Pedido / Referência Externa
                </label>
                <input
                  type="text"
                  value={payOrderId}
                  onChange={(e) => setPayOrderId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Descrição da Transferência
              </label>
              <input
                type="text"
                value={payDesc}
                onChange={(e) => setPayDesc(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                required
              />
            </div>

            <button
              type="submit"
              disabled={paying}
              className="w-full py-3.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-teal-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{paying ? 'Processando Transferência Pix...' : 'Confirmar e Pagar Pix Agora'}</span>
            </button>
          </form>
        </div>
      )}

      {/* ABA 2: RECEBER PIX (QR CODE ESTÁTICO) */}
      {activeTab === 'receive' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm text-center">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Seu QR Code Estático de Recebimento
          </h2>
          <p className="text-xs text-slate-500">
            Outros celulares podem apontar a câmera para este QR Code e transferir saldo para você!
          </p>
          <div className="flex justify-center p-5 bg-white rounded-2xl border border-slate-100 dark:border-slate-700 shadow-inner w-fit mx-auto">
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
            className="w-full max-w-xs mx-auto py-2.5 px-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2"
          >
            {copiedKey ? <Check className="w-4 h-4 text-teal-600" /> : <Copy className="w-4 h-4" />}
            <span>{copiedKey ? 'Chave Copiada!' : 'Copiar Chave Pix'}</span>
          </button>
        </div>
      )}

      {/* ABA 3: GERAR COBRANÇA DINÂMICA */}
      {activeTab === 'generate' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-600" />
            Gerar QR Code Dinâmico com Valor Fixo
          </h2>

          <form onSubmit={handleGenerateDynamic} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Valor da Cobrança (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={pixAmount}
                onChange={(e) => setPixAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Descrição da Venda / Pedido
              </label>
              <input
                type="text"
                value={pixDesc}
                onChange={(e) => setPixDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition shadow-md shadow-teal-900/20"
            >
              Gerar QR Code Dinâmico
            </button>
          </form>

          {generatedPayload && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-700 text-center space-y-2">
              <div className="flex justify-center p-3 bg-white rounded-xl border w-fit mx-auto">
                <QRCodeSVG value={generatedPayload} size={140} />
              </div>
              <p className="text-[10px] font-mono text-slate-400 break-all bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border">
                {generatedPayload}
              </p>
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
