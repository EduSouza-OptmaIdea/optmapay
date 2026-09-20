// Edge Function: pix-transfer
// Executa transferência Pix via RPC transfer_pix atômica e orquestra despacho imediato de webhooks server-side
/// <reference path="../deno.d.ts" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processJobDispatch } from "../_shared/webhookDispatcher.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Sessão não informada." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // Cliente com token do usuário para validação de sessão
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Sessão de usuário inválida ou expirada." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { senderAccountId, destPixKeyOrPayload, amount, description, externalReference } = body || {};

    if (!senderAccountId || !destPixKeyOrPayload || !amount) {
      return new Response(JSON.stringify({ error: "Parâmetros obrigatórios ausentes." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente admin para execução atômica e disparo de jobs
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Valida que senderAccountId pertence a user.id
    const { data: senderAcc, error: senderErr } = await adminClient
      .from("accounts")
      .select("id, user_id, balance, name, pix_key")
      .eq("id", senderAccountId)
      .single();

    if (senderErr || !senderAcc || senderAcc.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Conta de origem não autorizada para este usuário." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Invoca a RPC atômica transfer_pix
    const { data: rpcResult, error: rpcErr } = await adminClient.rpc("transfer_pix", {
      p_sender_account_id: senderAccountId,
      p_receiver_pix_key: destPixKeyOrPayload,
      p_amount: Number(amount),
      p_description: description || "Transferência Pix Sandbox",
      p_external_reference: externalReference || null,
    });

    if (rpcErr) {
      return new Response(JSON.stringify({ error: rpcErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!rpcResult || !rpcResult.success) {
      return new Response(JSON.stringify({ error: "Falha na transferência Pix." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Dispara imediatamente os delivery jobs gerados para o evento criado no banco
    let webhooksDispatched = 0;
    if (rpcResult.webhook_event_id) {
      const { data: pendingJobs } = await adminClient
        .from("webhook_delivery_jobs")
        .select("id")
        .eq("event_id", rpcResult.webhook_event_id)
        .eq("status", "pending");

      if (pendingJobs && pendingJobs.length > 0) {
        for (const job of pendingJobs) {
          processJobDispatch(adminClient, job.id, false).catch((err: any) => {
            console.warn(`[Pix Webhook Dispatch Warning for Job ${job.id}]`, err);
          });
          webhooksDispatched++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: rpcResult.message,
        amount: rpcResult.amount,
        senderName: rpcResult.sender_name,
        receiverName: rpcResult.receiver_name,
        senderAccountId: rpcResult.sender_account_id,
        receiverAccountId: rpcResult.receiver_account_id,
        transactionOutId: rpcResult.transaction_out_id,
        transactionInId: rpcResult.transaction_in_id,
        webhookEventId: rpcResult.webhook_event_id,
        webhooksDispatched,
        externalReference: externalReference || null,
        transactionDate: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
