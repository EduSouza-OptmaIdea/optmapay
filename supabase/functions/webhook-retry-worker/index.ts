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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const nowIso = new Date().toISOString();

    // Busca até 50 jobs elegíveis para retry/entrega
    const { data: eligibleJobs, error } = await adminClient
      .from("webhook_delivery_jobs")
      .select("id, status, attempt_count, next_attempt_at")
      .in("status", ["pending", "retry"])
      .lte("next_attempt_at", nowIso)
      .order("next_attempt_at", { ascending: true })
      .limit(50);

    if (error) {
      throw new Error(`Erro ao buscar jobs para retry: ${error.message}`);
    }

    const results = [];
    for (const job of eligibleJobs || []) {
      try {
        const dispatchRes = await processJobDispatch(adminClient, job.id, false);
        results.push({ jobId: job.id, success: dispatchRes.success, status: dispatchRes.status });
      } catch (jobErr: any) {
        results.push({ jobId: job.id, success: false, error: jobErr.message });
      }
    }

    return new Response(
      JSON.stringify({
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
