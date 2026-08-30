import { supabase } from './supabase';
import { triggerWebhookEvents } from './webhookEngine';

export interface ParsedPixData {
  cleanKey: string;
  accId?: string;
  amount?: number;
  description?: string;
  orderId?: string;
  merchantName?: string;
  isOptmaPayCode: boolean;
  isEmv: boolean;
}

/**
 * Generates an OptmaPay Sandbox transaction instruction code/URL.
 * This encapsulates the receiver, account, amount, and order reference into an actionable payload.
 */
export function generateOptmaPayPixPayload(params: {
  receiverPixKey: string;
  receiverName: string;
  receiverAccountId?: string;
  amount?: number;
  orderId?: string;
  description?: string;
}): string {
  const queryParams = new URLSearchParams();
  queryParams.set('to', params.receiverPixKey.trim());
  queryParams.set('name', params.receiverName.trim());
  if (params.receiverAccountId) queryParams.set('accId', params.receiverAccountId);
  if (params.amount && params.amount > 0) queryParams.set('amount', params.amount.toFixed(2));
  if (params.orderId) queryParams.set('ref', params.orderId.trim());
  if (params.description) queryParams.set('desc', params.description.trim());
  queryParams.set('env', 'sandbox');
  queryParams.set('ts', Date.now().toString());

  return `OPTMAPAY://PIX/v1?${queryParams.toString()}`;
}

/**
 * Parses raw Pix input:
 * 1. OptmaPay Sandbox Instruction (OPTMAPAY://PIX/v1?...)
 * 2. PIX:chave
 * 3. BR Code / EMV Standard (000201...)
 * 4. Plain Pix Key (email, CPF, CNPJ, phone, EVP)
 */
export function parsePixPayload(rawInput: string): ParsedPixData {
  const trimmed = rawInput.trim();

  // 1. OptmaPay Application-Specific Instruction
  if (trimmed.toUpperCase().startsWith('OPTMAPAY://PIX') || trimmed.toUpperCase().startsWith('OPTMAPAY:PIX')) {
    try {
      const queryString = trimmed.includes('?') ? trimmed.split('?')[1] : trimmed;
      const params = new URLSearchParams(queryString);
      const to = decodeURIComponent(params.get('to') || '');
      const accId = params.get('accId') || '';
      const name = decodeURIComponent(params.get('name') || '');
      const amountStr = params.get('amount');
      const ref = decodeURIComponent(params.get('ref') || '');
      const desc = decodeURIComponent(params.get('desc') || '');

      const amount = amountStr ? parseFloat(amountStr) : undefined;

      return {
        cleanKey: to || trimmed,
        accId: accId || undefined,
        amount: !isNaN(amount as number) && (amount as number) > 0 ? amount : undefined,
        description: desc || (name ? `Pagamento para ${name}` : 'Transferência OptmaPay Sandbox'),
        orderId: ref || undefined,
        merchantName: name || undefined,
        isOptmaPayCode: true,
        isEmv: false,
      };
    } catch {
      // Fallback
    }
  }

  // 2. Simple "PIX:chave" format
  if (trimmed.toUpperCase().startsWith('PIX:')) {
    const key = trimmed.slice(4).trim();
    return {
      cleanKey: key,
      isOptmaPayCode: false,
      isEmv: false,
    };
  }

  // 3. EMV standard BR Code (starts with "000201")
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
        const parsedVal = parseFloat(value);
        if (!isNaN(parsedVal) && parsedVal > 0) {
          amount = parsedVal;
        }
      } else if (tag === '59') {
        merchantName = value;
      } else if (tag === '62') {
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
        isOptmaPayCode: false,
        isEmv: true,
      };
    }
  }

  // 4. Plain Pix Key fallback
  return {
    cleanKey: trimmed,
    isOptmaPayCode: false,
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
  senderPixKey?: string;
  receiverPixKey?: string;
  senderBalanceAfter: number;
  transactionOutId?: string;
  transactionInId?: string;
  transactionDate: string;
  externalReference: string;
  webhooksDispatched: number;
}

/**
 * Executes a simulated Pix transfer from sender account to receiver account.
 * Uses PostgreSQL RPC transfer_pix to guarantee atomic multi-account execution without RLS 403 Forbidden.
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

  const finalDesc = description || parsed.description || 'Transferência Pix Sandbox';
  const finalRef = externalReference || parsed.orderId || `TXN-${Math.floor(10000000 + Math.random() * 90000000)}`;

  // Chave a ser enviada para busca no banco (se tiver accId no payload, usa accId como prioridade de busca)
  const lookupKey = parsed.accId || targetKey;

  // 2. Tenta executar via RPC transfer_pix (SECURITY DEFINER no PostgreSQL)
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('transfer_pix', {
    p_sender_account_id: senderAccountId,
    p_receiver_pix_key: lookupKey,
    p_amount: amount,
    p_description: finalDesc,
    p_external_reference: finalRef,
  });

  if (!rpcErr && rpcResult && rpcResult.success) {
    const receiverAccountId = rpcResult.receiver_account_id;
    const receiverName = rpcResult.receiver_name;
    const outTxId = rpcResult.transaction_out_id;
    const inTxId = rpcResult.transaction_in_id;

    // Dispara Webhook para a conta recebedora (se houver webhook cadastrado)
    let dispatched = 0;
    try {
      const { data: receiverAcc } = await supabase
        .from('accounts')
        .select('user_id, pix_key')
        .eq('id', receiverAccountId)
        .single();

      dispatched = await triggerWebhookEvents({
        userId: receiverAcc?.user_id || '',
        accountId: receiverAccountId,
        event: 'pix.paid',
        payloadData: {
          transactionId: inTxId || `tx_pix_${Date.now()}`,
          orderId: finalRef,
          externalReference: finalRef,
          amount,
          status: 'paid',
          senderName: sender.name,
          senderPixKey: sender.pix_key,
          receiverName,
          receiverPixKey: receiverAcc?.pix_key || targetKey,
          realMoney: false,
          environment: 'sandbox',
          paidAt: new Date().toISOString(),
        },
      });
    } catch (whErr) {
      console.warn('Falha no webhook Pix:', whErr);
    }

    return {
      success: true,
      message: `Transferência Pix de R$ ${amount.toFixed(2)} enviada com sucesso para ${receiverName}!`,
      amount,
      senderName: sender.name,
      receiverName,
      senderPixKey: sender.pix_key,
      receiverPixKey: targetKey,
      senderBalanceAfter: senderBalance - amount,
      transactionOutId: outTxId,
      transactionInId: inTxId,
      transactionDate: new Date().toISOString(),
      externalReference: finalRef,
      webhooksDispatched: dispatched,
    };
  }

  // Se o RPC retornou erro de negócio
  if (rpcErr) {
    throw new Error(rpcErr.message || 'Erro ao processar transferência Pix via banco de dados.');
  }

  throw new Error('Falha ao concluir transferência Pix.');
}
