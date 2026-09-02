import React, { useState, useEffect } from 'react';
import {
  CreditCard as CardIcon,
  Wifi,
  BatteryCharging,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Printer,
  Copy,
  Check,
  ShieldCheck,
  Zap,
  ArrowRight,
  ChevronRight,
  Lock,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { SandboxAccount, SandboxCard, SettlementPlanType } from '../types/sandbox';
import {
  calculateCardFee,
  executeCardPayment,
  validateCardBin,
  blockCardByPinAttempts,
  STANDARD_FEE_RATES,
  ONTIME_FEE_RATES,
  D7_FEE_RATES,
  D15_FEE_RATES,
  DUE_DATE_FEE_PERCENT,
  OPTMAPAY_BIN_PREFIX,
  OPTMAPAY_DEBIT_BIN_PREFIX,
} from '../lib/cardService';

interface VirtualPosMachineProps {
  activeAccount: SandboxAccount;
  allAccounts: SandboxAccount[];
  savedCards: SandboxCard[];
  currentPlan: SettlementPlanType;
  onPlanChange: (plan: SettlementPlanType) => void;
  onTransactionSuccess?: () => void;
}

type PosScreen =
  | 'idle_amount'
  | 'select_mode'
  | 'select_installments'
  | 'insert_card'
  | 'enter_pin'
  | 'processing'
  | 'success'
  | 'declined';

export const VirtualPosMachine: React.FC<VirtualPosMachineProps> = ({
  activeAccount,
  currentPlan,
  onPlanChange,
  onTransactionSuccess,
}) => {
  // POS Hardware State
  const [screen, setScreen] = useState<PosScreen>('idle_amount');
  const [amountStr, setAmountStr] = useState<string>('0');
  const [tipo, setTipo] = useState<'debito' | 'credito'>('debito');
  const [installments, setInstallments] = useState<number>(1);
  const [pinInput, setPinInput] = useState<string>('');

  // PIN Attempts & Security State
  const [pinAttempts, setPinAttempts] = useState<number>(0);
  const [pinErrorWarning, setPinErrorWarning] = useState<string | null>(null);

  // Manual Card Inputs (Retidos na tela e no fluxo)
  const [cardNumber, setCardNumber] = useState<string>('');
  const [cardHolderName, setCardHolderName] = useState<string>('');
  const [cardValidade, setCardValidade] = useState<string>('12/29');

  // Transaction Outcome State
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [errorCode, setErrorCode] = useState<string>('');
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  const isOntimePlan = currentPlan === 'ontime' || currentPlan === 'nitro';

  const getStorageKey = (cleanNum: string) => `optmapay_pos_failed_pin_${cleanNum}`;

  // Numeric Keypad Handlers
  const handleNumClick = (digit: string) => {
    if (screen === 'idle_amount') {
      if (amountStr === '0' && digit !== '00') {
        setAmountStr(digit);
      } else if (amountStr !== '0') {
        if (amountStr.length < 9) {
          setAmountStr((prev) => prev + digit);
        }
      }
    } else if (screen === 'enter_pin') {
      if (pinInput.length < 4 && digit !== '00') {
        setPinInput((prev) => prev + digit);
      }
    }
  };

  const handleBackspace = () => {
    if (screen === 'idle_amount') {
      if (amountStr.length <= 1) {
        setAmountStr('0');
      } else {
        setAmountStr((prev) => prev.slice(0, -1));
      }
    } else if (screen === 'enter_pin') {
      setPinInput((prev) => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (screen === 'idle_amount') {
      setAmountStr('0');
    } else if (screen === 'enter_pin') {
      setPinInput('');
    }
  };

  const rawNumericValue = parseFloat(amountStr) / 100;
  const formattedAmount = rawNumericValue.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  // Flow Navigation
  const handleAmountConfirm = () => {
    if (rawNumericValue <= 0) return;
    setScreen('select_mode');
  };

  const handleSelectMode = (selectedTipo: 'debito' | 'credito', isInstallment: boolean = false) => {
    setTipo(selectedTipo);
    if (selectedTipo === 'debito') {
      setInstallments(1);
      setScreen('insert_card');
    } else if (isInstallment) {
      setScreen('select_installments');
    } else {
      setInstallments(1);
      setScreen('insert_card');
    }
  };

  const handleSelectInstallments = (inst: number) => {
    setInstallments(inst);
    setScreen('insert_card');
  };

  const handleCardSubmitted = () => {
    const clean = cardNumber.replace(/\D/g, '');
    if (clean.length < 16) {
      alert('Por favor, informe os 16 dígitos do cartão fictício OptmaCard.');
      return;
    }
    const savedAttempts = parseInt(localStorage.getItem(getStorageKey(clean)) || '0', 10);
    setPinAttempts(savedAttempts);
    setPinErrorWarning(
      savedAttempts > 0 ? `Atenção: ${savedAttempts} tentativa(s) incorreta(s) anterior(es).` : null
    );
    setPinInput('');
    setScreen('enter_pin');
  };

  // Submit Transaction Execution
  const handleExecutePayment = async () => {
    setScreen('processing');
    setLoading(true);
    setErrorMessage('');
    setErrorCode('');
    setPinErrorWarning(null);

    const cleanCardNumber = cardNumber.replace(/\D/g, '');
    const finalHolderName = cardHolderName.trim() || 'CLIENTE FICTÍCIO';
    const finalValidade = cardValidade.trim() || '12/29';
    const finalPin = pinInput;
    const storageKey = getStorageKey(cleanCardNumber);

    try {
      // Validates BIN
      const binCheck = validateCardBin(cleanCardNumber);
      if (!binCheck.isValid) {
        setErrorCode(binCheck.isRealCardBlocked ? 'ERRO 05 (BLOQUEIO)' : 'ERRO 14');
        throw new Error(binCheck.errorMessage || 'Cartão inválido.');
      }

      // Realistic POS latency
      await new Promise((resolve) => setTimeout(resolve, 800));

      const result = await executeCardPayment({
        merchantAccountId: activeAccount.id,
        cardNumber: cleanCardNumber,
        cardholderName: finalHolderName,
        validade: finalValidade,
        cvv: '123',
        amount: rawNumericValue,
        tipo,
        installments,
        plan: currentPlan,
        description: `Venda Maquininha Smart POS OptmaPay`,
        orderId: `POS-${Date.now().toString().slice(-6)}`,
        pin: finalPin,
      });

      // SUCESSO: Limpa tentativas de senha no localStorage
      localStorage.removeItem(storageKey);
      setPinAttempts(0);
      setPinErrorWarning(null);

      setLastReceipt(result);
      setScreen('success');
      if (onTransactionSuccess) onTransactionSuccess();
    } catch (err: any) {
      const msg = err.message || '';

      // Tratamento de Senha Incorreta com 3 Tentativas
      if (msg.includes('Senha do cartão incorreta') || msg.includes('ERRO 55')) {
        const currentStored = parseInt(localStorage.getItem(storageKey) || '0', 10);
        const newAttempts = currentStored + 1;
        localStorage.setItem(storageKey, String(newAttempts));
        setPinAttempts(newAttempts);

        if (newAttempts >= 3) {
          // Bloqueia o cartão no banco
          await blockCardByPinAttempts(cleanCardNumber);
          localStorage.removeItem(storageKey);
          setErrorCode('ERRO 62 (BLOQUEIO)');
          setErrorMessage('Cartão bloqueado por segurança após 3 tentativas de senha incorreta.');
          setScreen('declined');
        } else {
          // Permanece na tela de digitação de PIN (não volta para dados do cartão)
          setPinInput('');
          setPinErrorWarning(`Senha incorreta! Tentativa ${newAttempts} de 3.`);
          setScreen('enter_pin');
        }
      } else {
        setErrorMessage(msg || 'Transação recusada pela adquirente.');
        setScreen('declined');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPos = () => {
    setScreen('idle_amount');
    setAmountStr('0');
    setPinInput('');
    setErrorMessage('');
    setErrorCode('');
    setPinErrorWarning(null);
  };

  const getPlanName = () => {
    if (currentPlan === 'ontime' || currentPlan === 'nitro') return '⚡ OnTime (Na hora)';
    if (currentPlan === 'd7') return 'D+7 Útil (-3% desc)';
    if (currentPlan === 'd15') return 'D+15 Útil (-5% desc)';
    if (currentPlan === 'due_date') return 'No Vencimento (-10% desc)';
    return 'D+1 Padrão';
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start justify-center">
      {/* ========================================================================= */}
      {/* CORPO DA MAQUININHA SMART POS (MOCKUP ULTRA REALISTA MOBILE-FIRST) */}
      {/* ========================================================================= */}
      <div className="w-full max-w-sm mx-auto bg-slate-900 rounded-[40px] p-5 shadow-2xl border-4 border-slate-700 relative flex flex-col items-center">
        {/* Top Bezel & Chip Card Reader Slot */}
        <div className="w-28 h-1.5 bg-slate-800 rounded-full mb-3 shadow-inner" />

        {/* Header LEDs & Brand */}
        <div className="w-full flex items-center justify-between px-2 mb-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <div className="flex items-center gap-1">
              <img
                src="/optmacard-logo.webp"
                alt="OptmaCard"
                className="h-3.5 object-contain"
                onError={(e: any) => {
                  e.target.src = 'https://wertmoquxdrucdbobuie.supabase.co/storage/v1/object/public/images/optmacard-logo.png';
                }}
              />
              <span className="text-[10px] font-extrabold text-[#A63987] tracking-wider">POS</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-[10px]">
            <span
              className={`px-2 py-0.5 rounded-full font-bold text-[9px] flex items-center gap-1 ${
                isOntimePlan
                  ? 'bg-gradient-to-r from-[#1367A2] to-[#A63987] text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {isOntimePlan ? <><Zap className="w-2.5 h-2.5 fill-current" /> ONTIME</> : getPlanName().toUpperCase()}
            </span>
            <Wifi className="w-3 h-3 text-emerald-400" />
            <BatteryCharging className="w-3 h-3 text-emerald-400" />
          </div>
        </div>

        {/* TELA DIGITAL SMART TOUCH */}
        <div className="w-full bg-slate-950 rounded-2xl p-4 border border-slate-800 min-h-[340px] flex flex-col justify-between shadow-inner text-white relative overflow-hidden">
          {/* Ambient Glow */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#1367A2]/15 rounded-full blur-2xl pointer-events-none" />

          {/* =================== SCREEN: DIGITAR VALOR =================== */}
          {screen === 'idle_amount' && (
            <div className="flex flex-col h-full justify-between space-y-4">
              <div className="text-center pt-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">
                  {activeAccount.name}
                </span>
                <h3 className="text-xs text-slate-300 font-medium">Informe o Valor da Venda</h3>
              </div>

              <div className="text-center py-4 bg-slate-900/90 rounded-xl border border-slate-800/80">
                <span className="text-2xl sm:text-3xl font-mono font-extrabold tracking-tight text-emerald-400">
                  {formattedAmount}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                  <span>Plano de Taxas:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const plans: SettlementPlanType[] = ['standard', 'd7', 'd15', 'due_date', 'ontime'];
                      const next = plans[(plans.indexOf(currentPlan) + 1) % plans.length];
                      onPlanChange(next);
                    }}
                    className="text-[#A63987] hover:underline font-bold flex items-center gap-1"
                  >
                    {getPlanName()} [Trocar]
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAmountConfirm}
                  disabled={rawNumericValue <= 0}
                  className="w-full py-3 bg-gradient-to-r from-[#1367A2] to-[#A63987] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-[#A63987]/20"
                >
                  <span>Continuar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* =================== SCREEN: SELECIONAR MODALIDADE =================== */}
          {screen === 'select_mode' && (
            <div className="flex flex-col h-full justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                  <span className="text-[10px] text-slate-400">Total:</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">{formattedAmount}</span>
                </div>
                <h3 className="text-xs font-bold text-slate-200 mb-1">Selecione a Modalidade:</h3>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleSelectMode('debito')}
                  className="w-full p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-[#1367A2] rounded-xl flex items-center justify-between text-left transition group"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-[#1367A2]/20 text-[#1367A2] dark:text-sky-400 flex items-center justify-center font-bold text-[10px]">
                      1
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-100 group-hover:text-sky-300">1. Débito</p>
                      <p className="text-[9px] text-slate-400">
                        Taxa: {calculateCardFee(100, 'debito', 1, currentPlan).feePercent}%
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-[#1367A2]" />
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectMode('credito', false)}
                  className="w-full p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-[#A63987] rounded-xl flex items-center justify-between text-left transition group"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-[#A63987]/20 text-[#A63987] flex items-center justify-center font-bold text-[10px]">
                      2
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-100 group-hover:text-[#A63987]">2. Crédito à Vista</p>
                      <p className="text-[9px] text-slate-400">
                        Taxa: {calculateCardFee(100, 'credito', 1, currentPlan).feePercent}%
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-[#A63987]" />
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectMode('credito', true)}
                  className="w-full p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-[#1367A2] rounded-xl flex items-center justify-between text-left transition group"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-r from-[#1367A2] to-[#A63987] text-white flex items-center justify-center font-bold text-[10px]">
                      3
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-100 group-hover:text-white">3. Crédito Parcelado</p>
                      <p className="text-[9px] text-slate-400">2x até 12x (Calculado na tela)</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setScreen('idle_amount')}
                className="text-[10px] text-slate-400 hover:text-slate-200 text-center w-full py-1"
              >
                ← Voltar
              </button>
            </div>
          )}

          {/* =================== SCREEN: SELECIONAR PARCELAS (2x a 12x) =================== */}
          {screen === 'select_installments' && (
            <div className="flex flex-col h-full justify-between space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                <span className="text-[10px] text-slate-400">
                  Parcelamento ({getPlanName().toUpperCase()}):
                </span>
                <span className="text-xs font-mono font-bold text-emerald-400">{formattedAmount}</span>
              </div>

              <div className="overflow-y-auto max-h-44 pr-1 space-y-1.5">
                {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((inst) => {
                  const calc = calculateCardFee(rawNumericValue, 'credito', inst, currentPlan);
                  return (
                    <button
                      key={inst}
                      type="button"
                      onClick={() => handleSelectInstallments(inst)}
                      className="w-full p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-[#A63987] rounded-lg flex items-center justify-between text-left transition text-[10px]"
                    >
                      <div>
                        <span className="font-bold text-slate-100">{inst}x de </span>
                        <span className="font-mono text-[#A63987] font-bold">
                          R$ {calc.installmentAmount.toFixed(2)}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-400">
                        Taxa: {calc.feePercent}% (-R$ {calc.feeAmount.toFixed(2)})
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setScreen('select_mode')}
                className="text-[10px] text-slate-400 hover:text-slate-200 text-center w-full py-1"
              >
                ← Voltar
              </button>
            </div>
          )}

          {/* =================== SCREEN: INSERIR CARTÃO (100% MANUAL) =================== */}
          {screen === 'insert_card' && (
            <div className="flex flex-col h-full justify-between space-y-2">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">
                    {tipo.toUpperCase()} {installments > 1 ? `${installments}x` : 'À VISTA'}
                  </span>
                  <span className="text-sm font-mono font-bold text-emerald-400">{formattedAmount}</span>
                </div>
                <h3 className="text-xs font-bold text-slate-200">Insira os Dados do Cartão:</h3>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-[9px] text-slate-400 mb-0.5">
                    Número do Cartão (Prefixo {OPTMAPAY_BIN_PREFIX} ou {OPTMAPAY_DEBIT_BIN_PREFIX}):
                  </label>
                  <input
                    type="text"
                    maxLength={19}
                    placeholder="5899 0000 0000 0000"
                    value={cardNumber}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 16);
                      setCardNumber(v.replace(/(\d{4})/g, '$1 ').trim());
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-[#1367A2]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] text-slate-400 mb-0.5">Nome no Cartão:</label>
                    <input
                      type="text"
                      placeholder="CLIENTE FICTÍCIO"
                      value={cardHolderName}
                      onChange={(e) => setCardHolderName(e.target.value.toUpperCase())}
                      className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-[10px] text-slate-200 uppercase font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-400 mb-0.5">Validade:</label>
                    <input
                      type="text"
                      maxLength={5}
                      placeholder="MM/AA"
                      value={cardValidade}
                      onChange={(e) => setCardValidade(e.target.value)}
                      className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-[10px] font-mono text-slate-200"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <button
                  type="button"
                  onClick={handleCardSubmitted}
                  className="w-full py-2.5 bg-gradient-to-r from-[#1367A2] to-[#A63987] hover:opacity-90 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1 shadow-md shadow-[#A63987]/20"
                >
                  <CardIcon className="w-3.5 h-3.5" />
                  <span>Continuar para Senha (PIN)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('select_mode')}
                  className="text-[10px] text-slate-400 hover:text-slate-200 text-center w-full py-0.5"
                >
                  ← Voltar
                </button>
              </div>
            </div>
          )}

          {/* =================== SCREEN: DIGITAR SENHA (PIN 4 DÍGITOS COM SEGURANÇA DE 3 ERROS) =================== */}
          {screen === 'enter_pin' && (
            <div className="flex flex-col h-full justify-between space-y-3">
              <div className="text-center pt-1">
                <Lock className="w-5 h-5 text-[#1367A2] mx-auto mb-1 animate-bounce" />
                <h3 className="text-xs font-bold text-slate-200">Digite a Senha do Cartão</h3>
                <p className="text-[10px] text-slate-400">Utilize o teclado da maquininha abaixo (4 dígitos)</p>

                {/* Alerta de erro de senha e tentativas restantes */}
                {pinErrorWarning && (
                  <div className="mt-2 p-1.5 bg-red-950/80 border border-red-500/50 rounded-lg text-[10px] text-red-300 font-bold flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                    <span>{pinErrorWarning}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-3 py-3 bg-slate-900 rounded-xl border border-slate-800">
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    className={`w-4 h-4 rounded-full border-2 transition-all ${
                      pinInput.length > index
                        ? 'bg-emerald-400 border-emerald-400 scale-110 shadow-sm shadow-emerald-400/50'
                        : 'border-slate-600 bg-slate-800'
                    }`}
                  />
                ))}
              </div>

              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={handleExecutePayment}
                  disabled={pinInput.length === 0}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
                >
                  <span>Confirmar Senha (VERDE)</span>
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('insert_card')}
                  className="text-[10px] text-slate-400 hover:text-slate-200 text-center w-full py-0.5"
                >
                  ← Corrigir Dados do Cartão
                </button>
              </div>
            </div>
          )}

          {/* =================== SCREEN: PROCESSANDO TRANSAÇÃO =================== */}
          {screen === 'processing' && (
            <div className="flex flex-col items-center justify-center h-full space-y-3 text-center py-8">
              <div className="w-12 h-12 border-4 border-[#1367A2] border-t-transparent rounded-full animate-spin" />
              <div>
                <h4 className="text-xs font-bold text-slate-100">Processando Transação...</h4>
                <p className="text-[10px] text-slate-400">Conectando à Adquirente OptmaPay</p>
              </div>
              <span className="text-[9px] font-mono text-sky-400/80 uppercase">Criptografia RSA-2048 Sandbox</span>
            </div>
          )}

          {/* =================== SCREEN: TRANSAÇÃO APROVADA =================== */}
          {screen === 'success' && lastReceipt && (
            <div className="flex flex-col h-full justify-between space-y-2 text-center pt-2">
              <div className="space-y-1">
                <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-1">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-xs font-extrabold text-emerald-400 tracking-wide">
                  TRANSAÇÃO APROVADA
                </h4>
                <p className="text-[10px] text-slate-300 font-mono">
                  AUT: {lastReceipt.authorizationCode} • NSU: {lastReceipt.nsu}
                </p>
              </div>

              <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 text-[10px] space-y-1 text-left">
                <div className="flex justify-between">
                  <span className="text-slate-400">Valor Bruto:</span>
                  <span className="font-mono font-bold text-slate-100">
                    R$ {lastReceipt.amountGross.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Taxa ({lastReceipt.feePercent}%):</span>
                  <span className="font-mono text-red-400">-R$ {lastReceipt.feeAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-1 font-bold">
                  <span className="text-sky-400">Valor Líquido:</span>
                  <span className="font-mono text-emerald-400">R$ {lastReceipt.amountNet.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-1 text-[9px] pt-1 border-t border-slate-800/80">
                  {isOntimePlan ? (
                    <span className="text-amber-300 font-bold flex items-center gap-1">
                      <Zap className="w-3 h-3 fill-current" /> Disponível Imediatamente (⚡ OnTime)
                    </span>
                  ) : (
                    <span className="text-sky-300 font-bold flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {getPlanName()}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={handleResetPos}
                  className="w-full py-2 bg-gradient-to-r from-[#1367A2] to-[#A63987] hover:opacity-90 text-white font-extrabold text-xs rounded-xl transition shadow-md shadow-[#A63987]/20"
                >
                  Nova Venda
                </button>
              </div>
            </div>
          )}

          {/* =================== SCREEN: TRANSAÇÃO RECUSADA =================== */}
          {screen === 'declined' && (
            <div className="flex flex-col h-full justify-between space-y-3 text-center pt-2">
              <div className="space-y-2">
                <div className="w-10 h-10 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto">
                  <XCircle className="w-6 h-6" />
                </div>
                <h4 className="text-xs font-extrabold text-red-400 tracking-wide">
                  NÃO AUTORIZADA
                </h4>
                {errorCode && (
                  <span className="inline-block px-2 py-0.5 bg-red-950 text-red-300 font-mono text-[9px] rounded border border-red-800">
                    {errorCode}
                  </span>
                )}
                <p className="text-[10px] text-slate-300 bg-slate-900 p-2 rounded-lg border border-slate-800">
                  {errorMessage}
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetPos}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1 border border-slate-700"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reiniciar Terminal</span>
              </button>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* TECLADO FÍSICO / NUMÉRICO CAPACITIVO DA MAQUININHA */}
        {/* ========================================================================= */}
        <div className="w-full mt-4 space-y-2">
          {/* Grade Numérica 1 a 9 */}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleNumClick(digit)}
                className="h-10 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-mono font-bold text-sm rounded-xl shadow-md border border-slate-700/60 transition flex items-center justify-center"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleNumClick('00')}
              className="h-10 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-mono font-bold text-xs rounded-xl shadow-md border border-slate-700/60 transition flex items-center justify-center"
            >
              00
            </button>
            <button
              type="button"
              onClick={() => handleNumClick('0')}
              className="h-10 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-mono font-bold text-sm rounded-xl shadow-md border border-slate-700/60 transition flex items-center justify-center"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-10 bg-slate-800 hover:bg-slate-700 active:scale-95 text-amber-400 font-bold text-xs rounded-xl shadow-md border border-slate-700/60 transition flex items-center justify-center"
            >
              ←
            </button>
          </div>

          {/* Botões de Ação da Maquininha: VERMELHO (ANULA), AMARELO (LIMPA), VERDE (ENTRA) */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              type="button"
              onClick={handleResetPos}
              className="h-11 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-extrabold text-[10px] rounded-xl shadow-lg shadow-red-900/40 border border-red-500 uppercase tracking-wider flex items-center justify-center"
            >
              Anula
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="h-11 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-extrabold text-[10px] rounded-xl shadow-lg shadow-amber-900/40 border border-amber-400 uppercase tracking-wider flex items-center justify-center"
            >
              Limpa
            </button>
            <button
              type="button"
              onClick={() => {
                if (screen === 'idle_amount') handleAmountConfirm();
                else if (screen === 'insert_card') handleCardSubmitted();
                else if (screen === 'enter_pin') handleExecutePayment();
              }}
              className="h-11 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-[10px] rounded-xl shadow-lg shadow-emerald-900/40 border border-emerald-400 uppercase tracking-wider flex items-center justify-center"
            >
              Entra
            </button>
          </div>
        </div>

        {/* Bottom Card Insertion Slot */}
        <div className="w-40 h-2 bg-slate-800 rounded-full mt-4 border-t border-slate-700" />
      </div>

      {/* ========================================================================= */}
      {/* PAINEL LATERAL INFORMATIVO & SIMULADOR DE COMPROVANTE */}
      {/* ========================================================================= */}
      <div className="w-full lg:flex-1 space-y-4">
        {/* Banner Informativo de Regra de Negócio */}
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#1367A2]" />
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
              Regras do Terminal POS OptmaPay
            </h3>
          </div>
          <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc pl-4">
            <li>
              <strong className="text-slate-900 dark:text-white">Segurança PIN (3 Tentativas):</strong> Se errar a senha 3 vezes consecutivas, o cartão é bloqueado automaticamente no banco.
            </li>
            <li>
              <strong className="text-slate-900 dark:text-white">Entrada Manual & Validação BIN:</strong> Aceita apenas cartões com prefixo <code className="px-1.5 py-0.5 bg-[#1367A2]/10 text-[#1367A2] dark:text-sky-300 rounded font-mono font-bold">{OPTMAPAY_BIN_PREFIX}</code> ou <code className="px-1.5 py-0.5 bg-[#A63987]/10 text-[#A63987] rounded font-mono font-bold">{OPTMAPAY_DEBIT_BIN_PREFIX}</code>.
            </li>
            <li>
              <strong className="text-slate-900 dark:text-white">Plano Ativo:</strong>
              <span className="text-[#1367A2] dark:text-sky-400 font-bold ml-1">{getPlanName()}</span>.
            </li>
          </ul>
        </div>

        {/* COMPROVANTE TÉRMICO DE VENDA */}
        {lastReceipt && (
          <div className="bg-[#FFFDF5] text-slate-900 rounded-3xl p-6 shadow-xl border border-amber-200 font-mono text-xs space-y-4 max-w-md mx-auto">
            <div className="text-center border-b-2 border-dashed border-slate-300 pb-3 space-y-0.5">
              <p className="font-extrabold text-sm tracking-wider">OPTMAPAY SANDBOX POS</p>
              <p className="text-[10px] text-slate-600">REDE ADQUIRENTE DE TESTES</p>
              <p className="text-[10px] text-slate-500">ESTAB: {lastReceipt.merchantName}</p>
              <p className="text-[10px] text-slate-500">CNPJ: 00.000.000/0001-99</p>
            </div>

            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>DATA/HORA:</span>
                <span>{new Date(lastReceipt.createdAt).toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between">
                <span>MODALIDADE:</span>
                <span className="font-bold uppercase">
                  {lastReceipt.tipo} {lastReceipt.installments > 1 ? `(${lastReceipt.installments}X)` : 'À VISTA'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>PLANO MDR:</span>
                <span className="font-bold uppercase text-[#1367A2]">
                  {getPlanName()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>CARTÃO:</span>
                <span>{lastReceipt.cardMasked}</span>
              </div>
              <div className="flex justify-between">
                <span>AUTORIZAÇÃO:</span>
                <span className="font-bold">{lastReceipt.authorizationCode}</span>
              </div>
              <div className="flex justify-between">
                <span>DOC/NSU:</span>
                <span>{lastReceipt.nsu}</span>
              </div>
            </div>

            <div className="border-t-2 border-b-2 border-dashed border-slate-300 py-2 space-y-1 font-bold">
              <div className="flex justify-between text-sm">
                <span>VALOR TOTAL:</span>
                <span>R$ {lastReceipt.amountGross.toFixed(2)}</span>
              </div>
              {lastReceipt.installments > 1 && (
                <div className="flex justify-between text-[11px] font-normal text-slate-600">
                  <span>{lastReceipt.installments}x de:</span>
                  <span>R$ {(lastReceipt.amountGross / lastReceipt.installments).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-[10px] text-slate-500 font-normal">
                <span>TAXA MDR ({lastReceipt.feePercent}%):</span>
                <span>-R$ {lastReceipt.feeAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-[#1367A2]">
                <span>VALOR LÍQUIDO:</span>
                <span>R$ {lastReceipt.amountNet.toFixed(2)}</span>
              </div>
            </div>

            <div className="text-center text-[9px] text-slate-500 space-y-0.5">
              <p>*** TRANSAÇÃO FICTÍCIA - AMBIENTE SANDBOX ***</p>
              <p>SEM VALOR COMERCIAL OU FISCAL</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const receiptText = `*** COMPROVANTE OPTMAPAY POS ***\nEstab: ${lastReceipt.merchantName}\nData: ${new Date(lastReceipt.createdAt).toLocaleString('pt-BR')}\nModalidade: ${lastReceipt.tipo.toUpperCase()} ${lastReceipt.installments}x\nCartão: ${lastReceipt.cardMasked}\nAutorização: ${lastReceipt.authorizationCode}\nNSU: ${lastReceipt.nsu}\nValor: R$ ${lastReceipt.amountGross.toFixed(2)}\nLíquido: R$ ${lastReceipt.amountNet.toFixed(2)}\n*** SANDBOX SEM VALOR FISCAL ***`;
                  navigator.clipboard.writeText(receiptText);
                  setCopiedReceipt(true);
                  setTimeout(() => setCopiedReceipt(false), 2000);
                }}
                className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                {copiedReceipt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedReceipt ? 'Copiado!' : 'Copiar Comprovante'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
