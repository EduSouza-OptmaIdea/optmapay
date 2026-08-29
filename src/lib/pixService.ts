import { supabase } from './supabase';
import { triggerWebhookEvents } from './webhookEngine';
import { SandboxAccount } from '../types/sandbox';

export interface ParsedPixData {
  cleanKey: string;
  amount?: number;
  description?: string;
  orderId?: string;
  merchantName?: string;
  isEmv: boolean;
}

/**
 * Parses raw Pix input (plain key, PIX: prefix, or EMV BR Code standard payload)
 */
export function parsePixPayload(rawInput: string): ParsedPixData {
  const trimmed = rawInput.trim();

  // 1. Simple "PIX:chave" format
  if (trimmed.toUpperCase().startsWith('PIX:')) {
    const key = trimmed.slice(4).trim();
    return {
      cleanKey: key,
      isEmv: false,
    };
  }

  // 2. EMV standard BR Code (starts with "000201")
  if (trimmed.startsWith('000201')) {
    let cleanKey = '';
    let amount: number | undefined = undefined;
    let description: string | undefined = undefined;
    let orderId: string | undefined = undefined;
    let merchantName: string | undefined = undefined;

    let index = 0;
    while (index < trimmed.length) {
      const tag = trimmed.substring(index, index + 2);
      const lengthStr = trimmed.substring(index + 2, index + 4);
      const length = parseInt(lengthStr, 10);
      if (isNaN(length) || length <= 0) break;

      const value = trimmed.substring(index + 4, index + 4 + length);
      index += 4 + length;

      if (tag === '26') {
        // Merchant Account Info - sub-TLV
        let subIndex = 0;
        while (subIndex < value.length) {
          const subTag = value.substring(subIndex, subIndex + 2);
          const subLen = parseInt(value.substring(subIndex + 2, subIndex + 4), 10);
          if (isNaN(subLen) || subLen <= 0) break;
          const subVal = value.substring(subIndex + 4, subIndex + 4 + subLen);
          subIndex += 4 + subLen;

          if (subTag === '01') {
            cleanKey = subVal;
          }
        }
      } else if (tag === '54') {
        // Amount
        const parsedVal = parseFloat(value);
        if (!isNaN(parsedVal) && parsedVal > 0) {
          amount = parsedVal;
        }
      } else if (tag === '59') {
        // Merchant Name
        merchantName = value;
      } else if (tag === '62') {
        // Additional data field template (txid / reference)
        let subIndex = 0;
        while (subIndex < value.length) {
          const subTag = value.substring(subIndex, subIndex + 2);
          const subLen = parseInt(value.substring(subIndex + 2, subIndex + 4), 10);
          if (isNaN(subLen) || subLen <= 0) break;
          const subVal = value.substring(subIndex + 4, subIndex + 4 + subLen);
          subIndex += 4 + subLen;

          if (subTag === '05') {
            orderId = subVal;
          }
        }
      }
    }

    if (cleanKey) {
      return {
        cleanKey,
        amount,
        description: merchantName ? `Pagamento para ${merchantName}` : 'Pagamento Pix QR Code',
        orderId,
        merchantName,
        isEmv: true,
      };
    }
  }

  // 3. Plain Pix Key fallback
  return {
    cleanKey: trimmed,
    isEmv: false,
  };
}

export interface PixTransferInput {
  senderAccountId: string;
  destPixKeyOrPayload: string;
  amount: number;
  description?: string;
  externalReference?: string;
}

export interface PixTransferResult {
  success: boolean;
  message: string;
  amount: number;
  senderName: string;
  receiverName: string;
  senderBalanceAfter: number;
  receiverBalanceAfter: number;
  transactionOutId?: string;
  transactionInId?: string;
  webhooksDispatched: number;
}

/**
 * Executes a simulated Pix transfer from sender account to receiver account.
 * Updates balances in real-time and creates mirror entries in transactions table.
 */
