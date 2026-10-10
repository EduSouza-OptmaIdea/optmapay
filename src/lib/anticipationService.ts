import { supabase } from './supabase';
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
 * Executa antecipação exclusivamente no PostgreSQL autoritativo.
 *
 * A simulação continua no cliente para UX, mas saldo, taxa efetiva,
 * recebível, idempotência e webhook são decididos/gravados pelo servidor.
 * Nunca atualize accounts, transactions ou card_receivables diretamente aqui.
 */
export async function executeAnticipationSettlement(input: ExecuteAnticipationInput): Promise<{
  success: boolean;
  message: string;
  creditedAmount: number;
  feeAmount: number;
}> {
  const { transactionId, accountId } = input;

  if (!accountId) {
    throw new Error('Conta bancária não identificada.');
  }

  if (!transactionId) {
    throw new Error('Recebível não identificado para antecipação.');
  }

  const { data, error } = await supabase.rpc('anticipate_card_receivable', {
    p_transaction_id: transactionId,
    p_account_id: accountId,
  });

  if (error) {
    const message = String(error.message || '');
    if (message.includes('SETTLEMENT_ALREADY_DUE')) {
      throw new Error('Este recebível já está disponível para liquidação normal e não precisa mais ser antecipado.');
    }
    throw new Error(message || 'Falha ao processar antecipação no servidor.');
  }

  if (!data?.success) {
    throw new Error(data?.message || 'Falha ao antecipar o recebível.');
  }

  return {
    success: true,
    message: data.message || 'Antecipação realizada com sucesso.',
    creditedAmount: Number(data.amount_credited || 0),
    feeAmount: Number(data.anticipation_fee_amount || 0),
  };
}
