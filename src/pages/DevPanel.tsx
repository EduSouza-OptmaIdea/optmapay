import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { SandboxApiKey, SandboxWebhookConfig, SandboxWebhookLog } from '../types/sandbox';
import { Code2, Key, Globe, History, RefreshCw, Plus, Check, Copy, AlertTriangle } from 'lucide-react';

export const DevPanel: React.FC = () => {
  const { activeAccount } = useAuth();
  const [webhooks, setWebhooks] = useState<SandboxWebhookConfig[]>([]);
  const [logs, setLogs] = useState<SandboxWebhookLog[]>([]);
  const [apiKeys, setApiKeys] = useState<SandboxApiKey[]>([]);

  // Form states
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('sec_optmapay_live_9921');
  const [newKeyName, setNewKeyName] = useState('Chave Staging Vendas');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Retrying log ID
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);

  const fetchDevData = async () => {
    if (!activeAccount) return;

    // Fetch Webhooks Config
    const { data: wh } = await supabase
      .from('webhooks_config')
      .select('*')
      .eq('account_id', activeAccount.id);
    setWebhooks((wh || []) as SandboxWebhookConfig[]);

    // Fetch Webhook Logs
    let logQuery = supabase.from('webhooks_log').select('*');
    if (activeAccount.user_id) {
      logQuery = logQuery.eq('user_id', activeAccount.user_id);
    }
    const { data: lg } = await logQuery.order('delivered_at', { ascending: false }).limit(30);
    setLogs((lg || []) as SandboxWebhookLog[]);

    // Fetch API Keys
    let keyQuery = supabase.from('api_keys').select('*');
    if (activeAccount.user_id) {
      keyQuery = keyQuery.eq('user_id', activeAccount.user_id);
    }
    const { data: keys } = await keyQuery;
    setApiKeys((keys || []) as SandboxApiKey[]);
  };

  useEffect(() => {
    fetchDevData();
  }, [activeAccount]);

  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;

    await supabase.from('webhooks_config').insert({
      user_id: activeAccount.user_id || null,
      account_id: activeAccount.id,
      url: webhookUrl,
      events: ['pix.paid', 'boleto.paid', 'payment.settled', 'order.paid'],
      secret: webhookSecret,
      active: true,
    });

    setWebhookUrl('');
    await fetchDevData();
  };

  const handleGenerateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) return;

    const newKey = `sk_test_optmapay_${Math.random().toString(36).substring(2)}${Date.now()}`;

    await supabase.from('api_keys').insert({
      user_id: activeAccount.user_id || null,
      key_name: newKeyName,
      api_key: newKey,
      active: true,
    });

    setNewKeyName('');
    await fetchDevData();
  };

  // Manual Retry Webhook
  const handleRetryWebhook = async (log: SandboxWebhookLog) => {
    const config = webhooks.find((w) => w.id === log.webhook_config_id);
    if (!config) {
      alert('Configuração de webhook não encontrada para reenvio.');
      return;
    }

    setRetryingLogId(log.id);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-optmapay-real-money': 'false',
          'x-optmapay-environment': 'sandbox',
          'x-optmapay-event': log.event,
        },
        body: JSON.stringify(log.payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const status = response.status;
      const bodyText = await response.text();

      await supabase.from('webhooks_log').insert({
        user_id: log.user_id,
        webhook_config_id: config.id,
        event: log.event,
        payload: log.payload,
        response_status: status,
        response_body: `[RETRY] ${bodyText.substring(0, 500)}`,
        attempt_count: log.attempt_count + 1,
      });

      await fetchDevData();
      alert(`✅ Reenvio efetuado com Status ${status}!`);
    } catch (err: any) {
      alert(`❌ Erro no reenvio: ${err.message}`);
    } finally {
      setRetryingLogId(null);
    }
  };

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!activeAccount) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Code2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          Painel do Desenvolvedor (Webhooks & API)
        </h1>
        <p className="text-xs text-slate-500">
          Gerenciador de endpoints HTTPS, chaves de API e logs de auditoria em tempo real
        </p>
      </div>

      {/* Grid: Webhook Config + API Keys */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Webhooks Config */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Globe className="w-4 h-4 text-teal-600" />
            Cadastrar Endpoint de Webhook (HTTPS)
          </h2>

          <form onSubmit={handleAddWebhook} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                URL de Destino (HTTPS)
              </label>
              <input
                type="url"
                placeholder="https://sua-app.com/api/webhooks/optmapay"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Secret de Assinatura (HMAC)
              </label>
              <input
                type="text"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition shadow-md shadow-teal-900/20"
            >
              Salvar Endpoint Webhook
            </button>
          </form>

          {/* Endpoints Ativos */}
          <div className="pt-2 space-y-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Endpoints Cadastrados ({webhooks.length})
            </p>
            {webhooks.map((wh) => (
              <div key={wh.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                <p className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
                  {wh.url}
                </p>
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>Secret: {wh.secret}</span>
                  <span className="text-emerald-500 font-bold">ATIVO</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* API Keys */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Key className="w-4 h-4 text-purple-600" />
            Chaves de API Sandbox (`sk_test_...`)
          </h2>

          <form onSubmit={handleGenerateApiKey} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Nome de Identificação da Chave
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition shadow-md shadow-purple-900/20"
            >
              Gerar Nova Chave API Teste
            </button>
          </form>

          {/* Keys List */}
          <div className="pt-2 space-y-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Minhas Chaves (`x-api-key`)
            </p>
            {apiKeys.map((k) => (
              <div key={k.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200">{k.key_name}</span>
                  <button
                    onClick={() => copyText(k.id, k.api_key)}
                    className="text-slate-400 hover:text-teal-600"
                  >
                    {copiedKey === k.id ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="font-mono text-[11px] text-purple-600 dark:text-purple-400 truncate">
                  {k.api_key}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela de Logs de Entregas de Webhook */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <History className="w-4 h-4 text-amber-500" />
            Histórico de Disparos de Webhooks (Auditoria Supabase)
          </h2>

          <button
            onClick={fetchDevData}
            className="p-1.5 text-slate-400 hover:text-teal-600 transition"
            title="Atualizar Logs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            Nenhum disparo de webhook registrado ainda. Realize uma liquidação de Pix, Boleto ou Cartão para ver a auditoria em tempo real.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60 overflow-x-auto">
            {logs.map((log) => {
              const is2xx = log.response_status && log.response_status >= 200 && log.response_status < 300;
              return (
                <div key={log.id} className="py-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 font-mono">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          is2xx
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        HTTP {log.response_status || 'ERR'}
                      </span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{log.event}</span>
                      <span className="text-slate-400 text-[10px]">
                        • {new Date(log.delivered_at).toLocaleString('pt-BR')}
                      </span>
                    </div>

                    <button
                      onClick={() => handleRetryWebhook(log)}
                      disabled={retryingLogId === log.id}
                      className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 shrink-0"
                    >
                      <RefreshCw className={`w-3 h-3 ${retryingLogId === log.id ? 'animate-spin' : ''}`} />
                      <span>{retryingLogId === log.id ? 'Reenviando...' : 'Reenviar Webhook'}</span>
                    </button>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/80 font-mono text-[11px] overflow-x-auto">
                    <p className="text-slate-400 text-[10px] mb-1">Payload JSON Enviado:</p>
                    <pre className="text-teal-700 dark:text-teal-400">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
