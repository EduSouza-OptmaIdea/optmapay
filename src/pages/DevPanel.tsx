import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { SandboxApiKey, SandboxWebhookConfig, SandboxWebhookLog } from '../types/sandbox';
import {
  Code2,
  Key,
  Globe,
  History,
  RefreshCw,
  Plus,
  Check,
  Copy,
  AlertTriangle,
  ShieldAlert,
  Lock,
  Trash2,
  CheckCircle2,
  X,
  RotateCw,
} from 'lucide-react';

export const DevPanel: React.FC = () => {
  const { activeAccount } = useAuth();
  const [webhooks, setWebhooks] = useState<SandboxWebhookConfig[]>([]);
  const [logs, setLogs] = useState<SandboxWebhookLog[]>([]);
  const [apiKeys, setApiKeys] = useState<SandboxApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);

  // Form states
  const [webhookUrl, setWebhookUrl] = useState('');
  const [newKeyName, setNewKeyName] = useState('Chave Staging Vendas');
  const [creatingKey, setCreatingKey] = useState(false);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal de revelação de chave única vez
  const [revealedKeyModal, setRevealedKeyModal] = useState<{
    keyName: string;
    fullKey: string;
    prefix: string;
    last4: string;
  } | null>(null);

  // Modal de revelação de segredo do webhook única vez
  const [revealedSecretModal, setRevealedSecretModal] = useState<{
    url: string;
    webhookSecret: string;
    isRotation?: boolean;
  } | null>(null);

  // Retrying log ID
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);
  const [rotatingConfigId, setRotatingConfigId] = useState<string | null>(null);

  const getSessionToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  };

  const fetchDevData = useCallback(async () => {
    if (!activeAccount?.id) return;

    // 1. Fetch API Keys via endpoint seguro
    setLoadingKeys(true);
    try {
      const token = await getSessionToken();
      if (token) {
        const res = await fetch(`/api/sandbox/v1/dev/api-keys?accountId=${activeAccount.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.keys) {
          setApiKeys(data.keys);
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar chaves:', e);
    } finally {
      setLoadingKeys(false);
    }

    // 2. Fetch Webhooks Config via endpoint seguro
    setLoadingWebhooks(true);
    try {
      const token = await getSessionToken();
      if (token) {
        const res = await fetch(`/api/sandbox/v1/dev/webhooks?accountId=${activeAccount.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.webhooks) {
          setWebhooks(data.webhooks);
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar webhooks:', e);
    } finally {
      setLoadingWebhooks(false);
    }

    // 3. Fetch Webhook Logs (Auditoria)
    let logQuery = supabase.from('webhooks_log').select('*');
    if (activeAccount.user_id) {
      logQuery = logQuery.eq('user_id', activeAccount.user_id);
    }
    const { data: lg } = await logQuery.order('delivered_at', { ascending: false }).limit(30);
    setLogs((lg || []) as SandboxWebhookLog[]);
  }, [activeAccount?.id, activeAccount?.user_id]);

  useEffect(() => {
    fetchDevData();
  }, [fetchDevData]);

  // Criação de Endpoint Webhook via backend com segredo derivado
  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount || creatingWebhook) return;

    setCreatingWebhook(true);
    try {
      const token = await getSessionToken();
      const res = await fetch('/api/sandbox/v1/dev/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'create',
          accountId: activeAccount.id,
          url: webhookUrl.trim(),
          events: ['pix.paid', 'card.paid', 'order.paid'],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Falha ao cadastrar webhook.');
      }

      setWebhookUrl('');
      setRevealedSecretModal({
        url: data.url,
        webhookSecret: data.webhookSecret,
        isRotation: false,
      });

      await fetchDevData();
    } catch (err: any) {
      alert(`❌ ${err.message}`);
    } finally {
      setCreatingWebhook(false);
    }
  };

  // Rotação de Segredo de Webhook
  const handleRotateSecret = async (configId: string, url: string) => {
    if (!confirm('Deseja rotacionar o segredo deste webhook? A assinatura anterior deixará de funcionar imediatamente.')) {
      return;
    }

    setRotatingConfigId(configId);
    try {
      const token = await getSessionToken();
      const res = await fetch('/api/sandbox/v1/dev/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'rotate-secret',
          configId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Falha ao rotacionar segredo.');
      }

      setRevealedSecretModal({
        url,
        webhookSecret: data.webhookSecret,
        isRotation: true,
      });

      await fetchDevData();
    } catch (err: any) {
      alert(`❌ ${err.message}`);
    } finally {
      setRotatingConfigId(null);
    }
  };

  // Criação de API Key no backend com CSPRNG e hash SHA-256
  const handleGenerateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount || creatingKey) return;

    setCreatingKey(true);
    try {
      const token = await getSessionToken();
      const res = await fetch('/api/sandbox/v1/dev/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          accountId: activeAccount.id,
          keyName: newKeyName.trim() || 'Chave Sandbox API',
          scopes: ['account:read', 'transactions:read', 'cards:charge', 'pix:transfer', 'refunds:create'],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Falha ao gerar chave.');
      }

      setNewKeyName('');
      setRevealedKeyModal({
        keyName: data.keyName,
        fullKey: data.fullKey,
        prefix: data.prefix,
        last4: data.last4,
      });

      await fetchDevData();
    } catch (err: any) {
      alert(`❌ ${err.message}`);
    } finally {
      setCreatingKey(false);
    }
  };

  // Revogação de API Key
  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Deseja realmente revogar esta chave de API? Esta ação é irreversível.')) {
      return;
    }

    try {
      const token = await getSessionToken();
      const res = await fetch(`/api/sandbox/v1/dev/api-keys?id=${keyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Falha ao revogar chave.');
      }

      await fetchDevData();
    } catch (err: any) {
      alert(`❌ ${err.message}`);
    }
  };

  // Reenvio manual baseado exclusivamente em delivery_job_id via backend
  const handleRetryWebhook = async (log: SandboxWebhookLog) => {
    const jobId = log.delivery_job_id || log.id;
    setRetryingLogId(log.id);

    try {
      const token = await getSessionToken();
      const res = await fetch('/api/sandbox/v1/dev/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'retry-delivery',
          deliveryJobId: jobId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Falha no reenvio.');
      }

      await fetchDevData();
      alert(`✅ Reenvio orquestrado pelo servidor com status: ${data.dispatchResult?.status || 'processado'}!`);
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
          Painel do Desenvolvedor (Webhooks & API Hardening)
        </h1>
        <p className="text-xs text-slate-500">
          Gerenciador de endpoints HTTPS protegidos contra SSRF, chaves CSPRNG armazenadas com SHA-256 e auditoria imutável
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
              <p className="text-[10px] text-slate-400 mt-1">
                O segredo de assinatura HMAC-SHA256 v1 será derivado no servidor e exibido uma única vez.
              </p>
            </div>
            <button
              type="submit"
              disabled={creatingWebhook}
              className="w-full py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition shadow-md shadow-teal-900/20 flex items-center justify-center gap-2"
            >
              {creatingWebhook ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Salvar Endpoint Webhook</span>
            </button>
          </form>

          {/* Endpoints Ativos */}
          <div className="pt-2 space-y-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Endpoints Cadastrados ({webhooks.length})
            </p>
            {webhooks.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Nenhum endpoint cadastrado.</p>
            ) : (
              webhooks.map((wh) => (
                <div key={wh.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
                  <p className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
                    {wh.url}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>
                      Secret: {wh.secret_last4 ? `••••${wh.secret_last4}` : 'Não rotacionado'}
                    </span>
                    {wh.requires_secret_rotation ? (
                      <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> Requer Rotação
                      </span>
                    ) : (
                      <span className="text-emerald-500 font-bold">ATIVO (HMAC v1)</span>
                    )}
                  </div>
                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      Eventos: {wh.events?.join(', ')}
                    </span>
                    <button
                      onClick={() => handleRotateSecret(wh.id, wh.url)}
                      disabled={rotatingConfigId === wh.id}
                      className="px-2 py-0.5 text-[10px] rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-200 transition font-semibold flex items-center gap-1"
                      title="Rotacionar Segredo do Webhook"
                    >
                      <RotateCw className={`w-2.5 h-2.5 ${rotatingConfigId === wh.id ? 'animate-spin' : ''}`} />
                      <span>Rotacionar Segredo</span>
                    </button>
                  </div>
                </div>
              ))
            )}
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
                placeholder="Ex: OptmaMenu Produção Sandbox"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                required
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Gerada com CSPRNG e armazenada apenas como SHA-256. A chave completa é exibida uma única vez.
              </p>
            </div>
            <button
              type="submit"
              disabled={creatingKey}
              className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition shadow-md shadow-purple-900/20 flex items-center justify-center gap-2"
            >
              {creatingKey ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Gerar Nova Chave API Segura</span>
            </button>
          </form>

          {/* Keys List */}
          <div className="pt-2 space-y-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Minhas Chaves Registradas ({apiKeys.length})
            </p>
            {apiKeys.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Nenhuma chave registrada para esta conta.</p>
            ) : (
              apiKeys.map((k) => (
                <div key={k.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {k.key_name || k.keyName || 'Chave Sandbox API'}
                    </span>
                    <div className="flex items-center gap-2">
                      {k.active ? (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                          ATIVA
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                          REVOGADA
                        </span>
                      )}
                      {k.active && (
                        <button
                          onClick={() => handleRevokeKey(k.id)}
                          className="text-slate-400 hover:text-rose-600 transition"
                          title="Revogar chave"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="font-mono text-[11px] text-purple-600 dark:text-purple-400 truncate">
                    {(k.key_prefix || k.prefix)
                      ? `${k.key_prefix || k.prefix}_••••${k.key_last4 || k.last4 || ''}`
                      : 'Chave Legada Inativa'}
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(k.scopes || []).map((sc) => (
                      <span
                        key={sc}
                        className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[9px] font-mono"
                      >
                        {sc}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Tabela de Logs de Entregas de Webhook (Auditoria Imutável) */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <History className="w-4 h-4 text-amber-500" />
            Histórico de Entregas de Webhooks (Auditoria Imutável)
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
            Nenhum disparo de webhook registrado ainda. Realize uma movimentação autoritativa (Pix ou Cartão) para ver os logs.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60 overflow-x-auto">
            {logs.map((log) => {
              const is2xx = log.response_status && log.response_status >= 200 && log.response_status < 300;
              return (
                <div key={log.id} className="py-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 font-mono flex-wrap">
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
                        Tentativa #{log.attempt_no || log.attempt_count || 1}
                      </span>
                      {log.duration_ms !== undefined && (
                        <span className="text-slate-400 text-[10px]">• {log.duration_ms}ms</span>
                      )}
                      {log.is_manual_retry && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[9px] font-bold">
                          RETRY MANUAL
                        </span>
                      )}
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

      {/* Modal: Revelação de API Key Gerada UMA ÚNICA VEZ */}
      {revealedKeyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-600">
                <Lock className="w-5 h-5" />
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                  Nova Chave de API Gerada com Sucesso
                </h3>
              </div>
              <button
                onClick={() => setRevealedKeyModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-200 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Aviso de Segurança Crítico</span>
              </div>
              <p>
                Copie sua chave de API agora. Por motivos de conformidade, ela é armazenada exclusivamente como hash SHA-256 no banco de dados e <strong>NUNCA será exibida novamente</strong> após o fechamento deste modal.
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Chave Completa (`Bearer Token`):
              </span>
              <div className="flex items-center gap-2 p-3 bg-slate-900 rounded-xl font-mono text-xs text-purple-300 break-all select-all">
                <span>{revealedKeyModal.fullKey}</span>
                <button
                  onClick={() => copyText('revealed_key', revealedKeyModal.fullKey)}
                  className="ml-auto p-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded-lg shrink-0 transition"
                  title="Copiar Chave"
                >
                  {copiedKey === 'revealed_key' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setRevealedKeyModal(null)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition"
              >
                Entendi e já copiei a chave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Revelação de Segredo do Webhook UMA ÚNICA VEZ */}
      {revealedSecretModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-teal-600">
                <Globe className="w-5 h-5" />
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                  {revealedSecretModal.isRotation ? 'Segredo Rotacionado' : 'Segredo do Webhook Gerado'}
                </h3>
              </div>
              <button
                onClick={() => setRevealedSecretModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-xl text-teal-800 dark:text-teal-200 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <ShieldAlert className="w-4 h-4 text-teal-600" />
                <span>Segredo de Assinatura HMAC-SHA256 v1</span>
              </div>
              <p>
                Configure este segredo na sua aplicação para validar o header <code>x-optmapay-signature: v1=&lt;hex&gt;</code>. Ele é recalculado dinamicamente pelo backend e <strong>não é gravado em texto puro</strong> no banco de dados.
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Segredo Derivado (`whsec_optmapay_...`):
              </span>
              <div className="flex items-center gap-2 p-3 bg-slate-900 rounded-xl font-mono text-xs text-teal-300 break-all select-all">
                <span>{revealedSecretModal.webhookSecret}</span>
                <button
                  onClick={() => copyText('revealed_secret', revealedSecretModal.webhookSecret)}
                  className="ml-auto p-1.5 bg-teal-700 hover:bg-teal-600 text-white rounded-lg shrink-0 transition"
                  title="Copiar Segredo"
                >
                  {copiedKey === 'revealed_secret' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setRevealedSecretModal(null)}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition"
              >
                Salvar e Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