export async function executePixTransfer(input: PixTransferInput): Promise<PixTransferResult> {
  const { senderAccountId, destPixKeyOrPayload, amount, description, externalReference } = input;

  if (!senderAccountId) {
    throw new Error('Conta pagadora não informada.');
  }

  if (isNaN(amount) || amount <= 0) {
    throw new Error('Valor da transferência inválido. Deve ser maior que zero.');
  }

  const parsed = parsePixPayload(destPixKeyOrPayload);
  const targetKey = parsed.cleanKey.trim();

  if (!targetKey) {
    throw new Error('Chave Pix de destino não informada.');
  }

  // 1. Fetch Sender Account
  const { data: sender, error: senderErr } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', senderAccountId)
    .single();

  if (senderErr || !sender) {
    throw new Error('Conta pagadora não encontrada no Supabase.');
  }

  const senderBalance = Number(sender.balance);
  if (senderBalance < amount) {
    throw new Error(
      `Saldo insuficiente. Disponível: R$ ${senderBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Solicitado: R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    );
  }

  // 2. Fetch Receiver Account (Lookup by pix_key, cpf_cnpj, or id)
  let { data: receivers, error: receiverErr } = await supabase
    .from('accounts')
    .select('*')
    .or(`pix_key.eq."${targetKey}",pix_key.ilike."%${targetKey}%",cpf_cnpj.eq."${targetKey}"`);

  let receiver: SandboxAccount | null = receivers && receivers.length > 0 ? receivers[0] : null;

  if (!receiver) {
    // Try clean numbers only match for CPF/CNPJ
    const cleanNumbers = targetKey.replace(/\D/g, '');
    if (cleanNumbers.length >= 11) {
      const { data: numMatch } = await supabase
        .from('accounts')
        .select('*')
        .or(`cpf_cnpj.ilike."%${cleanNumbers}%",pix_key.ilike."%${cleanNumbers}%"`);
      if (numMatch && numMatch.length > 0) {
        receiver = numMatch[0];
      }
    }
  }

  if (!receiver) {
    throw new Error(`Chave Pix "${targetKey}" não encontrada no sistema de contas.`);
  }

  if (receiver.id === sender.id) {
    throw new Error('A conta de origem e a conta de destino não podem ser a mesma.');
  }

  const senderNewBalance = senderBalance - amount;
  const receiverNewBalance = Number(receiver.balance) + amount;

  // 3. Execute Balance Updates
  const { error: updSenderErr } = await supabase
    .from('accounts')
    .update({ balance: senderNewBalance, updated_at: new Date().toISOString() })
    .eq('id', sender.id);

  if (updSenderErr) {
    throw new Error(`Falha ao debitar saldo: ${updSenderErr.message}`);
  }

  const { error: updReceiverErr } = await supabase
    .from('accounts')
    .update({ balance: receiverNewBalance, updated_at: new Date().toISOString() })
    .eq('id', receiver.id);

  if (updReceiverErr) {
    // Rollback sender balance
    await supabase.from('accounts').update({ balance: senderBalance }).eq('id', sender.id);
    throw new Error(`Falha ao creditar saldo de destino: ${updReceiverErr.message}`);
  }

  // 4. Create Transaction Records (Outbound & Inbound)
  const finalDesc = description || `Transferência Pix para ${receiver.name}`;
  const finalRef = externalReference || parsed.orderId || `PIX-${Date.now().toString().slice(-6)}`;

  const { data: outTx } = await supabase
    .from('transactions')
    .insert({
      user_id: sender.user_id || null,
      account_id: sender.id,
      counterparty_account_id: receiver.id,
      counterparty_name: receiver.name,
      type: 'pix',
      direction: 'out',
      amount,
      description: finalDesc,
      external_reference: finalRef,
      status: 'completed',
      real_money: false,
      environment: 'sandbox',
    })
    .select('id')
    .single();

  const { data: inTx } = await supabase
    .from('transactions')
    .insert({
      user_id: receiver.user_id || null,
      account_id: receiver.id,
      counterparty_account_id: sender.id,
      counterparty_name: sender.name,
      type: 'pix',
      direction: 'in',
      amount,
      description: `Recebimento Pix de ${sender.name}`,
      external_reference: finalRef,
      status: 'completed',
      real_money: false,
      environment: 'sandbox',
    })
    .select('id')
    .single();

  // 5. Trigger Webhooks for Receiver Account
  let dispatched = 0;
  try {
    dispatched = await triggerWebhookEvents({
      userId: receiver.user_id || '',
      accountId: receiver.id,
      event: 'pix.paid',
      payloadData: {
        orderId: finalRef,
        externalReference: finalRef,
        amount,
        status: 'paid',
        senderName: sender.name,
        senderPixKey: sender.pix_key,
        receiverName: receiver.name,
        receiverPixKey: receiver.pix_key,
        realMoney: false,
        environment: 'sandbox',
        transactionId: inTx?.id || `tx_pix_${Date.now()}`,
      },
    });
  } catch (webhookErr) {
    console.warn('Falha no disparo do webhook Pix:', webhookErr);
  }

  return {
    success: true,
    message: `Transferência Pix de R$ ${amount.toFixed(2)} enviada com sucesso para ${receiver.name}!`,
    amount,
    senderName: sender.name,
    receiverName: receiver.name,
    senderBalanceAfter: senderNewBalance,
    receiverBalanceAfter: receiverNewBalance,
    transactionOutId: outTx?.id,
    transactionInId: inTx?.id,
    webhooksDispatched: dispatched,
  };
}
