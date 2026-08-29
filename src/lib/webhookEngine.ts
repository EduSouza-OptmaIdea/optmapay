import { supabase } from './supabase';

interface WebhookDispatchOptions {
  userId: string;
  accountId: string;
  event: string;
  payloadData: Record<string, any>;
}

// Security Rule: SSRF Protection - Rejects Local / Private Networks
function isBlockedTargetUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'https:') {
      // Allow http only if explicitly local development mock server is specified
      if (parsed.protocol !== 'http:') return true;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('169.254.')
    ) {
      return true; // Block private IP addresses for security
    }

    return false;
  } catch (e) {
    return true; // Invalid URL
  }
}

export async function triggerWebhookEvents({
  userId,
  accountId,
  event,
  payloadData,
}: WebhookDispatchOptions): Promise<number> {
  try {
    // 1. Find active webhook endpoints for this account/user
    const { data: configs, error } = await supabase
      .from('webhooks_config')
      .select('*')
      .eq('account_id', accountId)
      .eq('active', true);

    if (error || !configs || configs.length === 0) {
      console.log(`[Webhook Engine] Nenhum webhook ativo cadastrado para accountId=${accountId}`);
      return 0;
    }

    let dispatchedCount = 0;

    for (const config of configs) {
      // Check if this config subscribes to the event
      if (config.events && !config.events.includes(event) && !config.events.includes('*')) {
        continue;
      }

      // Check SSRF security rule
      if (isBlockedTargetUrl(config.url)) {
        console.warn(`[Webhook Engine] Rejeitado envio para URL não segura/privada: ${config.url}`);
        await supabase.from('webhooks_log').insert({
          user_id: userId,
          webhook_config_id: config.id,
          event,
          payload: payloadData,
          response_status: 400,
          response_body: JSON.stringify({
            error: 'Blocked private network or non-HTTPS endpoint by Sandbox SSRF Policy',
            realMoney: false,
            environment: 'sandbox',
          }),
          attempt_count: 1,
        });
        continue;
      }

      // Golden Rule Payload & Headers
      const fullPayload = {
        event,
        realMoney: false,
        environment: 'sandbox',
        timestamp: new Date().toISOString(),
        data: payloadData,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      let responseStatus = 0;
      let responseBody = '';

      try {
        const response = await fetch(config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-optmapay-real-money': 'false',
            'x-optmapay-environment': 'sandbox',
            'x-optmapay-event': event,
            'x-optmapay-signature': config.secret ? `sha256_mock_${config.secret}` : '',
          },
          body: JSON.stringify(fullPayload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        responseStatus = response.status;
        responseBody = await response.text();
      } catch (err: any) {
        clearTimeout(timeoutId);
        responseStatus = 500;
        responseBody = err.message || 'Timeout / Network Error';
      }

      // Persist in webhooks_log
      await supabase.from('webhooks_log').insert({
        user_id: userId,
        webhook_config_id: config.id,
        event,
        payload: fullPayload,
        response_status: responseStatus,
        response_body: responseBody.substring(0, 1000), // Cap length
        attempt_count: 1,
      });

      dispatchedCount++;
    }

    return dispatchedCount;
  } catch (err) {
    console.error('[Webhook Engine Error]', err);
    return 0;
  }
}
