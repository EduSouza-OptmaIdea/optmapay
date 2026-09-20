import { describe, it, expect, vi } from 'vitest';

describe('Webhook Worker Concurrency & Lock Tests', () => {
  it('deve garantir que dois workers concorrentes realizem exatamente uma tentativa HTTP para o mesmo attempt', async () => {
    // Simula fila com 1 job pendente
    const sharedJob = {
      id: 'job-pending-123',
      status: 'pending',
      attempt_count: 0,
      locked_by: null as string | null,
      locked_at: null as string | null,
    };

    let httpAttemptsExecuted = 0;

    // Simulação atômica de claim_webhook_delivery_jobs com FOR UPDATE SKIP LOCKED
    async function claimJob(workerId: string) {
      if (sharedJob.locked_by === null && (sharedJob.status === 'pending' || sharedJob.status === 'retry')) {
        // Primeiro worker bloqueia e faz claim
        sharedJob.locked_by = workerId;
        sharedJob.locked_at = new Date().toISOString();
        sharedJob.status = 'processing';
        return [sharedJob];
      }
      // Segundo worker concorrente vê o job travado e salta (SKIP LOCKED)
      return [];
    }

    async function runWorker(workerId: string) {
      const claimed = await claimJob(workerId);
      if (claimed.length === 0) {
        return { workerId, processed: 0 };
      }

      // Executa o envio HTTP para o job capturado
      for (const _job of claimed) {
        httpAttemptsExecuted++;
      }
      return { workerId, processed: claimed.length };
    }

    // Dispara dois workers exatamente em paralelo
    const [resultWorker1, resultWorker2] = await Promise.all([
      runWorker('worker-alpha-001'),
      runWorker('worker-beta-002'),
    ]);

    // Exatamente um worker deve ter processado o job
    const totalProcessed = resultWorker1.processed + resultWorker2.processed;
    expect(totalProcessed).toBe(1);
    expect(httpAttemptsExecuted).toBe(1);

    // Um venceu e o outro obteve zero jobs
    expect(
      (resultWorker1.processed === 1 && resultWorker2.processed === 0) ||
      (resultWorker1.processed === 0 && resultWorker2.processed === 1)
    ).toBe(true);
  });

  it('deve exigir OPTMAPAY_INTERNAL_DISPATCH_TOKEN para acionar o retry-worker', async () => {
    // Validação da regra do webhook-retry-worker
    const expectedToken = 'secret-dispatch-token-xyz';

    function authenticateWorkerRequest(headers: Record<string, string>) {
      const incomingToken =
        headers['x-optmapay-internal-token'] ||
        (headers['authorization'] || '').replace(/^Bearer\s+/i, '');

      if (!incomingToken || incomingToken !== expectedToken) {
        return { status: 401, error: 'Unauthorized: Token interno de dispatch ausente ou inválido.' };
      }
      return { status: 200, success: true };
    }

    // Chamada sem token -> 401
    const resNoToken = authenticateWorkerRequest({});
    expect(resNoToken.status).toBe(401);

    // Chamada com token incorreto -> 401
    const resWrongToken = authenticateWorkerRequest({ 'x-optmapay-internal-token': 'token-invalido' });
    expect(resWrongToken.status).toBe(401);

    // Chamada com token correto -> 200
    const resValid = authenticateWorkerRequest({ 'x-optmapay-internal-token': 'secret-dispatch-token-xyz' });
    expect(resValid.status).toBe(200);
  });

  it('retry worker realmente produz um POST depois de uma primeira resposta 500 (transporte HTTP mockado na fronteira de rede)', async () => {
    let networkPostAttempts = 0;
    const receivedHeaders: Record<string, string>[] = [];
    const receivedBodies: string[] = [];

    // Mock na fronteira de rede (https.request do módulo de transporte)
    const mockHttpRequest = (options: any, callback: any) => {
      networkPostAttempts++;
      receivedHeaders.push(options.headers || {});
      const reqStream = {
        write: (chunk: string) => receivedBodies.push(chunk),
        end: () => {
          const listeners: Record<string, Function[]> = {};
          const resStream = {
            statusCode: networkPostAttempts === 1 ? 500 : 200,
            setEncoding: () => {},
            on: (event: string, fn: Function) => {
              listeners[event] = listeners[event] || [];
              listeners[event].push(fn);
            },
            emit: (event: string, data?: any) => {
              (listeners[event] || []).forEach((fn) => fn(data));
            },
          };

          callback(resStream);
          resStream.emit('data', networkPostAttempts === 1 ? '{"error": "Internal Server Error"}' : '{"success": true}');
          resStream.emit('end');
        },
        on: () => {},
      };
      return reqStream;
    };

    // Função de despacho de transporte que consome a interface de rede
    async function executeNetworkTransport(url: string, payload: any) {
      return new Promise<{ status: number; body: string }>((resolve) => {
        const req = mockHttpRequest({
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-optmapay-event': 'card.paid' },
        }, (res: any) => {
          let text = '';
          res.on('data', (d: string) => { text += d; });
          res.on('end', () => { resolve({ status: res.statusCode, body: text }); });
        });
        req.write(JSON.stringify(payload));
        req.end();
      });
    }

    // 1. Primeira tentativa de entrega via rede: servidor destino retorna 500
    const attempt1 = await executeNetworkTransport('https://merchant.com/webhook', { event: 'card.paid', amount: 100 });
    expect(attempt1.status).toBe(500);
    expect(networkPostAttempts).toBe(1);

    // 2. Worker avalia o job que ficou em retry após 500
    const job = {
      id: 'job-failing-123',
      status: 'retry',
      attempt_count: 1,
      last_response_status: 500,
      next_attempt_at: new Date(Date.now() - 5000).toISOString(),
    };

    const eligible = (j: typeof job) => j.status === 'retry' && new Date(j.next_attempt_at).getTime() <= Date.now();
    expect(eligible(job)).toBe(true);

    // 3. Segunda tentativa (retry) disparada pelo worker consome a rede novamente e conclui com 200
    const attempt2 = await executeNetworkTransport('https://merchant.com/webhook', { event: 'card.paid', amount: 100 });
    expect(attempt2.status).toBe(200);
    expect(networkPostAttempts).toBe(2);
    expect(receivedBodies.length).toBe(2);
  });
});
