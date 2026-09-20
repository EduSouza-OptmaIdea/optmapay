import { authenticateApiKey } from '../../../_lib/apiKeyAuth';
import { processIdempotency, completeIdempotency } from '../../../_lib/idempotency';
import { getSupabaseAdmin } from '../../../_lib/supabaseAdmin';
import { validateCardBin, calculateCardFee } from '../../../../src/lib/cardRules';
import { dispatchEventJobs } from '../../../_lib/dispatcher';
import { sendError, sendSuccess } from '../../../_lib/http';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Método ${req.method} não permitido. Utilize POST.`);
  }

  // 1. Autenticação e validação do escopo
  const auth = await authenticateApiKey(req, res, 'cards:charge');
  if (!auth) return;

  // 2. Idempotência server-side obrigatória
  const idempotencyKey = req.headers['idempotency-key'] as string;
  const idemp = await processIdempotency(
    res,
    auth.accountId,
    auth.key.id,
    'cards:charge',
    idempotencyKey,
    req.body
  );

  if (idemp.action === 'error') return;

  if (idemp.action === 'return_cached' && idemp.cachedResponse) {
    return res.status(idemp.cachedResponse.status).json(idemp.cachedResponse.body);
  }

  const {
    cardNumber,
    cardholderName,
    expirationDate,
    cvv,
    amount,
    installments = 1,
    tipo = 'credito',
    orderId,
    description,
    settlementPlan = 'standard',
  } = req.body || {};

  // 3. Validação rigorosa de dados de entrada
  if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
    return sendError(res, 400, 'MISSING_ORDER_ID', 'O campo orderId é obrigatório para conciliação.');
  }

  if (!expirationDate || typeof expirationDate !== 'string' || !expirationDate.trim()) {
    return sendError(res, 400, 'MISSING_EXPIRATION_DATE', 'A data de expiração do cartão (expirationDate no formato MM/AA) é obrigatória.');
  }

  if (!cvv || typeof cvv !== 'string' || !cvv.trim() || !/^\d{3,4}$/.test(cvv.trim())) {
    return sendError(res, 400, 'INVALID_CVV', 'O código de segurança CVV é obrigatório e deve conter 3 ou 4 dígitos numéricos.');
  }

  const cleanNumber = (cardNumber || '').replace(/\D/g, '');
  const binValidation = validateCardBin(cleanNumber);

  if (!binValidation.isValid) {
    return sendError(
      res,
      400,
      binValidation.isRealCardBlocked ? 'ERR_REAL_CARD_BLOCKED' : 'INVALID_CARD_NUMBER',
      binValidation.errorMessage || 'Cartão recusado no Sandbox.'
    );
  }

  const numAmount = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return sendError(res, 400, 'INVALID_AMOUNT', 'O valor da cobrança (amount) deve ser um número maior que zero.');
  }

  if (Math.round(numAmount * 100) / 100 !== numAmount) {
    return sendError(res, 400, 'INVALID_AMOUNT_PRECISION', 'O valor da cobrança deve ter no máximo 2 casas decimais.');
  }

  if (tipo !== 'debito' && tipo !== 'credito') {
    return sendError(res, 400, 'INVALID_CARD_TYPE', 'O tipo de pagamento deve ser "debito" ou "credito".');
  }

  const numInstallments = parseInt(installments, 10) || 1;
  if (tipo === 'debito' && numInstallments !== 1) {
    return sendError(res, 400, 'INVALID_INSTALLMENTS_DEBIT', 'Vendas na modalidade débito não aceitam parcelamento (installments deve ser 1).');
  }

  if (numInstallments < 1 || numInstallments > 12) {
    return sendError(res, 400, 'INVALID_INSTALLMENTS', 'Número de parcelas deve estar entre 1 e 12.');
  }

  if (description && description.length > 500) {
    return sendError(res, 400, 'DESCRIPTION_TOO_LONG', 'A descrição deve ter no máximo 500 caracteres.');
  }

  // 4. Execução do motor bancário real via RPC process_card_payment (taxas e idempotência 100% atômicas no PostgreSQL)
  const supabase = getSupabaseAdmin();
  const requestHash = idemp.requestHash || null;

  const { data: rpcResult, error: rpcErr } = await supabase.rpc('process_card_payment', {
    p_merchant_account_id: auth.accountId,
    p_card_number: cleanNumber,
    p_cardholder_name: cardholderName ? String(cardholderName).trim().toUpperCase() : 'CLIENTE SANDBOX',
    p_validade: String(expirationDate).trim(),
    p_cvv: String(cvv).trim(),
    p_amount: numAmount,
    p_tipo: tipo,
    p_installments: numInstallments,
    p_plan: settlementPlan || 'standard',
    p_description: description ? String(description).trim() : `Venda Pedido ${orderId}`,
    p_external_reference: orderId,
    p_idempotency_key: idempotencyKey || null,
    p_request_hash: requestHash,
  });

  if (rpcErr) {
    const msg = rpcErr.message || '';
    if (msg.includes('IDEMPOTENCY_KEY_REUSED')) {
      return sendError(res, 409, 'IDEMPOTENCY_KEY_REUSED', 'Esta Idempotency-Key já foi utilizada com parâmetros de requisição diferentes.');
    }
    return sendError(
      res,
      400,
      'PAYMENT_PROCESSING_FAILED',
      msg || 'Erro ao processar cobrança com cartão no banco de dados.'
    );
  }

  if (!rpcResult || !rpcResult.success) {
    const msg = rpcResult?.message || '';
    if (msg.includes('IDEMPOTENCY_KEY_REUSED') || rpcResult?.code === 'IDEMPOTENCY_KEY_REUSED') {
      return sendError(res, 409, 'IDEMPOTENCY_KEY_REUSED', 'Esta Idempotency-Key já foi utilizada com parâmetros de requisição diferentes.');
    }
    return sendError(
      res,
      422,
      rpcResult?.code || 'TRANSACTION_DECLINED',
      msg || 'Transação com cartão não autorizada.'
    );
  }

  // Se o resultado veio do cache de idempotência transacional persistido no PostgreSQL
  if (rpcResult.from_cache && rpcResult.cached_response) {
    return res.status(200).json(rpcResult.cached_response);
  }

  // 5. Resposta canônica estruturada autoritativa
  const responseData = {
    success: true,
    status: 'approved',
    message: 'Transação autorizada com sucesso no OptmaPay Sandbox!',
    data: {
      transactionId: rpcResult.transaction_in_id,
      orderId: orderId,
      amountGross: rpcResult.amount_gross || numAmount,
      feePercent: rpcResult.fee_percent,
      feeAmount: rpcResult.fee_amount,
      amountNet: rpcResult.amount_net,
      installments: numInstallments,
      tipo,
      settlementPlan: rpcResult.settlement_plan || settlementPlan,
      cardMasked: rpcResult.card_masked,
      cardBrand: 'OptmaCard',
      cardholderName: cardholderName || 'CLIENTE SANDBOX',
      authorizationCode: rpcResult.authorization_code,
      nsu: rpcResult.nsu,
      tid: rpcResult.tid,
      webhookEventId: rpcResult.webhook_event_id,
      createdAt: new Date().toISOString(),
    },
  };

  // Se havia registro intermediário pelo middleware Node, completa para compatibilidade
  if (idemp.recordId) {
    await completeIdempotency(
      idemp.recordId,
      200,
      responseData,
      'transaction',
      rpcResult.transaction_in_id
    );
  }

  // 6. Despacho assíncrono dos jobs de webhook gerados pelo PostgreSQL
  if (rpcResult.webhook_event_id) {
    dispatchEventJobs(rpcResult.webhook_event_id).catch(() => {});
  }

  return sendSuccess(res, 200, responseData);
}
