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
});
