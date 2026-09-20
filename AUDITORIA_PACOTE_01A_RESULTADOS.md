# Relatório Detalhado de Implementação — Pacote 01A
**Auditoria de Segurança, Integridade Bancária e Resiliência**  
**Repositório Exclusivo:** `OptmaIdea/optmapay`  
**Ambiente:** `realMoney: false`, `environment: "sandbox"`  
**SHA do Commit:** `6e194351ec6c5083b8dbb071aab6343966e1d993`  

---

## 1. Sumário Executivo das Correções

| Item | Área | Status | Detalhes da Correção |
| :--- | :--- | :---: | :--- |
| **1** | RLS de Credenciais | **CONCLUÍDO** | Removidas policies de INSERT/UPDATE em `api_keys` e `webhooks_config` para `authenticated`. Removidas RPCs públicas `create_sandbox_api_key` e `revoke_sandbox_api_key`. Escrita de credenciais restrita exclusivamente a endpoints backend via `service_role` com validação de JWT + ownership da conta. Removido qualquer fallback admin → userClient. |
| **2** | Secrets Fail-Closed | **CONCLUÍDO** | Removido `DEFAULT_FALLBACK_MASTER_KEY`. `getWebhookMasterKey()` e `deriveSecretDeno()` agora lançam erro `CONFIG_ERROR` imediato se `OPTMAPAY_WEBHOOK_MASTER_KEY` não existir. `getSupabaseAdmin()` exige `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_URL`, nunca utilizando a anon key como fallback. |
| **3** | Processamento de Cartão | **CONCLUÍDO** | A RPC `process_card_payment` calcula taxas MDR autoritativamente no banco a partir do amount, tipo, parcelas e plano. É matematicamente impossível `net_amount > gross_amount`. Removido completamente o lookup por 4 dígitos (`card_number IS NULL AND masked_number LIKE ...RIGHT(...,4)`). Exige `p_card_id` ou `p_card_number` exato. Exigência estrita de CVV e data de validade com formato MM/AA e verificação de não-expiração (sem fallbacks "123"/"12/29"). |
| **4** | Idempotência Transacional | **CONCLUÍDO** | Claim da idempotency key + cálculo/movimentação bancária + resposta persistida agora formam uma única transação atômica em PostgreSQL via `api_idempotency_keys`. Reuso da mesma chave com payload idêntico retorna o cache persistido; reuso com payload diferente gera 409 `IDEMPOTENCY_KEY_REUSED`. |
| **5** | Correção do Pix | **CONCLUÍDO** | Removido o fallback do navegador que chamava `transfer_pix` diretamente em caso de falha da Edge Function. Adicionada chave de idempotência server-side persistida atomicamente com a transação. Em caso de timeout/erro de comunicação, o cliente concilia consultando o status da transação existente e nunca executa uma segunda mutação. |
| **6** | Endurecimento de Webhooks | **CONCLUÍDO** | `webhook-retry-worker` exige `OPTMAPAY_INTERNAL_DISPATCH_TOKEN`. Implementada RPC `claim_webhook_delivery_jobs` com `FOR UPDATE SKIP LOCKED`, garantindo que dois workers concorrentes nunca despachem a mesma tentativa. Retry manual valida ownership (`job -> config -> user_id`). Listagem no `webhook-config-manager` valida ownership de `accountId`. Corrigido identificador inexistente `supabase` em `rotate-secret`. |
| **7** | SSRF Fail-Closed & DNS Pinning | **CONCLUÍDO** | Validação SSRF agora bloqueia fail-closed quando o DNS A/AAAA não retorna registros (nunca retorna `valid: true` com `resolvedIps: []`). O transporte HTTP utiliza DNS Pinning conectando diretamente ao IP público validado no socket, preservando o cabeçalho `Host` e TLS SNI (`servername`) para o hostname legítimo, mitigando vulnerabilidade de DNS Rebinding. Redirecionamentos HTTP permanecem desativados. |
| **8** | Gates Obrigatórios | **CONCLUÍDO** | Mantidos os 63 testes unitários existentes e criados 46 novos testes de regressão (total: **109 testes 100% aprovados**). Criado `tsconfig.api.json` com validação de tipos de `api/**` (`npm run typecheck:api`). Executado `npx deno check` em todas as Edge Functions (`npm run check:edge`). Validado `npm run lint` e `npm run build` com sucesso. |

---

## 2. Histórico de Commits Criados e Publicados

| Commit SHA | Mensagem do Commit | Descrição dos Componentes |
| :--- | :--- | :--- |
| `c02ebea` | `fix(security): drop RLS write policies and enforce service_role with ownership validation` | Migração PostgreSQL, remoção de RPCs vulneráveis, fail-closed de secrets e remoção de fallbacks userClient em `api-keys.ts` e `webhooks.ts`. |
| `2b925e4` | `fix(banking): authoritative fee calculation and transactional idempotency for card payments` | Cálculo autoritativo de taxas no PostgreSQL, validação estrita de CVV/validade, remoção de lookup por 4 dígitos e transação de idempotência atômica. |
| `63aef26` | `fix(pix): server-side atomic idempotency and eliminate browser RPC fallback` | Remoção de fallback de RPC no browser, idempotência transacional no Pix e conciliação segura em caso de perda de comunicação. |
| `44ec274` | `fix(webhooks): fail-closed SSRF, DNS pinning transport and worker atomic job locking` | SSRF fail-closed em DNS vazio, DNS Pinning anti-rebinding com TLS SNI, autenticação por token interno no worker e claim com `SKIP LOCKED`. |
| `6e19435` | `test(gates): add typecheck:api, deno checks, and comprehensive audit regression tests` | `tsconfig.api.json`, script `typecheck:api`, script `check:edge`, 46 novos testes de regressão cobrindo RLS, finanças, Pix, SSRF e concorrência. |

