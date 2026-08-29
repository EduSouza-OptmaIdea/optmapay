// Edge Function: Webhook Dispatcher
// Dispara notificações HTTPS para os endpoints cadastrados pelos desenvolvedores
/// <reference path="../deno.d.ts" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { webhook_config_id, event, payload } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Busca configuração do webhook
    const { data: config, error: configError } = await supabase
      .from("webhooks_config")
      .select("*")
      .eq("id", webhook_config_id)
      .single();

    if (configError || !config) {
      throw new Error("Configuração de Webhook não encontrada.");
    }

    // Disparo HTTP POST com timeout de 5s
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let responseStatus = 0;
    let responseBody = "";

    try {
      const res = await fetch(config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-optmapay-event": event,
          "x-optmapay-real-money": "false",
          "x-optmapay-environment": "sandbox",
          "x-optmapay-secret": config.secret,
        },
        body: JSON.stringify({
          event,
          realMoney: false,
          environment: "sandbox",
          data: payload,
          timestamp: new Date().toISOString(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      responseStatus = res.status;
      responseBody = await res.text();
    } catch (err: any) {
      clearTimeout(timeout);
      responseStatus = 504;
      responseBody = err.message || "Timeout ou falha de conexão com endpoint de destino";
    }

    // Grava log de auditoria
    await supabase.from("webhooks_log").insert({
      user_id: config.user_id,
      webhook_config_id: config.id,
      event,
      payload,
      response_status: responseStatus,
      response_body: responseBody.slice(0, 1000),
      attempt_count: 1,
      delivered_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        success: responseStatus >= 200 && responseStatus < 300,
        status: responseStatus,
        body: responseBody,
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
