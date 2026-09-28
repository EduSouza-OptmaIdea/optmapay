import { getSupabaseAdmin } from '../../../_lib/supabaseAdmin.js';
import { sendError, sendSuccess } from '../../../_lib/http.js';

async function getAuthenticatedUser(req: any) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const supabase = getSupabaseAdmin();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  return user;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Utilize GET.');
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
  }

  const externalReference = String(req.query?.externalReference || '').trim();
  if (externalReference.length < 8 || externalReference.length > 500) {
    return sendError(res, 400, 'INVALID_REFERENCE', 'Referência Pix inválida.');
  }

  const supabase = getSupabaseAdmin();

  const { data: paidIn, error: paidError } = await supabase
    .from('transactions')
    .select('id, account_id, counterparty_account_id, counterparty_name, amount, created_at')
    .eq('external_reference', externalReference)
    .eq('type', 'pix')
    .eq('direction', 'in')
    .eq('status', 'completed')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (paidError) {
    return sendError(res, 500, 'DATABASE_ERROR', 'Não foi possível consultar o estado da instrução Pix.');
  }

  if (!paidIn) {
    return sendSuccess(res, 200, {
      status: 'available',
      externalReference,
      receiptAvailable: false,
    });
  }

  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id, name, pix_key')
    .eq('user_id', user.id);

  if (accountsError) {
    return sendError(res, 500, 'DATABASE_ERROR', 'Não foi possível validar a conta do pagador.');
  }

  const accountIds = (accounts || []).map((account: any) => account.id);
  let paidOut: any = null;

  if (accountIds.length > 0) {
    const { data } = await supabase
      .from('transactions')
      .select('id, account_id, counterparty_account_id, counterparty_name, amount, created_at')
      .in('account_id', accountIds)
      .eq('external_reference', externalReference)
      .eq('type', 'pix')
      .eq('direction', 'out')
      .eq('status', 'completed')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    paidOut = data || null;
  }

  if (!paidOut) {
    return sendSuccess(res, 200, {
      status: 'paid',
      externalReference,
      amount: Number(paidIn.amount),
      paidAt: paidIn.created_at,
      receiptAvailable: false,
    });
  }

  const senderAccount = (accounts || []).find((account: any) => account.id === paidOut.account_id);
  let receiverPixKey: string | null = null;

  if (paidOut.counterparty_account_id) {
    const { data: receiver } = await supabase
      .from('accounts')
      .select('pix_key')
      .eq('id', paidOut.counterparty_account_id)
      .maybeSingle();
    receiverPixKey = receiver?.pix_key || null;
  }

  return sendSuccess(res, 200, {
    status: 'paid',
    externalReference,
    amount: Number(paidOut.amount),
    paidAt: paidOut.created_at,
    receiptAvailable: true,
    receipt: {
      senderName: senderAccount?.name || 'Conta pagadora',
      senderPixKey: senderAccount?.pix_key || null,
      receiverName: paidOut.counterparty_name || 'Conta recebedora',
      receiverPixKey,
      transactionOutId: paidOut.id,
      transactionInId: paidIn.id,
    },
  });
}
