import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { triggerWebhookEvents } from '../lib/webhookEngine';
import { ArrowLeftRight, Building2, User, CheckCircle2, Clock, QrCode, FileText, CreditCard } from 'lucide-react';

interface MockOrder {
  id: string;
  orderId: string;
  title: string;
  amount: number;
  status: 'pending' | 'paid';
  payerName: string;
  payerId: string;
  merchantId: string;
}

export const SettlementSimulator: React.FC = () => {
  const { activeAccount, accounts, refreshAccounts } = useAuth();
  const [orders, setOrders] = useState<MockOrder[]>([
    {
      id: '1',
      orderId: 'ORD-2026-9901',
      title: 'Fatura Duplicata #9901 - Fornecimento de Software',
      amount: 850.00,
      status: 'pending',
      payerName: 'Carlos Eduardo Silva (Cliente Teste)',
      payerId: '', // populated below
      merchantId: '',
    },
    {
      id: '2',
      orderId: 'ORD-2026-9902',
      title: 'Venda E-Commerce #9902 - Licença Anual',
      amount: 1490.00,
      status: 'pending',
      payerName: 'Lojas Venda Rápida EIRELI',
      payerId: '',
      merchantId: '',
    },
  ]);

  const [settlingOrderId, setSettlingOrderId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'boleto' | 'card'>('pix');
  const [settleMsg, setSettleMsg] = useState<string | null>(null);

  if (!activeAccount) return null;

  const isMerchant = activeAccount.type === 'merchant';
  const customerAccounts = accounts.filter((a) => a.type === 'customer');
  const merchantAccount = accounts.find((a) => a.type === 'merchant') || activeAccount;

  // Filter visible orders
  const visibleOrders = orders.filter((ord) => {
    if (isMerchant) return true; // Merchant sees all receivables
    // Customer sees their orders
    return true;
  });

  const handleSettleOrder = async (order: MockOrder) => {
    if (isMerchant) {
      alert('Para quitar um pedido, mude a "Conta Ativa" no topo para o Cliente pagador!');
      return;
    }

    setSettlingOrderId(order.id);
    setSettleMsg(null);

    try {
      if (activeAccount.balance < order.amount) {
        throw new Error('Saldo insuficiente na conta do cliente para realizar esta baixa.');
      }

      // 1. Debit customer account
      await supabase
        .from('accounts')
        .update({ balance: activeAccount.balance - order.amount })
        .eq('id', activeAccount.id);

      // 2. Credit merchant account
      await supabase
        .from('accounts')
        .update({ balance: merchantAccount.balance + order.amount })
        .eq('id', merchantAccount.id);

      // 3. Register transaction
      await supabase.from('transactions').insert({
        user_id: activeAccount.user_id || null,
        account_id: activeAccount.id,
        counterparty_account_id: merchantAccount.id,
        counterparty_name: merchantAccount.name,
        type: paymentMethod === 'pix' ? 'pix' : paymentMethod === 'boleto' ? 'boleto_payment' : 'card_payment',
        direction: 'out',
        amount: order.amount,
        description: `Liquidação ${order.orderId} (${paymentMethod.toUpperCase()})`,
        external_reference: order.orderId,
        status: 'completed',
        real_money: false,
        environment: 'sandbox',
      });

      // 4. Fire Webhooks to Merchant
      const dispatched = await triggerWebhookEvents({
        userId: merchantAccount.user_id,
        accountId: merchantAccount.id,
        event: 'order.paid',
        payloadData: {
          orderId: order.orderId,
          externalReference: order.orderId,
          amount: order.amount,
          paymentMethod,
          status: 'paid',
          payerName: activeAccount.name,
          realMoney: false,
          environment: 'sandbox',
        },
      });

      // Update local state
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: 'paid' } : o))
      );

      await refreshAccounts();
      setSettleMsg(`✅ Pedido ${order.orderId} liquidado com sucesso por ${paymentMethod.toUpperCase()}! ${dispatched} Webhook(s) entregue(s).`);
    } catch (err: any) {
      setSettleMsg(`❌ Falha na baixa: ${err.message}`);
    } finally {
      setSettlingOrderId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-amber-500" />
            Simulador de Liquidação de Vendas & Duplicatas
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Alterne a conta ativa no topo para simular o papel da empresa recebedora ou do cliente pagador.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
          <div className={`p-1.5 rounded-lg ${isMerchant ? 'bg-teal-600 text-white' : 'bg-blue-600 text-white'}`}>
            {isMerchant ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Papel Atual na Tela</p>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
              {isMerchant ? 'VISÃO EMPRESA (RECEBEDOR)' : 'VISÃO CLIENTE (PAGADOR)'}
            </p>
          </div>
        </div>
      </div>

      {/* Instruções Dinâmicas */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200">
        {isMerchant ? (
          <p>
            <strong>Você está como Empresa ({activeAccount.name}):</strong> Aqui você acompanha o fluxo de entrada de recebíveis e duplicatas pendentes de liquidação.
          </p>
        ) : (
          <p>
            <strong>Você está como Cliente ({activeAccount.name}):</strong> Escolha um meio de pagamento fictício (Pix, Boleto ou Cartão) e clique em "Quitar Pedido Agora" para testar a baixa em tempo real!
          </p>
        )}
      </div>

      {settleMsg && (
        <div className="p-3 rounded-xl bg-slate-900 text-white font-mono text-xs shadow-lg">
          {settleMsg}
        </div>
      )}

      {/* Lista de Pedidos / Duplicatas */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
          Pedidos & Duplicatas em Aberto
        </h2>

        <div className="space-y-4">
          {visibleOrders.map((ord) => {
            const isPaid = ord.status === 'paid';
            return (
              <div
                key={ord.id}
                className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                        {ord.title}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${
                          isPaid
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {isPaid ? 'LIQUIDADO' : 'PENDENTE'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      ID Pedido: {ord.orderId} • Pagador: {ord.payerName}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                      R$ {ord.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {!isPaid && !isMerchant && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-1">
                    {/* Select Payment Method */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Meio:</span>
                      <div className="flex gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('pix')}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center gap-1 transition ${
                            paymentMethod === 'pix' ? 'bg-teal-600 text-white' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <QrCode className="w-3.5 h-3.5" /> Pix
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('boleto')}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center gap-1 transition ${
                            paymentMethod === 'boleto' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5" /> Boleto
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('card')}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center gap-1 transition ${
                            paymentMethod === 'card' ? 'bg-purple-600 text-white' : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <CreditCard className="w-3.5 h-3.5" /> Cartão
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSettleOrder(ord)}
                      disabled={settlingOrderId === ord.id}
                      className="w-full sm:w-auto py-2 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition shadow-md shadow-emerald-900/20 disabled:opacity-50"
                    >
                      {settlingOrderId === ord.id ? 'Executando Baixa...' : 'Quitar Pedido Agora'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