**Branch:** `main`  
**Remotes sincronizados:**
- `edusouza`: `https://github.com/EduSouza-OptmaIdea/optmapay.git`
- `origin`: `https://github.com/OptmaIdea/optmapay.git`

---

## 3. Detalhamento Técnico das Implementações

### 3.1. Migração PostgreSQL (`20260920000000_audit_hardening_pacote_01a.sql`)
1. **Remoção de Políticas Inseguras de PostgREST:**
   - Drop de `api_keys_insert_policy`, `api_keys_update_policy`.
   - Drop de `webhooks_config_insert_policy`, `webhooks_config_update_policy`.
   - Drop de RPCs públicas `create_sandbox_api_key` e `revoke_sandbox_api_key`.
2. **RPC `claim_webhook_delivery_jobs`:**
   - Realiza `SELECT id FROM webhook_delivery_jobs WHERE status IN ('pending', 'retry') AND next_attempt_at <= now() ORDER BY next_attempt_at LIMIT p_limit FOR UPDATE SKIP LOCKED`.
   - Atualiza o status para `processing` com `locked_at = now()` e `locked_by = p_locked_by` atomicamente.
3. **RPC `process_card_payment` (Reformulada):**
   - Não aceita parâmetros de taxa ou líquido fornecidos pelo cliente.
   - Determina a taxa autoritativa via `CASE` no SQL conforme `p_tipo`, `p_installments` e `p_plan`.
   - Invariante matemática estrita: `v_net_amount := v_gross_amount - v_fee_amount;` com `v_net_amount <= v_gross_amount`.
   - Removeu completamente o lookup por 4 dígitos (`card_number IS NULL AND masked_number LIKE ...RIGHT(...,4)`), aceitando apenas `p_card_id` válido ou `p_card_number` integral e exato.
   - Exige CVV com 3 a 4 dígitos e data de validade MM/AA não expirada.
   - Gerencia a tabela `api_idempotency_keys` dentro da própria transação: verifica hash do request, detecta conflito 409 (`IDEMPOTENCY_KEY_REUSED`) e retorna cache se já finalizada.
4. **RPC `transfer_pix`:**
   - Integrada com `p_idempotency_key` e `p_request_hash`.
   - Executa a transferência e grava o resultado de idempotência dentro da mesma transação atômica.

### 3.2. Transporte Seguro de Webhooks com DNS Pinning Anti-Rebinding
- **Arquivo:** `api/_lib/dispatcher.ts`
- **Mecanismo:**
  1. A validação SSRF inspeciona o hostname e resolve seus registros DNS A/AAAA. Se nenhum registro for encontrado, bloqueia imediatamente (`fail-closed`).
  2. O primeiro IP público aprovado (`pinnedIp`) é selecionado.
  3. O envio HTTP POST é executado via `https.request` onde:
     - `host: pinnedIp`: o socket TCP conecta estritamente no IP previamente verificado contra SSRF.
     - `servername: targetUrl.hostname`: a extensão TLS SNI transmite o nome de domínio original para negociação do certificado SSL.
     - `headers.Host: targetUrl.host`: o cabeçalho HTTP Host mantém o domínio original da aplicação de destino.
     - Redirecionamentos permanecem estritamente inativos (não segue 3xx).

### 3.3. Testes de Regressão e Verificações de Tipagem
- **`npm run test:run`**: 109 testes aprovados em 10 arquivos de teste:
  - `tests/rlsSecurity.test.ts`: Prova isolamento entre contas e usuários, impedindo que Usuário A interaja com credenciais da Conta B.
  - `tests/financialHardening.test.ts`: Prova que `net_amount <= gross_amount` para todas as combinações de plano/parcelas, e rejeita requisições sem CVV ou validade.
  - `tests/pixHardening.test.ts`: Prova que na falha da Edge function o browser não invoca `transfer_pix` diretamente e concilia com mutação única.
  - `tests/webhookWorkerConcurrency.test.ts`: Prova que múltiplos workers concorrentes processam exatamente uma tentativa e valida o token interno.
  - `tests/ssrfDnsPinning.test.ts`: Prova bloqueio fail-closed em falhas de DNS e transporte pinado ao IP validado.
- **`npm run typecheck:api`**: Tipagem estrita de todas as rotas Vercel Serverless Functions com 0 erros.
- **`npm run check:edge`**: `npx deno check` em todas as Edge Functions com 0 erros.
- **`npm run lint`**: 0 advertências ou erros no ESLint.
- **`npm run build`**: Bundle de produção gerado com sucesso.
