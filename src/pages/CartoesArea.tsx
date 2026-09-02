import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { SandboxCard, SandboxTransaction, SettlementPlanType } from '../types/sandbox';
import {
  CreditCard as CardIcon,
  Plus,
  ShoppingBag,
  Percent,
  History,
  ShieldCheck,
  Copy,
  Check,
  Lock,
  Unlock,
  Trash2,
  Sparkles,
  Smartphone,
  Eye,
  EyeOff,
  Zap,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  KeyRound,
  FileText,
  Clock,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { VirtualPosMachine } from '../components/VirtualPosMachine';
import { CardRatesModal } from '../components/CardRatesModal';
import { CardEcommerceSimulator } from '../components/CardEcommerceSimulator';
import { CardInvoiceManager } from '../components/CardInvoiceManager';
import {
  generateOptmaCardNumber,
  OPTMAPAY_BIN_PREFIX,
  OPTMAPAY_DEBIT_BIN_PREFIX,
  releaseD1Settlement,
} from '../lib/cardService';

export const CartoesArea: React.FC = () => {
  const { activeAccount, accounts, refreshAccounts } = useAuth();
  const [activeTab, setActiveTab] = useState<'wallet' | 'invoices' | 'pos' | 'rates' | 'ecommerce' | 'statement'>('wallet');
  const [cards, setCards] = useState<SandboxCard[]>([]);
  const [cardTransactions, setCardTransactions] = useState<SandboxTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [releasingTxId, setReleasingTxId] = useState<string | null>(null);
  
  // Persistent Plan State (D+1 vs OnTime)
  const [currentPlan, setCurrentPlan] = useState<SettlementPlanType>('standard');

  // Modal / Creator State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCardTipo, setNewCardTipo] = useState<'debito' | 'credito'>('credito');
  const [newCardHolder, setNewCardHolder] = useState('');
  const [newCardLimit, setNewCardLimit] = useState('5000.00');
  const [newCardPin, setNewCardPin] = useState('1234');
  const [newCardDueDay, setNewCardDueDay] = useState(10);
  const [creatingCard, setCreatingCard] = useState(false);

  // PIN Config Modal State
  const [pinModalCard, setPinModalCard] = useState<SandboxCard | null>(null);
  const [editingPin, setEditingPin] = useState('1234');
  const [savingPin, setSavingPin] = useState(false);

  // Card details visibility & copy states
  const [visibleCvvCardId, setVisibleCvvCardId] = useState<string | null>(null);
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  // Transaction filter
  const [statementFilter, setStatementFilter] = useState<'all' | 'in' | 'out'>('all');

  // Sync plan from activeAccount config
  useEffect(() => {
    if (activeAccount?.config?.settlement_plan) {
      setCurrentPlan(activeAccount.config.settlement_plan as SettlementPlanType);
    }
  }, [activeAccount]);

  const handlePlanChange = async (newPlan: SettlementPlanType) => {
    setCurrentPlan(newPlan);
    if (!activeAccount) return;
    try {
      const updatedConfig = {
        ...(activeAccount.config || {}),
        settlement_plan: newPlan,
      };
      await supabase
        .from('accounts')
        .update({ config: updatedConfig })
        .eq('id', activeAccount.id);

      await refreshAccounts();
    } catch (e) {
      console.warn('Erro ao salvar plano na conta:', e);
    }
  };

  const fetchCards = async () => {
    if (!activeAccount) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('cartoes')
      .select('*')
      .eq('account_id', activeAccount.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setCards(data as SandboxCard[]);
    }
    setLoading(false);
  };

  const fetchCardTransactions = async () => {
    if (!activeAccount) return;
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('account_id', activeAccount.id)
      .eq('type', 'card_payment')
      .order('created_at', { ascending: false });

    setCardTransactions((data || []) as SandboxTransaction[]);
  };

  useEffect(() => {
    fetchCards();
    fetchCardTransactions();
  }, [activeAccount]);

  // Handle release of pending D+1 settlement
  const handleReleaseD1 = async (txId: string) => {
    if (!activeAccount) return;
    setReleasingTxId(txId);
    try {
      await releaseD1Settlement(txId, activeAccount.id);
      await fetchCardTransactions();
      await refreshAccounts();
      setCopyToast('⚡ Lançamento D+1 liquidado e creditado no saldo disponível!');
      setTimeout(() => setCopyToast(null), 3000);
    } catch (err: any) {
      alert(`Erro ao liquidar: ${err.message}`);
    } finally {
      setReleasingTxId(null);
    }
  };

  const handleCreateNewCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;
    setCreatingCard(true);

    try {
      const generated = generateOptmaCardNumber(newCardTipo);
      const holder = newCardHolder.trim().toUpperCase() || activeAccount.name.toUpperCase();
      const limit = newCardTipo === 'credito' ? (parseFloat(newCardLimit) || 5000.0) : 0.0;
      const cleanPin = newCardPin.replace(/\D/g, '').slice(0, 4) || generated.pin;

      const { error } = await supabase.from('cartoes').insert({
        user_id: activeAccount.user_id || null,
        account_id: activeAccount.id,
        tipo: newCardTipo,
        cardholder_name: holder,
        card_number: generated.cardNumber,
        masked_number: generated.maskedNumber,
        brand: 'OptmaCard',
        pin: cleanPin,
        validade: generated.validade,
        cvv: generated.cvv,
        credit_limit: limit,
        current_balance: 0.0,
        due_day: newCardTipo === 'credito' ? newCardDueDay : null,
        auto_debit: false,
        status: 'active',
        is_virtual: true,
      });

      if (error) throw error;

      await fetchCards();
      setShowCreateModal(false);
      setNewCardHolder('');
      setNewCardLimit('5000.00');
      setNewCardPin('1234');
    } catch (err: any) {
      alert(`Erro ao criar cartão: ${err.message}`);
    } finally {
      setCreatingCard(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinModalCard) return;
    setSavingPin(true);

    const clean = editingPin.replace(/\D/g, '').slice(0, 4);
    if (clean.length < 4) {
      alert('A senha/PIN deve conter 4 dígitos numéricos.');
      setSavingPin(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('cartoes')
        .update({ pin: clean })
        .eq('id', pinModalCard.id);

      if (error) throw error;

      await fetchCards();
      setPinModalCard(null);
      setCopyToast('✅ Senha / PIN atualizada com sucesso!');
      setTimeout(() => setCopyToast(null), 3000);
    } catch (err: any) {
      alert(`Erro ao salvar PIN: ${err.message}`);
    } finally {
      setSavingPin(false);
    }
  };

  const handleToggleCardStatus = async (card: SandboxCard) => {
    const newStatus = card.status === 'active' ? 'blocked' : 'active';
    const { error } = await supabase
      .from('cartoes')
      .update({ status: newStatus })
      .eq('id', card.id);

    if (!error) {
      fetchCards();
    }
  };

  // Robust clipboard copy with fallback
  const handleCopyCard = async (card: SandboxCard) => {
    let textToCopy = card.card_number;
    if (!textToCopy || textToCopy.trim() === '') {
      const cleanDigits = card.masked_number.replace(/\D/g, '');
      const last4 = cleanDigits.slice(-4) || '1234';
      const prefix = card.tipo === 'debito' ? OPTMAPAY_DEBIT_BIN_PREFIX : OPTMAPAY_BIN_PREFIX;
      textToCopy = `${prefix}00000000${last4}`;
    }

    let success = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
        success = true;
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        textArea.remove();
      }
    } catch (e) {
      window.prompt('Copie o número do cartão:', textToCopy);
      success = true;
    }

    if (success) {
      setCopiedCardId(card.id);
      setCopyToast(`📋 Cartão copiado: ${textToCopy}`);
      setTimeout(() => {
        setCopiedCardId(null);
        setCopyToast(null);
      }, 2500);
    }
  };

  // Pending D+1 settlements
  const pendingD1Transactions = cardTransactions.filter(
    (tx) => tx.direction === 'in' && tx.status === 'pending'
  );
  const totalPendingD1 = pendingD1Transactions.reduce((acc, tx) => acc + Number(tx.amount), 0);

  if (!activeAccount) return null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Toast Notification */}
      {copyToast && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-[#1367A2] flex items-center gap-2 text-xs font-bold animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{copyToast}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <img
              src="/optmacard-logo.webp"
              alt="OptmaCard"
              className="h-6 object-contain"
              onError={(e: any) => {
                e.target.src = 'https://wertmoquxdrucdbobuie.supabase.co/storage/v1/object/public/images/optmacard-logo.png';
              }}
            />
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              Área de Cartões & Maquininha Virtual
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cartões fictícios OptmaCard (BIN {OPTMAPAY_BIN_PREFIX}), terminal Smart POS, Faturas e Liquidações (D+1 vs ⚡ OnTime)
          </p>
        </div>

        <button
          onClick={() => {
            setNewCardHolder(activeAccount.name.toUpperCase());
            setShowCreateModal(true);
          }}
          className="py-2.5 px-4 bg-gradient-to-r from-[#1367A2] to-[#A63987] hover:opacity-95 text-white font-bold text-xs rounded-2xl transition flex items-center gap-1.5 shadow-lg shadow-[#A63987]/20"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Cartão Fictício</span>
        </button>
      </div>

      {/* Navegação por Abas (Tabs) */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto gap-2 pb-px">
        {[
          { id: 'wallet', label: '💳 Carteira de Cartões', count: cards.length },
          { id: 'invoices', label: '📑 Faturas & Limites' },
          { id: 'pos', label: '📟 Maquininha Smart POS' },
          { id: 'rates', label: '⚡ Taxas & Planos (MDR)' },
          { id: 'ecommerce', label: '🛒 Gateway E-Commerce' },
          { id: 'statement', label: '📊 Extrato de Vendas', count: cardTransactions.length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`py-2.5 px-4 text-xs font-bold whitespace-nowrap border-b-2 transition flex items-center gap-2 ${
              activeTab === tab.id
                ? 'border-[#A63987] text-[#A63987] dark:text-[#A63987] bg-purple-50/50 dark:bg-purple-950/20 rounded-t-2xl'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: CARTEIRA DE CARTÕES FICTÍCIOS */}
      {/* ========================================================================= */}
      {activeTab === 'wallet' && (
        <div className="space-y-6">
          {/* Banner de Segurança & Regra BIN */}
          <div className="p-4 rounded-3xl bg-gradient-to-r from-[#1367A2]/10 via-[#A63987]/10 to-transparent border border-[#1367A2]/20 flex items-start gap-3 text-xs text-slate-800 dark:text-slate-200">
            <ShieldCheck className="w-5 h-5 text-[#1367A2] dark:text-[#A63987] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Prefixo BIN Exclusivo OptmaPay Sandbox</p>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
                Todos os cartões virtuais gerados utilizam os prefixos oficiais{' '}
                <strong className="font-mono text-[#1367A2] dark:text-sky-400">{OPTMAPAY_BIN_PREFIX}</strong> (Crédito) e{' '}
                <strong className="font-mono text-[#A63987] dark:text-purple-300">{OPTMAPAY_DEBIT_BIN_PREFIX}</strong> (Débito). Cartões de bancos reais
                são automaticamente bloqueados pelo gateway para garantir o isolamento do sandbox.
              </p>
            </div>
          </div>

          {/* Grid de Cartões */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cards.length === 0 ? (
              <div className="col-span-full p-12 text-center text-slate-400 text-xs bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 space-y-3">
                <CardIcon className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="font-bold text-slate-600 dark:text-slate-300">
                  Nenhum cartão virtual cadastrado para esta conta.
                </p>
                <p className="text-[11px] text-slate-400">
                  Crie seu primeiro cartão de Débito ou Crédito fictício para realizar testes de vendas.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="py-2.5 px-5 bg-gradient-to-r from-[#1367A2] to-[#A63987] text-white font-bold text-xs rounded-2xl shadow-md"
                >
                  + Criar Cartão
                </button>
              </div>
            ) : (
              cards.map((card) => {
                const isCredit = card.tipo === 'credito';
                const isBlocked = card.status === 'blocked';
                const isCvvVisible = visibleCvvCardId === card.id;
                const formattedNum = card.card_number
                  ? card.card_number.replace(/(\d{4})/g, '$1 ').trim()
                  : card.masked_number;

                return (
                  <div
                    key={card.id}
                    className={`rounded-3xl p-6 shadow-xl text-white relative overflow-hidden flex flex-col justify-between h-60 border transition-all ${
                      isBlocked
                        ? 'bg-slate-800 border-slate-700 opacity-60 grayscale'
                        : isCredit
                        ? 'bg-gradient-to-br from-[#0F2847] via-[#1367A2] to-[#A63987] border-[#1367A2]/40 shadow-xl shadow-[#A63987]/15'
                        : 'bg-gradient-to-br from-[#082032] via-[#0F4C75] to-[#1B262C] border-sky-600/40 shadow-xl shadow-sky-950/20'
                    }`}
                  >
                    <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />

                    {/* Top Row: Brand & Status */}
                    <div className="flex items-center justify-between z-10">
                      <div className="flex items-center gap-2">
                        <img
                          src="/optmacard-logo.webp"
                          alt="OptmaCard"
                          className="h-5 object-contain filter drop-shadow"
                          onError={(e: any) => {
                            e.target.src = 'https://wertmoquxdrucdbobuie.supabase.co/storage/v1/object/public/images/optmacard-logo.png';
                          }}
                        />
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-white/10 rounded-full border border-white/20">
                          {card.tipo}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isBlocked ? (
                          <span className="px-2 py-0.5 text-[9px] font-bold uppercase bg-red-500/30 text-red-300 border border-red-500/50 rounded-full">
                            BLOQUEADO
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[9px] font-mono uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full font-bold">
                            SANDBOX
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Chip & Action Buttons */}
                    <div className="flex items-center justify-between z-10">
                      <div className="w-10 h-7 rounded-md bg-gradient-to-tr from-amber-300 via-amber-200 to-amber-100 shadow-md border border-amber-400/40 flex items-center justify-center">
                        <div className="w-6 h-4 border-y border-slate-700/40" />
                      </div>

                      <div className="flex items-center gap-1 bg-black/40 backdrop-blur-md p-1 rounded-2xl border border-white/10">
                        <button
                          type="button"
                          onClick={() => handleCopyCard(card)}
                          title="Copiar Número do Cartão"
                          className="p-1.5 hover:bg-white/20 rounded-lg text-slate-300 hover:text-white transition"
                        >
                          {copiedCardId === card.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPinModalCard(card);
                            setEditingPin(card.pin || '1234');
                          }}
                          title="Configurar Senha / PIN"
                          className="p-1.5 hover:bg-white/20 rounded-lg text-amber-300 hover:text-amber-200 transition"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setVisibleCvvCardId(isCvvVisible ? null : card.id)}
                          title={isCvvVisible ? 'Ocultar CVV' : 'Mostrar CVV'}
                          className="p-1.5 hover:bg-white/20 rounded-lg text-slate-300 hover:text-white transition"
                        >
                          {isCvvVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleCardStatus(card)}
                          title={isBlocked ? 'Desbloquear Cartão' : 'Bloquear Cartão'}
                          className={`p-1.5 hover:bg-white/20 rounded-lg transition ${
                            isBlocked ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {isBlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Card Number & Details */}
                    <div className="space-y-1 z-10">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-base tracking-widest text-slate-100 font-extrabold drop-shadow">
                          {formattedNum}
                        </p>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-300 uppercase font-mono">
                        <span className="truncate max-w-[130px]">{card.cardholder_name}</span>
                        <span>
                          VAL: {card.validade} • CVV: {isCvvVisible ? card.cvv : '•••'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[9px] text-purple-200 pt-0.5 border-t border-white/10 font-mono">
                        <span>PIN: {card.pin || '1234'}</span>
                        {isCredit && (
                          <span>Venc: Dia {card.due_day || 10} • Lim: R$ {card.credit_limit.toFixed(0)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: FATURAS & LIMITES (NOVA) */}
      {/* ========================================================================= */}
      {activeTab === 'invoices' && (
        <CardInvoiceManager
          activeAccount={activeAccount}
          cards={cards}
          onInvoicePaid={() => {
            fetchCards();
            fetchCardTransactions();
            refreshAccounts();
          }}
          onCardUpdated={() => {
            fetchCards();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* ABA 3: MAQUININHA SMART POS */}
      {/* ========================================================================= */}
      {activeTab === 'pos' && (
        <VirtualPosMachine
          activeAccount={activeAccount}
          allAccounts={accounts}
          savedCards={cards}
          currentPlan={currentPlan}
          onPlanChange={handlePlanChange}
          onTransactionSuccess={() => {
            fetchCards();
            fetchCardTransactions();
            refreshAccounts();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* ABA 4: TAXAS & PLANOS (D+1 vs ONTIME) */}
      {/* ========================================================================= */}
      {activeTab === 'rates' && (
        <CardRatesModal
          currentPlan={currentPlan}
          onPlanChange={handlePlanChange}
        />
      )}

      {/* ========================================================================= */}
      {/* ABA 5: GATEWAY E-COMMERCE SIMULATOR */}
      {/* ========================================================================= */}
      {activeTab === 'ecommerce' && (
        <CardEcommerceSimulator
          activeAccount={activeAccount}
          allAccounts={accounts}
          savedCards={cards}
          onPaymentSuccess={() => {
            fetchCards();
            fetchCardTransactions();
            refreshAccounts();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* ABA 6: EXTRATO DETALHADO DE VENDAS & COMPRAS COM CARTÃO */}
      {/* ========================================================================= */}
      {activeTab === 'statement' && (
        <div className="space-y-6">
          {/* Card: Lançamentos Futuros a Receber em D+1 (se houver) */}
          {totalPendingD1 > 0 && (
            <div className="p-5 rounded-3xl bg-gradient-to-r from-sky-900/40 via-slate-900 to-sky-950/30 border border-sky-600/30 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-sky-300">
                    Lançamentos Futuros a Receber em D+1:
                  </h3>
                  <p className="text-2xl font-mono font-extrabold text-white">
                    R$ {totalPendingD1.toFixed(2)}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Vendas realizadas no plano D+1 Padrão aguardando liberação no próximo dia útil.
                  </p>
                </div>
              </div>

              <div className="text-xs font-mono text-sky-200/90 bg-sky-950/60 p-3 rounded-2xl border border-sky-800/40">
                Você pode antecipar/liberar cada lançamento individualmente na tabela abaixo.
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <History className="w-5 h-5 text-[#1367A2]" />
                  <span>Extrato de Vendas & Compras com Cartão</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Detalhamento financeiro: Valor Bruto, Taxa MDR e Valor Líquido para vendas
                </p>
              </div>

              {/* Filter Buttons */}
              <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setStatementFilter('all')}
                  className={`px-3 py-1 rounded-xl transition ${
                    statementFilter === 'all'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setStatementFilter('in')}
                  className={`px-3 py-1 rounded-xl transition ${
                    statementFilter === 'in'
                      ? 'bg-[#1367A2] text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Vendas (Entrada)
                </button>
                <button
                  type="button"
                  onClick={() => setStatementFilter('out')}
                  className={`px-3 py-1 rounded-xl transition ${
                    statementFilter === 'out'
                      ? 'bg-[#A63987] text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Compras (Saída)
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-700/80">
              {cardTransactions.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Nenhuma transação de cartão registrada ainda. Realize uma venda na Maquininha ou no Gateway E-Commerce.
                </div>
              ) : (
                cardTransactions
                  .filter((tx) => {
                    if (statementFilter === 'all') return true;
                    return tx.direction === statementFilter;
                  })
                  .map((tx) => {
                    const isIn = tx.direction === 'in';
                    const isPending = tx.status === 'pending';

                    return (
                      <div key={tx.id} className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5 ${
                              isIn
                                ? isPending
                                  ? 'bg-amber-500/10 text-amber-500'
                                  : 'bg-[#1367A2]/10 text-[#1367A2] dark:text-sky-400'
                                : 'bg-[#A63987]/10 text-[#A63987]'
                            }`}
                          >
                            {isIn ? (
                              isPending ? <Clock className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />
                            ) : (
                              <ArrowUpRight className="w-5 h-5" />
                            )}
                          </div>

                          <div className="space-y-1">
                            <p className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm">
                              {tx.description || 'Transação de Cartão OptmaPay'}
                            </p>

                            <p className="text-[10px] text-slate-400 font-mono">
                              {new Date(tx.created_at).toLocaleString('pt-BR')} • Ref: {tx.external_reference || 'N/A'}
                            </p>

                            {/* Tags de status */}
                            <div className="flex items-center gap-2 pt-0.5">
                              {isIn ? (
                                isPending ? (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Lançamento Futuro (D+1)
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Creditado no Saldo
                                  </span>
                                )
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-400">
                                  Débito Nominal do Pagador
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Coluna de Valores & Ação de Liquidação D+1 */}
                        <div className="sm:text-right w-full sm:w-auto flex sm:flex-col justify-between items-end sm:items-end gap-1">
                          <div>
                            <p
                              className={`font-mono font-extrabold text-base ${
                                isIn
                                  ? isPending
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-[#1367A2] dark:text-sky-400'
                                  : 'text-[#A63987] dark:text-purple-400'
                              }`}
                            >
                              {isIn ? '+' : '-'} R$ {Number(tx.amount).toFixed(2)}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {isIn ? (isPending ? 'Líquido a Receber' : 'Líquido Creditado') : 'Valor Total Pago'}
                            </p>
                          </div>

                          {/* Botão de antecipação/liberação para lançamentos D+1 */}
                          {isIn && isPending && (
                            <button
                              type="button"
                              onClick={() => handleReleaseD1(tx.id)}
                              disabled={releasingTxId === tx.id}
                              className="mt-1 py-1.5 px-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:opacity-90 text-white font-bold text-[10px] rounded-xl transition flex items-center gap-1 shadow-sm disabled:opacity-50"
                            >
                              <Zap className="w-3 h-3 fill-current" />
                              <span>{releasingTxId === tx.id ? 'Liberando...' : 'Liberar Saldo D+1'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONFIGURAR / ALTERAR SENHA (PIN 4 DÍGITOS) */}
      {/* ========================================================================= */}
      {pinModalCard && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Configurar Senha (PIN)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPinModalCard(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePin} className="space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
                <p className="text-slate-500">Cartão:</p>
                <p className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {pinModalCard.masked_number} ({pinModalCard.tipo.toUpperCase()})
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nova Senha / PIN (4 dígitos numéricos):
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={editingPin}
                  onChange={(e) => setEditingPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="1234"
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-center text-lg font-mono font-extrabold tracking-widest text-[#1367A2] dark:text-sky-400 focus:border-[#1367A2]"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1 text-center">
                  Esta senha será solicitada ao pagar na Maquininha Smart POS.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPinModalCard(null)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-2xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPin}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#1367A2] to-[#A63987] hover:opacity-95 text-white font-bold text-xs rounded-2xl shadow-md disabled:opacity-50"
                >
                  {savingPin ? 'Salvando...' : 'Salvar PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CRIAR NOVO CARTÃO VIRTUAL */}
      {/* ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <img
                  src="/optmacard-logo.webp"
                  alt="OptmaCard"
                  className="h-5 object-contain"
                  onError={(e: any) => {
                    e.target.src = 'https://wertmoquxdrucdbobuie.supabase.co/storage/v1/object/public/images/optmacard-logo.png';
                  }}
                />
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Emitir Cartão Fictício
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewCard} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Modalidade do Cartão:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCardTipo('credito')}
                    className={`py-2 rounded-2xl text-xs font-bold border transition ${
                      newCardTipo === 'credito'
                        ? 'bg-gradient-to-r from-[#1367A2] to-[#A63987] text-white border-transparent shadow-md shadow-[#A63987]/20'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Crédito (BIN {OPTMAPAY_BIN_PREFIX})
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCardTipo('debito')}
                    className={`py-2 rounded-2xl text-xs font-bold border transition ${
                      newCardTipo === 'debito'
                        ? 'bg-[#1367A2] text-white border-transparent shadow-md shadow-[#1367A2]/20'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Débito (BIN {OPTMAPAY_DEBIT_BIN_PREFIX})
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Titular (Impresso no Cartão):
                </label>
                <input
                  type="text"
                  value={newCardHolder}
                  onChange={(e) => setNewCardHolder(e.target.value)}
                  placeholder={activeAccount.name.toUpperCase()}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs uppercase font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {newCardTipo === 'credito' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Limite de Crédito (R$):
                    </label>
                    <input
                      type="number"
                      step="100"
                      value={newCardLimit}
                      onChange={(e) => setNewCardLimit(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Saldo da Conta:
                    </label>
                    <div className="px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-emerald-600">
                      R$ {activeAccount.balance.toFixed(2)}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Senha / PIN (4 dígitos):
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={newCardPin}
                    onChange={(e) => setNewCardPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="1234"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-center"
                  />
                </div>
              </div>

              {newCardTipo === 'credito' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Dia de Vencimento da Fatura:
                  </label>
                  <select
                    value={newCardDueDay}
                    onChange={(e) => setNewCardDueDay(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                  >
                    {[1, 5, 10, 15, 20, 25].map((day) => (
                      <option key={day} value={day}>
                        Dia {String(day).padStart(2, '0')} (Fecha dia {String(day > 7 ? day - 7 : day + 23).padStart(2, '0')})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="p-3 bg-purple-50 dark:bg-purple-950/40 rounded-2xl border border-purple-200 dark:border-purple-900 text-[11px] text-purple-900 dark:text-purple-300">
                O número de 16 dígitos e CVV serão gerados automaticamente no padrão OptmaCard Sandbox.
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-2xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingCard}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#1367A2] to-[#A63987] hover:opacity-95 text-white font-bold text-xs rounded-2xl shadow-md disabled:opacity-50"
                >
                  {creatingCard ? 'Emitindo...' : 'Emitir Cartão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
