import { authenticateApiKey } from '../../../_lib/apiKeyAuth.js';
import { hashRequestBody } from '../../../_lib/idempotency.js';
import { getSupabaseAdmin } from '../../../_lib/supabaseAdmin.js';
import { dispatchEventJobs } from '../../../_lib/dispatcher.js';
import { sendError, sendSuccess } from '../../../_lib/http.js';

/**
 * TEMPORARY sandbox-only homologation endpoint.
 * Accepts only pre-existing Customer Smoke fixtures and amounts <= R$ 20.
 * It exists to validate the real OptmaMenu -> OptmaPay -> webhook path without
 * transmitting PAN/CVV through automation tooling. Remove after E2E approval.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Utilize POST.');
  }

  const auth = await authenticateApiKey(req, res, 'cards:charge');
  if (!auth) return;

  if (String(req.headers['x-optmapay-e2e-test'] || '') !== '1') {
    return sendError(res, 403, 'E2E_HEADER_REQUIRED', 'Endpoint restrito à homologação Sandbox.');
  }

  const action = String(req.body?.action || 'charge');
  const supabase = getSupabaseAdmin();

  if (action === 'settle') {
    const transactionId = String(req.body?.transactionId || '').trim();
    if (!transactionId) {
      return sendError(res, 400, 'MISSING_TRANSACTION_ID', 'transactionId é obrigatório.');
    }

    const { data: receivable, error: recErr } = await supabase
      .from('card_receivables')
      .select('id,merchant_account_id,transaction_in_id,status')
      .eq('transaction_in_id', transactionId)
      .eq('merchant_account_id', auth.accountId)
      .maybeSingle();

    if (recErr || !receivable) {
      return sendError(res, 404, 'RECEIVABLE_NOT_FOUND', 'Recebível Sandbox não encontrado.');
    }

    if (receivable.status === 'pending') {
      const { error: dueErr } = await supabase
        .from('card_receivables')
        .update({ expected_settlement_at: new Date(Date.now() - 1000).toISOString() })
        .eq('id', receivable.id)
        .eq('status', 'pending');
      if (dueErr) return sendError(res, 500, 'SETTLEMENT_PREP_FAILED', dueErr.message);
    }

    const { data: settlement, error: settlementErr } = await supabase.rpc('release_d1_settlement', {
      p_transaction_id: transactionId,
      p_account_id: auth.accountId,
    });

    if (settlementErr) {
      return sendError(res, 400, 'SETTLEMENT_FAILED', settlementErr.message);
    }

    const eventId = settlement?.settlement_event_id || settlement?.settlementEventId;
    if (eventId && settlement?.duplicate !== true) {
      await dispatchEventJobs(eventId);
    }

    return sendSuccess(res, 200, {
      success: true,
      action: 'settle',
      settlement,
      realMoney: false,
      environment: 'sandbox',
    });
  }

  if (action !== 'charge') {
    return sendError(res, 400, 'UNSUPPORTED_ACTION', 'Ação de homologação inválida.');
  }

  const cardId = String(req.body?.cardId || '').trim();
  const orderId = String(req.body?.orderId || '').trim();
  const tipo = String(req.body?.tipo || '').trim();
  const amount = Number(req.body?.amount);
  const installments = Math.max(1, Math.min(12, Number.parseInt(String(req.body?.installments || '1'), 10) || 1));
  const settlementPlan = String(req.body?.settlementPlan || 'standard').trim() || 'standard';

  if (!cardId || !orderId || !orderId.startsWith('optmamenu:')) {
    return sendError(res, 400, 'INVALID_E2E_INPUT', 'cardId e orderId OptmaMenu são obrigatórios.');
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 20) {
    return sendError(res, 400, 'INVALID_E2E_AMOUNT', 'Homologação aceita valor entre R$ 0,01 e R$ 20,00.');
  }
  if (!['debito', 'credito'].includes(tipo)) {
    return sendError(res, 400, 'INVALID_CARD_TYPE', 'tipo deve ser debito ou credito.');
  }
  if (tipo === 'debito' && installments !== 1) {
    return sendError(res, 400, 'INVALID_INSTALLMENTS_DEBIT', 'Débito deve usar 1 parcela.');
  }

  const rawIdempotencyKey = String(req.headers['idempotency-key'] || '').trim();
  if (!rawIdempotencyKey) {
    return sendError(res, 400, 'MISSING_IDEMPOTENCY_KEY', 'Idempotency-Key é obrigatório.');
  }

  const { data: card, error: cardErr } = await supabase
    .from('cartoes')
    .select('id,account_id,tipo,card_number,cardholder_name,validade,cvv,status')
    .eq('id', cardId)
    .maybeSingle();

  if (cardErr || !card || card.status !== 'active' || card.tipo !== tipo) {
    return sendError(res, 404, 'E2E_FIXTURE_NOT_FOUND', 'Cartão fixture Sandbox não encontrado.');
  }

  const { data: payer, error: payerErr } = await supabase
    .from('accounts')
    .select('id,name')
    .eq('id', card.account_id)
    .maybeSingle();

  if (payerErr || !payer || !String(payer.name || '').startsWith('Customer Smoke ')) {
    return sendError(res, 403, 'E2E_FIXTURE_REJECTED', 'Somente fixtures Customer Smoke são permitidas.');
  }

  const requestHash = hashRequestBody({
    action: 'charge',
    cardId,
    orderId,
    tipo,
    amount,
    installments,
    settlementPlan,
  });

  const { data: rpcResult, error: rpcErr } = await supabase.rpc('process_card_payment', {
    p_merchant_account_id: auth.accountId,
    p_api_key_id: auth.key.id,
    p_card_id: card.id,
    p_card_number: card.card_number,
    p_cardholder_name: card.cardholder_name || payer.name || 'CUSTOMER SMOKE',
    p_validade: card.validade,
    p_cvv: card.cvv,
    p_amount: amount,
    p_tipo: tipo,
    p_installments: installments,
    p_plan: settlementPlan,
    p_description: 'OptmaMenu E2E Sandbox',
    p_external_reference: orderId,
    p_idempotency_key: rawIdempotencyKey,
    p_request_hash: requestHash,
  });

  if (rpcErr) {
    return sendError(res, 400, 'E2E_CHARGE_FAILED', rpcErr.message);
  }
  if (!rpcResult?.success) {
    return sendError(res, 422, 'E2E_CHARGE_DECLINED', rpcResult?.message || 'Cobrança não autorizada.');
  }

  const isFromCache = Boolean(rpcResult.from_cache);
  const eventId = rpcResult.webhook_event_id || rpcResult.webhookEventId;
  if (!isFromCache && eventId) {
    await dispatchEventJobs(eventId);
  }

  return sendSuccess(res, 200, {
    success: true,
    action: 'charge',
    data: {
      transactionId: rpcResult.transaction_in_id || rpcResult.transactionId,
      amountGross: Number(rpcResult.amount_gross || rpcResult.gross_amount || amount),
      feePercent: Number(rpcResult.fee_percent ?? rpcResult.feePercent ?? 0),
      feeAmount: Number(rpcResult.fee_amount ?? rpcResult.feeAmount ?? 0),
      amountNet: Number(rpcResult.amount_net || rpcResult.net_amount || 0),
      installments,
      tipo,
      settlementPlan: rpcResult.settlement_plan || rpcResult.plan || settlementPlan,
      webhookEventId: eventId || null,
      fromCache: isFromCache,
    },
    realMoney: false,
    environment: 'sandbox',
  });
}
