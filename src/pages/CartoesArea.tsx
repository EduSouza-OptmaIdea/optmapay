import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { SandboxCard } from '../types/sandbox';
import { triggerWebhookEvents } from '../lib/webhookEngine';
import { CreditCard as CardIcon, Plus, ShoppingBag, ShieldCheck } from 'lucide-react';

export const CartoesArea: React.FC = () => {
  const { activeAccount, accounts, refreshAccounts } = useAuth();
  const [cards, setCards] = useState<SandboxCard[]>([]);
  const [loading, setLoading] = useState(false);

  // Purchase Simulation State
  const [purchaseCardId, setPurchaseCardId] = useState<string>('');
  const [purchaseAmount, setPurchaseAmount] = useState('120.00');
  const [purchaseMerchantId, setPurchaseMerchantId] = useState<string>('');
  const [purchaseDesc, setPurchaseDesc] = useState('Compra E-Commerce (Teste)');
  const [purchaseOrderId, setPurchaseOrderId] = useState('ORDER-8831');
  const [purchasing, setPurchasing] = useState(false);

  const fetchCards = async () => {
    if (!activeAccount) return;
    setLoading(true);
    const { data } = await supabase
      .from('cartoes')
      .select('*')
      .eq('account_id', activeAccount.id);

    setCards((data || []) as SandboxCard[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchCards();
    const defaultMerchant = accounts.find((a) => a.type === 'merchant');
    if (defaultMerchant) setPurchaseMerchantId(defaultMerchant.id);
  }, [activeAccount, accounts]);

  const handleCreateCard = async (tipo: 'debito' | 'credito') => {
    if (!activeAccount) return;

    const num1 = Math.floor(1000 + Math.random() * 9000);
    const num2 = Math.floor(1000 + Math.random() * 9000);

    await supabase.from('cartoes').insert({
      user_id: activeAccount.user_id || null,
      account_id: activeAccount.id,
      tipo,
      cardholder_name: activeAccount.name.toUpperCase(),
      masked_number: `${tipo === 'credito' ? '5412' : '4012'} **** **** ${num2}`,
      validade: '12/29',
      cvv: `${Math.floor(100 + Math.random() * 900)}`,
      credit_limit: tipo === 'credito' ? 5000.00 : 0.00,
      current_balance: 0.00,
      status: 'active',
    });

    await fetchCards();
  };

  const handleSimulatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;
    if (!purchaseCardId) {
      alert('Selecione um cartão para a compra.');
      return;
    }

    const selectedCard = cards.find((c) => c.id === purchaseCardId);
    if (!selectedCard) return;

    const val = parseFloat(purchaseAmount);
    if (isNaN(val) || val <= 0) return;

    // Check balance / credit limit
    if (selectedCard.tipo === 'debito' && activeAccount.balance < val) {
      alert('Saldo insuficiente na conta para compra no débito.');
      return;
    }

    if (selectedCard.tipo === 'credito' && (selectedCard.current_balance + val > selectedCard.credit_limit)) {
      alert('Limite de crédito excedido no cartão virtual.');
      return;
    }

    setPurchasing(true);

    try {
      // Debit customer balance
      await supabase
        .from('accounts')
        .update({ balance: activeAccount.balance - val })
        .eq('id', activeAccount.id);

      // Credit merchant balance
      if (purchaseMerchantId) {
        const merchantAcc = accounts.find((a) => a.id === purchaseMerchantId);
        if (merchantAcc) {
          await supabase
            .from('accounts')
            .update({ balance: merchantAcc.balance + val })
            .eq('id', merchantAcc.id);
        }
      }

      // Update card current_balance
      if (selectedCard.tipo === 'credito') {
        await supabase
          .from('cartoes')
          .update({ current_balance: selectedCard.current_balance + val })
          .eq('id', selectedCard.id);
      }

      // Record transaction
      await supabase.from('transactions').insert({
        user_id: activeAccount.user_id || null,
        account_id: activeAccount.id,
        counterparty_account_id: purchaseMerchantId || null,
        counterparty_name: accounts.find((a) => a.id === purchaseMerchantId)?.name || 'Merchant',
        type: 'card_payment',
        direction: 'out',
        amount: val,
        description: `${purchaseDesc} (${selectedCard.tipo.toUpperCase()})`,
        external_reference: purchaseOrderId,
        status: 'completed',
        real_money: false,
        environment: 'sandbox',
      });

      // Trigger Webhooks to Merchant
      const targetMerchant = accounts.find((a) => a.id === purchaseMerchantId) || activeAccount;
      if (!targetMerchant) return;

      const dispatched = await triggerWebhookEvents({
        userId: targetMerchant.user_id,
        accountId: targetMerchant.id,
        event: 'order.paid',
        payloadData: {
          orderId: purchaseOrderId,
          externalReference: purchaseOrderId,
          amount: val,
          status: 'paid',
          cardMasked: selectedCard.masked_number,
          cardType: selectedCard.tipo,
          realMoney: false,
          environment: 'sandbox',
        },
      });

      await refreshAccounts();
      await fetchCards();
      alert(`✅ Compra aprovada com sucesso! ${dispatched} webhook(s) disparado(s).`);
    } catch (err: any) {
      alert(`❌ Erro ao simular compra: ${err.message}`);
    } finally {
      setPurchasing(false);
    }
  };

  if (!activeAccount) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <CardIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            Cartões Virtuais Fictícios
          </h1>
          <p className="text-xs text-slate-500">
            Gerador e simulador de transações de crédito e débito online
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => handleCreateCard('debito')}
            className="py-1.5 px-3 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 hover:bg-purple-200 font-bold text-xs rounded-xl transition flex items-center gap-1 border border-purple-300 dark:border-purple-800"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Débito</span>
          </button>
          <button
            onClick={() => handleCreateCard('credito')}
            className="py-1.5 px-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1 shadow-md shadow-purple-900/20"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Crédito</span>
          </button>
        </div>
      </div>

      {/* Visual dos Cartões */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cards.length === 0 ? (
          <div className="col-span-full p-8 text-center text-slate-400 text-xs bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
            Nenhum cartão virtual criado para esta conta. Clique em "+ Débito" ou "+ Crédito" acima.
          </div>
        ) : (
          cards.map((card) => {
            const isCredit = card.tipo === 'credito';
            return (
              <div
                key={card.id}
                className={`p-6 rounded-2xl shadow-xl text-white relative overflow-hidden flex flex-col justify-between h-48 border border-white/20 ${
                  isCredit
                    ? 'bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900'
                    : 'bg-gradient-to-br from-teal-800 via-teal-900 to-slate-900'
                }`}
              >
                {/* Background Pattern Deco */}
                <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-center justify-between z-10">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold tracking-tight text-sm">
                      Optma<span className="text-purple-400">Card</span>
                    </span>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-white/10 rounded border border-white/20">
                      {card.tipo}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                    SANDBOX
                  </span>
                </div>

                {/* Card Chip */}
                <div className="w-10 h-7 rounded-md bg-gradient-to-tr from-amber-300 to-amber-100 shadow-md border border-amber-400/40 z-10 flex items-center justify-center">
                  <div className="w-6 h-4 border-y border-slate-700/40" />
                </div>

                {/* Card Number & Info */}
                <div className="space-y-1 z-10">
                  <p className="font-mono text-base tracking-widest text-slate-100 font-bold">
                    {card.masked_number}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-slate-300 uppercase font-mono">
                    <span>{card.cardholder_name}</span>
                    <span>VAL: {card.validade} • CVV: {card.cvv}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Painel Simular Compra E-Commerce */}
      {cards.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-teal-600" />
            Simular Compra com Cartão Fictício
          </h2>

          <form onSubmit={handleSimulatePurchase} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Selecione o Cartão
              </label>
              <select
                value={purchaseCardId}
                onChange={(e) => setPurchaseCardId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                required
              >
                <option value="">Selecione o cartão...</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.masked_number} ({c.tipo.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Valor da Compra (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={purchaseAmount}
                onChange={(e) => setPurchaseAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                ID do Pedido / Ordem
              </label>
              <input
                type="text"
                value={purchaseOrderId}
                onChange={(e) => setPurchaseOrderId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                required
              />
            </div>

            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={purchasing}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition shadow-md shadow-purple-900/20 disabled:opacity-50"
              >
                {purchasing ? 'Processando Compra...' : 'Aprovar Compra & Disparar Webhook de Venda'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
