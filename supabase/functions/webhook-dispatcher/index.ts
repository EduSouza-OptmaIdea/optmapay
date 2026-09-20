// Edge Function: Webhook Dispatcher
// Dispara notificações HTTPS autoritativas exclusivamente a partir de jobs do banco
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
    const internalToken = req.headers.get("x-optmapay-internal-token");
    const expectedToken = Deno.env.get("OPTMAPAY_INTERNAL_DISPATCH_TOKEN");
    const authHeader = req.headers.get("authorization") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // Validação de segurança: apenas chamadas autorizadas internas
    const isServiceRole = authHeader.includes(serviceRoleKey) && serviceRoleKey.length > 0;
    const isTokenValid = expectedToken && internalToken === expectedToken;

    if (!isServiceRole && !isTokenValid) {
      return new Response(
        JSON.stringify({ error: "Acesso não autorizado ao dispatcher interno." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { jobId, isManualRetry } = body || {};

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "O campo jobId é obrigatório. Não é permitido enviar URL/payload arbitrários." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const result = await processJobDispatch(supabase, jobId, Boolean(isManualRetry));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
