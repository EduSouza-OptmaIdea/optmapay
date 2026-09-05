import { supabase } from './supabase';
import { triggerWebhookEvents } from './webhookEngine';
import { AnticipationCalculationResult } from './businessDays';

export interface ExecuteAnticipationInput {
  transactionId?: string;
  orderId?: string;
  accountId: string;
  userId?: string;
  calculation: AnticipationCalculationResult;
  description?: string;
}

/**
 * Executa a antecipação pro rata de uma transação ou venda com PIN validado:
 * 1. Credita o valor líquido calculado no saldo da conta.
 * 2. Atualiza a transação original de 'pending' para 'completed'.
 * 3. Registra a taxa de antecipação e dispara webhook de conciliação.
 */
export async function executeAnticipationSettlement(input: ExecuteAnticipationInput): Promise<{
  success: boolean;
  message: string;
  creditedAmount: number;
  feeAmount: number;
}> {
  const { transactionId, orderId, accountId, userId, calculation, description } = input;

  if (!accountId) {
    throw new Error('Conta bancária não identificada.');
  }

  // 1. Busca saldo atual da conta
  const { data: account, error: accErr } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (accErr || !account) {
    throw new Error('Não foi possível localizar a conta para creditar o valor.');
  }

  const newBalance = Number(account.balance) + calculation.netAnticipatedAmount;

  // 2. Atualiza saldo da conta
  const { error: updErr } = await supabase
    .from('accounts')
    .update({
      balance: Math.round(newBalance * 100) / 100,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId);

  if (updErr) {
    throw new Error(`Falha ao creditar saldo da antecipação: ${updErr.message}`);
  }

  // 3. Atualiza a transação pendente se houver transactionId
  if (transactionId) {
    const updatedDesc = `${description || 'Recebimento de Cartão'} (Antecipado Pro Rata - Líquido R$ ${calculation.netAnticipatedAmount.toFixed(2)} / Taxa R$ ${calculation.anticipationFeeAmount.toFixed(2)})`;
    await supabase
      .from('transactions')
      .update({
        status: 'completed',
        amount: calculation.netAnticipatedAmount, // Ajusta para o líquido efetivamente recebido
        description: updatedDesc,
      })
      .eq('id', transactionId);
  } else {
    // Insere transação de antecipação avulsa
    await supabase.from('transactions').insert({
      user_id: userId || account.user_id || null,
      account_id: accountId,
      type: 'card_payment',
      direction: 'in',
      amount: calculation.netAnticipatedAmount,
      description: `Antecipação Pro Rata ${orderId ? '#' + orderId : ''} (Desc. R$ ${calculation.anticipationFeeAmount.toFixed(2)})`,
      external_reference: orderId || `ANT-${Date.now()}`,
      status: 'completed',
      real_money: false,
      environment: 'sandbox',
    });
  }

  // 4. Disparo de Webhooks para conciliação
  try {
    await triggerWebhookEvents({
      userId: account.user_id,
      accountId: accountId,
      event: 'payment.settled',
      payloadData: {
        orderId: orderId || transactionId || `ANT-${Date.now()}`,
        transactionId: transactionId || null,
        type: 'anticipation',
        grossAmount: calculation.grossAmount,
        netAmount: calculation.netAnticipatedAmount,
        anticipationFeeAmount: calculation.anticipationFeeAmount,
        proRataFeePercent: calculation.proRataFeePercent,
        daysRemaining: calculation.daysRemaining,
        status: 'settled',
        realMoney: false,
        environment: 'sandbox',
        settledAt: new Date().toISOString(),
      },
    });
  } catch (whErr) {
    console.warn('[Anticipation Webhook Dispatch Warning]', whErr);
  }

  return {
    success: true,
    message: `Antecipação realizada com sucesso! R$ ${calculation.netAnticipatedAmount.toFixed(2)} creditados em conta.`,
    creditedAmount: calculation.netAnticipatedAmount,
    feeAmount: calculation.anticipationFeeAmount,
  };
}
