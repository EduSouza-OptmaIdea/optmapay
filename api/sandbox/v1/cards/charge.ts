import { authenticateApiKey } from '../../../_lib/apiKeyAuth';
import { hashRequestBody } from '../../../_lib/idempotency';
import { getSupabaseAdmin } from '../../../_lib/supabaseAdmin';
import { validateCardBin } from '../../../../src/lib/cardRules';
import { dispatchEventJobs } from '../../../_lib/dispatcher';
import { sendError, sendSuccess } from '../../../_lib/http';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Método ${req.method} não permitido. Utilize POST.`);
  }

  // 1. Autenticação e validação do escopo
  const auth = await authenticateApiKey(req, res, 'cards:charge');
  if (!auth) return;

  // 2. Validação estrita de Idempotência (Validação de formato e cálculo canônico de hash na camada Node)
  const rawIdempotencyKey = req.headers['idempotency-key'] as string;
  if (!rawIdempotencyKey || typeof rawIdempotencyKey !== 'string' || !rawIdempotencyKey.trim()) {
    return sendError(res, 400, 'MISSING_IDEMPOTENCY_KEY', 'Header Idempotency-Key é obrigatório para operações de cobrança.');
  }

  const idempotencyKey = rawIdempotencyKey.trim();
  if (idempotencyKey.length < 1 || idempotencyKey.length > 128) {
    return sendError(res, 400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key deve conter entre 1 e 128 caracteres.');
  }

  const requestHash = hashRequestBody(req.body);

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

  const { data: rpcResult, error: rpcErr } = await supabase.rpc('process_card_payment', {
    p_merchant_account_id: auth.accountId,
    p_api_key_id: auth.key.id,
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
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
  });

  if (rpcErr) {
    const msg = rpcErr.message || '';
    if (msg.includes('IDEMPOTENCY_KEY_REUSED')) {
      return sendError(res, 409, 'IDEMPOTENCY_KEY_REUSED', 'Esta Idempotency-Key já foi utilizada com parâmetros de requisição diferentes.');
    }
    if (msg.includes('IDEMPOTENCY_IN_PROGRESS')) {
      return sendError(res, 409, 'IDEMPOTENCY_IN_PROGRESS', 'Uma requisição com esta Idempotency-Key já está em andamento.');
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

  // 5. Resposta canônica estruturada autoritativa (Contrato normalizado tanto no 1º processamento quanto no replay)
  const isFromCache = Boolean(rpcResult.from_cache);
  const responseData = {
    success: true,
    status: 'approved',
    message: isFromCache
      ? 'Transação recuperada com sucesso via cache de idempotência (OptmaPay Sandbox)!'
      : 'Transação autorizada com sucesso no OptmaPay Sandbox!',
    data: {
      transactionId: rpcResult.transaction_in_id || rpcResult.transactionId,
      orderId: orderId,
      // Contrato alinhado: gross_amount/net_amount/plan vs amount_gross/amount_net/settlement_plan
      amountGross: Number(rpcResult.amount_gross || rpcResult.gross_amount || numAmount),
      grossAmount: Number(rpcResult.amount_gross || rpcResult.gross_amount || numAmount),
      amount_gross: Number(rpcResult.amount_gross || rpcResult.gross_amount || numAmount),
      gross_amount: Number(rpcResult.amount_gross || rpcResult.gross_amount || numAmount),

      feePercent: Number(rpcResult.fee_percent ?? rpcResult.feePercent),
      fee_percent: Number(rpcResult.fee_percent ?? rpcResult.feePercent),

      feeAmount: Number(rpcResult.fee_amount ?? rpcResult.feeAmount),
      fee_amount: Number(rpcResult.fee_amount ?? rpcResult.feeAmount),

      amountNet: Number(rpcResult.amount_net || rpcResult.net_amount),
      netAmount: Number(rpcResult.amount_net || rpcResult.net_amount),
      amount_net: Number(rpcResult.amount_net || rpcResult.net_amount),
      net_amount: Number(rpcResult.amount_net || rpcResult.net_amount),

      installments: numInstallments,
      tipo,
      settlementPlan: rpcResult.settlement_plan || rpcResult.plan || settlementPlan,
      plan: rpcResult.settlement_plan || rpcResult.plan || settlementPlan,
      settlement_plan: rpcResult.settlement_plan || rpcResult.plan || settlementPlan,

      cardMasked: rpcResult.card_masked || rpcResult.cardMasked,
      cardBrand: 'OptmaCard',
      cardholderName: cardholderName || 'CLIENTE SANDBOX',
      authorizationCode: rpcResult.authorization_code || rpcResult.authorizationCode,
      nsu: rpcResult.nsu,
      tid: rpcResult.tid,
      webhookEventId: rpcResult.webhook_event_id || rpcResult.webhookEventId,
      createdAt: rpcResult.created_at || rpcResult.createdAt || new Date().toISOString(),
      fromCache: isFromCache,
    },
  };

  // 6. Despacho assíncrono dos jobs de webhook gerados pelo PostgreSQL (apenas na 1ª execução)
  if (!isFromCache && rpcResult.webhook_event_id) {
    dispatchEventJobs(rpcResult.webhook_event_id).catch(() => {});
  }

  return sendSuccess(res, 200, responseData);
}
