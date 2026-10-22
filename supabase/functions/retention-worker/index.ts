// Edge Function: Data Retention Worker
// Executa verificações periódicas para retenção de 60 dias e envio de avisos (7, 2, 1 dia)
/// <reference path="../deno.d.ts" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAllowedRetentionMethod, isAuthorizedRetentionRequest } from "../_shared/retentionAuthorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-optmapay-internal-token",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!isAllowedRetentionMethod(req.method)) {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const expectedInternalSecret = Deno.env.get("OPTMAPAY_INTERNAL_DISPATCH_TOKEN");

    if (!isAuthorizedRetentionRequest(req, expectedInternalSecret, supabaseServiceKey)) {
      return new Response(JSON.stringify({ error: "Unauthorized internal operation." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only privileged callers can reach the service-role client or cleanup RPCs.
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Executa verificação de avisos (7, 2, 1 dia)
    const { data: warnings, error: warnError } = await supabase.rpc("check_data_retention_warnings");
    if (warnError) throw warnError;

    // 2. Executa a purga de contas que ultrapassaram 60 dias
    const { data: cleanup, error: cleanError } = await supabase.rpc("cleanup_expired_sandbox_data", {
      p_retention_days: 60,
    });
    if (cleanError) throw cleanError;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Rotina de retenção de 60 dias executada com sucesso.",
        warnings,
        cleanup,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
