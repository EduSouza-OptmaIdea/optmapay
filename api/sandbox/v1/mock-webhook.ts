// Endpoint HTTPS público controlado para testes de Webhook e Retry no OptmaPay Sandbox
// Responde 500 no 1º disparo (x-optmapay-attempt: '1') e 200 no 2º disparo (x-optmapay-attempt: '2' ou superior),
// ecoando os cabeçalhos recebidos para validação criptográfica de HMAC pelo consumidor.

async function parseRequestBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk: any) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function sendResponse(res: any, status: number, payload: any) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json');
  }
  return res.end(JSON.stringify(payload));
}

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    let devWebhooksDiag = 'not_tested';
    try {
      await import('./dev/webhooks.ts');
      devWebhooksDiag = 'import_success';
    } catch (e: any) {
      devWebhooksDiag = `import_error: ${e.message} (code: ${e.code})`;
    }

    return sendResponse(res, 200, {
      status: 'ok',
      service: 'OptmaPay Controlled Mock Webhook Receiver',
      devWebhooksDiag,
      timestamp: new Date().toISOString(),
      realMoney: false,
      environment: 'sandbox',
    });
  }

  if (req.method !== 'POST') {
    return sendResponse(res, 405, { error: 'Method Not Allowed' });
  }

  const body = await parseRequestBody(req);

  // Headers enviados pelo dispatcher do OptmaPay
  const attempt = (req.headers['x-optmapay-attempt'] || req.headers['X-Optmapay-Attempt'] || '1').toString();
  const signature = req.headers['x-optmapay-signature'] || req.headers['X-Optmapay-Signature'] || '';
  const timestamp = req.headers['x-optmapay-timestamp'] || req.headers['X-Optmapay-Timestamp'] || '';
  const eventId = req.headers['x-optmapay-event-id'] || req.headers['X-Optmapay-Event-Id'] || '';
  const eventType = req.headers['x-optmapay-event'] || req.headers['X-Optmapay-Event'] || '';
  const deliveryId = req.headers['x-optmapay-delivery-id'] || req.headers['X-Optmapay-Delivery-Id'] || '';

  // 1ª Tentativa: Responde 500 para acionar a política de retry do OptmaPay
  if (attempt === '1') {
    console.log(`[MockWebhook] Attempt 1 recebida para evento ${eventId}. Respondendo HTTP 500 para teste de retry.`);
    return sendResponse(res, 500, {
      received: false,
      attempt,
      error: 'Simulated 500 Internal Server Error for OptmaPay Retry Testing',
      eventId,
      deliveryId,
      timestamp: new Date().toISOString(),
      realMoney: false,
      environment: 'sandbox',
    });
  }

  // 2ª Tentativa (ou superior): Responde 200 e ecoa os cabeçalhos para conferência de HMAC
  console.log(`[MockWebhook] Attempt ${attempt} recebida para evento ${eventId}. Respondendo HTTP 200 com echo de headers.`);
  return sendResponse(res, 200, {
    success: true,
    received: true,
    attempt,
    signature,
    timestamp,
    eventId,
    eventType,
    deliveryId,
    payload: body,
    echoedAt: new Date().toISOString(),
    realMoney: false,
    environment: 'sandbox',
  });
}
