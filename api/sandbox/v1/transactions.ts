import { authenticateApiKey } from '../../_lib/apiKeyAuth';
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin';
import { sendError, sendSuccess } from '../../_lib/http';

export default async function handler(req: any, res: any) {
  if (req.method === 'POST') {
    return sendError(
      res,
      405,
      'USE_OPERATION_SPECIFIC_ENDPOINT',
      'Criação genérica de transações não é permitida. Utilize os endpoints específicos de operação (ex: /cards/charge ou transfer_pix).'
    );
  }

  if (req.method !== 'GET') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Método ${req.method} não permitido. Utilize GET.`);
  }

  const auth = await authenticateApiKey(req, res, 'transactions:read');
  if (!auth) return;

  const queryParams = req.query || {};
  const limitParam = parseInt(queryParams.limit as string, 10);
  const limit = !isNaN(limitParam) ? Math.max(1, Math.min(100, limitParam)) : 20;

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('account_id', auth.accountId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (queryParams.type) {
    query = query.eq('type', queryParams.type);
  }

  if (queryParams.status) {
    query = query.eq('status', queryParams.status);
  }

  if (queryParams.createdFrom) {
    query = query.gte('created_at', queryParams.createdFrom);
  }

  if (queryParams.createdTo) {
    query = query.lte('created_at', queryParams.createdTo);
  }

  const { data: transactions, error } = await query;

  if (error) {
    return sendError(res, 500, 'DATABASE_ERROR', 'Erro ao consultar lançamentos da conta.');
  }

  return sendSuccess(res, 200, {
    transactions: (transactions || []).map((t: any) => ({
      id: t.id,
      type: t.type,
      direction: t.direction,
      amount: Number(t.amount),
      status: t.status,
      description: t.description,
      counterpartyName: t.counterparty_name,
      counterpartyDocument: t.counterparty_document,
      externalReference: t.external_reference,
      refundedAmount: Number(t.refunded_amount || 0),
      createdAt: t.created_at,
    })),
    count: (transactions || []).length,
    limit,
  });
}
