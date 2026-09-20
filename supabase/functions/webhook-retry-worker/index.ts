// Edge Function: webhook-retry-worker
// Processa periodicamente jobs com status 'pending' ou 'retry' com next_attempt_at <= now()
/// <reference path="../deno.d.ts" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processJobDispatch } from "../_shared/webhookDispatcher.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-optmapay-internal-token",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Validação estrita de autenticação interna (OPTMAPAY_INTERNAL_DISPATCH_TOKEN)
    const expectedToken = Deno.env.get("OPTMAPAY_INTERNAL_DISPATCH_TOKEN");
    const incomingToken =
      req.headers.get("x-optmapay-internal-token") ||
      (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

    if (!expectedToken || !incomingToken || incomingToken !== expectedToken) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Token interno de dispatch ausente ou inválido." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const nowIso = new Date().toISOString();
    const workerId = `worker-${crypto.randomUUID()}`;

    // 2. Claim atômico usando RPC com FOR UPDATE SKIP LOCKED
    const { data: claimedJobs, error: claimErr } = await adminClient.rpc(
      "claim_webhook_delivery_jobs",
      {
        p_limit: 50,
        p_locked_by: workerId,
      }
    );

    if (claimErr) {
      throw new Error(`Erro ao realizar claim atômico de jobs: ${claimErr.message}`);
    }

    const results = [];
    for (const job of claimedJobs || []) {
      try {
        const dispatchRes = await processJobDispatch(adminClient, job.id, false);
        results.push({ jobId: job.id, success: dispatchRes.success, status: dispatchRes.status });
      } catch (jobErr: any) {
        results.push({ jobId: job.id, success: false, error: jobErr.message });
      }
    }

    return new Response(
      JSON.stringify({
        workerId,
        processedCount: results.length,
        results,
        executedAt: nowIso,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
