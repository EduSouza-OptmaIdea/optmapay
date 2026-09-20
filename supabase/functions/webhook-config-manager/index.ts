// Edge Function: webhook-config-manager
// Gerencia endpoints de webhook com segredo derivado e validação de sessão
/// <reference path="../deno.d.ts" />
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deriveSecretDeno, processJobDispatch } from "../_shared/webhookDispatcher.ts";

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

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { action, accountId, url, events, configId, deliveryJobId } = body || {};

    // 1. LIST: Listar webhooks com validação estrita de ownership de accountId
    if (action === "list") {
      if (accountId) {
        const { data: acc, error: accErr } = await adminClient
          .from("accounts")
          .select("id")
          .eq("id", accountId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (accErr || !acc) {
          return new Response(JSON.stringify({ error: "Conta não encontrada ou não autorizada." }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      let query = adminClient
        .from("webhooks_config")
        .select("id, account_id, url, events, active, secret_last4, requires_secret_rotation, created_at");

      if (accountId) {
        query = query.eq("account_id", accountId);
      } else {
        const { data: userAccounts } = await adminClient.from("accounts").select("id").eq("user_id", user.id);
        const accIds = (userAccounts || []).map((a: any) => a.id);
        query = query.in("account_id", accIds.length > 0 ? accIds : ["00000000-0000-0000-0000-000000000000"]);
      }

      const { data: configs, error } = await query.order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ webhooks: configs || [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. CREATE
    if (action === "create") {
      if (!accountId || !url) {
        return new Response(JSON.stringify({ error: "accountId e url são obrigatórios." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: account } = await adminClient
        .from("accounts")
        .select("id")
        .eq("id", accountId)
        .eq("user_id", user.id)
        .single();

      if (!account) {
        return new Response(JSON.stringify({ error: "Conta não encontrada ou não autorizada." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newId = crypto.randomUUID();
      const derived = await deriveSecretDeno(newId);

      const { data: inserted, error: insErr } = await adminClient
        .from("webhooks_config")
        .insert({
          id: newId,
          user_id: user.id,
          account_id: accountId,
          url: url.trim(),
          events: Array.isArray(events) && events.length > 0 ? events : ["pix.paid", "card.paid", "order.paid"],
          secret_salt: derived.salt,
          secret_version: derived.version,
          secret_last4: derived.publicSecret.slice(-4),
          requires_secret_rotation: false,
          active: true,
        })
        .select("*")
        .single();

      if (insErr || !inserted) throw new Error(insErr?.message || "Falha ao criar webhook.");

      return new Response(
        JSON.stringify({
          id: inserted.id,
          accountId: inserted.account_id,
          url: inserted.url,
          events: inserted.events,
          active: inserted.active,
          webhookSecret: derived.publicSecret, // Revelado apenas na criação
          secretLast4: derived.publicSecret.slice(-4),
        }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. ROTATE-SECRET
    if (action === "rotate-secret") {
      if (!configId) {
        return new Response(JSON.stringify({ error: "configId é obrigatório." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: cfg } = await adminClient
        .from("webhooks_config")
        .select("*")
        .eq("id", configId)
        .eq("user_id", user.id)
        .single();

      if (!cfg) {
        return new Response(JSON.stringify({ error: "Configuração de webhook não encontrada." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const nextVersion = (cfg.secret_version || 1) + 1;
      const derived = await deriveSecretDeno(cfg.id, undefined, nextVersion);

      await adminClient
        .from("webhooks_config")
        .update({
          secret_salt: derived.salt,
          secret_version: derived.version,
          secret_last4: derived.publicSecret.slice(-4),
          requires_secret_rotation: false,
          active: true,
        })
        .eq("id", configId);

      return new Response(
        JSON.stringify({
          id: cfg.id,
          webhookSecret: derived.publicSecret, // Revelado apenas na rotação
          secretLast4: derived.publicSecret.slice(-4),
          version: derived.version,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. ACTIVATE / DEACTIVATE
    if (action === "activate" || action === "deactivate") {
      if (!configId) {
        return new Response(JSON.stringify({ error: "configId é obrigatório." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const active = action === "activate";
      await adminClient
        .from("webhooks_config")
        .update({ active })
        .eq("id", configId)
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true, active }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. RETRY (POR JOB_ID EXCLUSIVAMENTE, COM VALIDAÇÃO DE OWNERSHIP)
    if (action === "retry") {
      if (!deliveryJobId) {
        return new Response(JSON.stringify({ error: "deliveryJobId é obrigatório." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Valida ownership do job antes de despachar
      const { data: job, error: jobErr } = await adminClient
        .from("webhook_delivery_jobs")
        .select(`
          id,
          webhook_config_id,
          webhooks_config (
            user_id
          )
        `)
        .eq("id", deliveryJobId)
        .maybeSingle();

      if (jobErr || !job || !job.webhooks_config) {
        return new Response(JSON.stringify({ error: "Job de entrega não encontrado." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const jobOwner = (job.webhooks_config as any).user_id;
      if (jobOwner !== user.id) {
        return new Response(JSON.stringify({ error: "Acesso negado: o job de entrega não pertence ao seu usuário." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const dispatchResult = await processJobDispatch(adminClient, deliveryJobId, true);
      return new Response(JSON.stringify({ success: true, dispatchResult }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação não suportada." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
