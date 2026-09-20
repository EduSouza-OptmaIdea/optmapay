import { authenticateApiKey } from '../../_lib/apiKeyAuth';
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin';
import { sendError, sendSuccess } from '../../_lib/http';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Método ${req.method} não permitido. Utilize GET.`);
  }

  const auth = await authenticateApiKey(req, res, 'account:read');
  if (!auth) return;

  const supabase = getSupabaseAdmin();
  const { data: account, error } = await supabase
    .from('accounts')
    .select('id, name, type, balance, pix_key, agency, account_number')
    .eq('id', auth.accountId)
    .maybeSingle();

  if (error || !account) {
    return sendError(res, 404, 'ACCOUNT_NOT_FOUND', 'Conta vinculada à API key não foi encontrada.');
  }

  return sendSuccess(res, 200, {
    account: {
      id: account.id,
      name: account.name,
      type: account.type,
      balance: Number(account.balance),
      pixKey: account.pix_key,
      agency: account.agency || '0001',
      accountNumber: account.account_number,
    },
  });
}
