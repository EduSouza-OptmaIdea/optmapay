import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  CreditCard as CardIcon,
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Code2,
  Lock,
} from 'lucide-react';
import { SandboxAccount, SandboxCard, SettlementPlanType } from '../types/sandbox';
import {
  calculateCardFee,
  executeCardPayment,
  validateCardBin,
  OPTMAPAY_BIN_PREFIX,
} from '../lib/cardService';

interface CardEcommerceSimulatorProps {
  activeAccount: SandboxAccount;
  allAccounts: SandboxAccount[];
  savedCards: SandboxCard[];
  onPaymentSuccess?: () => void;
}

export const CardEcommerceSimulator: React.FC<CardEcommerceSimulatorProps> = ({
  activeAccount,
  allAccounts,
  savedCards,
  onPaymentSuccess,
}) => {
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [manualNumber, setManualNumber] = useState<string>('');
  const [cardholderName, setCardholderName] = useState<string>('');
  const [validade, setValidade] = useState<string>('12/29');
  const [cvv, setCvv] = useState<string>('123');
  const [tipo, setTipo] = useState<'debito' | 'credito'>('credito');
  const [amount, setAmount] = useState<string>('249.90');
  const [installments, setInstallments] = useState<number>(1);
  const [orderId, setOrderId] = useState<string>(`ORD-${Math.floor(1000 + Math.random() * 9000)}`);
  const [description, setDescription] = useState<string>('Compra E-Commerce Loja Virtual');
  const [merchantAccountId, setMerchantAccountId] = useState<string>('');
  const [plan, setPlan] = useState<SettlementPlanType>('standard');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Set default merchant and card
  useEffect(() => {
    const merchant = allAccounts.find((a) => a.type === 'merchant') || activeAccount;
    if (merchant) setMerchantAccountId(merchant.id);
    if (savedCards.length > 0 && !selectedCardId) {
      const first = savedCards[0];
      setSelectedCardId(first.id);
      setManualNumber(first.card_number || first.masked_number);
      setCardholderName(first.cardholder_name);
      setValidade(first.validade);
      setCvv(first.cvv);
      setTipo(first.tipo);
    }
  }, [allAccounts, activeAccount, savedCards]);

  const handleCardSelect = (cardId: string) => {
    setSelectedCardId(cardId);
    const card = savedCards.find((c) => c.id === cardId);
    if (card) {
      setManualNumber(card.card_number || card.masked_number);
      setCardholderName(card.cardholder_name);
      setValidade(card.validade);
      setCvv(card.cvv);
      setTipo(card.tipo);
    }
  };

  const numVal = parseFloat(amount) || 0;
  const feeCalc = calculateCardFee(numVal, tipo, installments, plan);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);

    if (numVal <= 0) {
      setError('Informe um valor de compra válido.');
      return;
    }

    setLoading(true);

    try {
      const paymentResult = await executeCardPayment({
        merchantAccountId: merchantAccountId || activeAccount.id,
        cardNumber: manualNumber,
        cardholderName: cardholderName || 'CLIENTE SANDBOX',
        validade,
        cvv,
        amount: numVal,
        tipo,
        installments,
        plan,
        description,
        orderId,
      });

      setResult(paymentResult);
      if (onPaymentSuccess) onPaymentSuccess();
    } catch (err: any) {
      setError(err.message || 'Erro ao processar transação.');
    } finally {
      setLoading(false);
    }
  };

  const sampleApiPayload = {
    cardNumber: manualNumber.replace(/\s/g, '') || `${OPTMAPAY_BIN_PREFIX}000000000000`,
    cardholderName: cardholderName || 'NOME DO TITULAR',
    expirationDate: validade || '12/29',
    cvv: cvv || '123',
    amount: numVal,
    installments: tipo === 'credito' ? installments : 1,
    tipo,
    orderId,
    description,
    capture: true,
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Formulário de Checkout E-Commerce */}
      <div className="lg:col-span-7 bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-gradient-to-tr from-[#1367A2]/20 to-[#A63987]/20 text-[#1367A2] dark:text-[#A63987] border border-[#1367A2]/20">
              <ShoppingBag className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Simulador Gateway de Pagamento Web
              </h2>
              <p className="text-xs text-slate-500">
                Ambiente de teste para pagamentos de e-commerce e apps online
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-[#1367A2]/10 text-[#1367A2] dark:text-sky-300 font-bold border border-[#1367A2]/20">
            SANDBOX API
          </span>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Falha no Processamento</p>
              <p className="text-[11px] mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {result && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 text-xs space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <p className="font-extrabold text-sm">Pagamento Aprovado com Sucesso!</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[10px]">
              <div>
                <span className="text-slate-500 block">Autorização:</span>
                <span className="font-bold">{result.authorizationCode}</span>
              </div>
              <div>
                <span className="text-slate-500 block">NSU:</span>
                <span className="font-bold">{result.nsu}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Valor Líquido:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  R$ {result.amountNet.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Webhooks:</span>
                <span className="font-bold">{result.webhooksDispatched} disparado(s)</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Selecionar Cartão Salvo */}
          {savedCards.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Preencher com Cartão Fictício Salvo:
              </label>
              <select
                value={selectedCardId}
                onChange={(e) => handleCardSelect(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:border-[#1367A2]"
              >
                <option value="">Selecione um cartão para autopreencher...</option>
                {savedCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.masked_number} ({c.tipo.toUpperCase()}) - {c.cardholder_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Dados do Cartão */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Número do Cartão (Prefixo {OPTMAPAY_BIN_PREFIX}):
              </label>
              <input
                type="text"
                placeholder="5899 0000 0000 0000"
                value={manualNumber}
                onChange={(e) => setManualNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold tracking-wider text-slate-800 dark:text-white focus:border-[#1367A2]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nome do Titular:
              </label>
              <input
                type="text"
                placeholder="NOME IMPRESSO NO CARTÃO"
                value={cardholderName}
                onChange={(e) => setCardholderName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs uppercase focus:border-[#1367A2]"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Validade:
                </label>
                <input
                  type="text"
                  placeholder="MM/AA"
                  value={validade}
                  onChange={(e) => setValidade(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-center focus:border-[#1367A2]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  CVV:
                </label>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="123"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-center focus:border-[#1367A2]"
                  required
                />
              </div>
            </div>
          </div>

          {/* Dados da Venda */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-100 dark:border-slate-700 pt-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Valor Total (R$):
              </label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Modalidade:
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
              >
                <option value="debito">Débito</option>
                <option value="credito">Crédito</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Parcelamento:
              </label>
              <select
                disabled={tipo === 'debito'}
                value={installments}
                onChange={(e) => setInstallments(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs disabled:opacity-50"
              >
                <option value={1}>1x de R$ {numVal.toFixed(2)} (À vista)</option>
                {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => {
                  const calc = calculateCardFee(numVal, 'credito', n, plan);
                  return (
                    <option key={n} value={n}>
                      {n}x de R$ {calc.installmentAmount.toFixed(2)} ({calc.feePercent}%)
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                ID do Pedido / Referência:
              </label>
              <input
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Estabelecimento Destino:
              </label>
              <select
                value={merchantAccountId}
                onChange={(e) => setMerchantAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
              >
                {allAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type === 'merchant' ? 'Lojista' : 'Cliente'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-[#1367A2] to-[#A63987] hover:opacity-95 disabled:opacity-50 text-white font-extrabold text-xs rounded-2xl transition shadow-lg shadow-[#A63987]/20 flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            <span>{loading ? 'Processando Gateway...' : 'Finalizar Compra & Disparar Webhooks'}</span>
          </button>
        </form>
      </div>

      {/* Visual do Cartão 3D & Payload JSON da API */}
      <div className="lg:col-span-5 space-y-6">
        {/* Preview do Cartão Fictício */}
        <div
          className={`p-6 rounded-3xl shadow-xl text-white relative overflow-hidden flex flex-col justify-between h-52 border border-white/20 ${
            tipo === 'credito'
              ? 'bg-gradient-to-br from-[#0F2847] via-[#1367A2] to-[#A63987]'
              : 'bg-gradient-to-br from-[#082032] via-[#0F4C75] to-[#1B262C]'
          }`}
        >
          <div className="absolute -right-10 -bottom-10 w-44 h-44 bg-white/5 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <img
                src="/optmacard-logo.webp"
                alt="OptmaCard"
                className="h-6 object-contain filter drop-shadow"
                onError={(e: any) => {
                  e.target.src = 'https://wertmoquxdrucdbobuie.supabase.co/storage/v1/object/public/images/optmacard-logo.png';
                }}
              />
              <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-white/10 rounded-full border border-white/20">
                {tipo}
              </span>
            </div>
            <span className="text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
              SANDBOX
            </span>
          </div>

          {/* Chip Dourado */}
          <div className="w-11 h-8 rounded-md bg-gradient-to-tr from-amber-300 via-amber-200 to-amber-100 shadow-md border border-amber-400/40 z-10 flex items-center justify-center">
            <div className="w-7 h-5 border-y border-slate-700/40" />
          </div>

          <div className="space-y-1.5 z-10">
            <p className="font-mono text-lg tracking-widest text-slate-100 font-extrabold drop-shadow">
              {manualNumber || `${OPTMAPAY_BIN_PREFIX} •••• •••• 0000`}
            </p>
            <div className="flex items-center justify-between text-[11px] text-slate-300 uppercase font-mono">
              <span className="truncate max-w-[170px]">
                {cardholderName || 'NOME DO CLIENTE'}
              </span>
              <span>VAL: {validade || '12/29'} • CVV: {cvv || '123'}</span>
            </div>
          </div>
        </div>

        {/* Payload JSON de Exemplo para Desenvolvedor */}
        <div className="bg-slate-900 rounded-3xl p-5 border border-slate-800 text-slate-300 space-y-3 shadow-inner">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-[#1367A2]" />
              <span className="text-xs font-bold text-slate-200">Payload JSON para Testes</span>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(sampleApiPayload, null, 2));
                setCopiedPayload(true);
                setTimeout(() => setCopiedPayload(false), 2000);
              }}
              className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-bold"
            >
              {copiedPayload ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedPayload ? 'Copiado!' : 'Copiar JSON'}</span>
            </button>
          </div>

          <pre className="text-[11px] font-mono bg-slate-950 p-3 rounded-2xl border border-slate-800 overflow-x-auto text-emerald-400">
            {JSON.stringify(sampleApiPayload, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};
