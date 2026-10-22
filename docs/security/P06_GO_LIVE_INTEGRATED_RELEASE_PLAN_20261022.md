# OptmaPay P0.6 — Pacote integrado de segurança, release e entrada em operação
**Auditoria:** 22/10/2026 | **Projeto principal:** OptmaPay (`wertmoquxdrucdbobuie`) | **Status:** homologação aprovada parcialmente; produção sem alterações.

## 1. Objetivo de negócio
Avançar da auditoria isolada para uma liberação controlada e mensurável, sem perder segurança, dados ou histórico financeiro. A estratégia é publicar em pequenas etapas transacionais **depois** que as dependências, cópias de segurança e critérios de reversão estiverem validados. O usuário precisa colocar as aplicações em funcionamento, mas publicar o sandbox de simulação **não autoriza movimentar dinheiro real como intermediário financeiro**.

O **OptmaPay** permanece um motor financeiro **sandbox** (`environment='sandbox'`, `real_money=false`). Clientes podem utilizá-lo para simular fluxos e integrações somente após a correção das falhas de autorização. Para pagamento real no ecossistema OptmaMenu, o caminho é integrar um PSP/provedor autorizado (a validar configuração de produção e contratos; ASAAS é o provedor anteriormente utilizado em testes).

## 2. O que foi comprovado na auditoria

| Frente | Evidência | Conclusão |
|---|---|---|
| Migrações antigas | 20 migrations multistatement: sequências de tokens SQL do ledger e scripts históricos idênticas; strings, identificadores e blocos `$$` preservados. | Sem divergência semântica detectada nesses scripts; não significa que a versão numérica esteja reconciliada |
| Migrações recentes | 31 migrations single-statement: hashes MD5 do SQL integral conferem com o espelho; 30 arquivos conferem no canônico (histórico de comprovantes fora de migrations). | Atestação de conteúdo concluída, ainda pendente colisão de versionamento |
| Divergência P0.5 | 32 match exatos por versão+nome, 18/19 aliases, colisão `20261014130500`, arquivo de comprovantes ausente do diretório canônico. | **Não** executar `db push` nem `migration repair` automático |
| RLS lançamentos | P0.4: falha cross-tenant reproduzida em HTTP/JWT e corrigida somente em migration de homologação; 26 assertions PostgREST aprovadas. | Proteção ainda **não implantada no Supabase ativo** |
| Exclusão sandbox | Fluxo cliente que afirmava sucesso após fallback DML parcial recebeu correção fail-closed em PRs P0.2. | Ainda requer integração e publicação |
| Edge retenção | `retention-worker` de produção usa `service_role`; código anteriormente consultado não exige autorização interna adicional. Hardening preparado em PR separado. `pg_cron` possui somente 3 jobs ativos, sem worker de retenção registrado. | **Potencial acesso privilegiado indevido** por JWT aceito pela gateway; corrigir após investigar invocador/scheduler; nunca testar purga em produção |
| Pix single-use | Índice único `ux_transactions_pix_paid_external_reference` não está presente; há índice comum em `external_reference`. 0 duplicidades de recebimentos Pix concluídos na consulta de leitura. | Migration forward-only de índice existe em revisão; não publicar até preflight e janela controlada |
| Consulta de status Pix | `get_pix_instruction_status_safe(text)` consta do histórico Git, mas não está registrada como RPC ativa. | Identificar chamadas efetivas na aplicação e segurança antes de recriar; não implantar só porque existia em SQL antigo |
| RLS global | 0 tabelas `public` sem RLS; 45 funções `SECURITY DEFINER` executáveis por `authenticated`. | Revisão individual por risco e necessidade; não executar `REVOKE` em massa |
| Agendamentos | Cron ativo: liquidação de recebíveis cartão, tarifas diárias e retry de webhook. | Não há comprovação de scheduler interno para retenção; verificar invocadores externos |
| Produção | Vercel deploy `READY` aponta para `EduSouza-OptmaIdea/optmapay` main; banco Supabase segue 51 migrations. | Nenhum pacote de correção P0 foi aplicado em produção |

A verificação P0.6 é **análise de tokens SQL**, não execução retrospectiva do código nem atestado dos objetos atuais. Ignora comentários, espaçamento externo a literais e terminadores `;`, preserva os demais tokens. Diffs de estado podem existir após migrações devido a atualizações diretas, scripts e alterações de runtime. O manifest congelado e a CI detectam mudanças futuras nos arquivos auditados.

## 3. Grupos de liberação e dependências

**Grupo A — fechar histórico e preparar janela de deploy, sem mutação em produção:**
1. Aprovar a fonte canônica de comprovantes bancários preservando o conteúdo que realmente foi aplicado: espelho `20261018013000_bank_receipts_history.sql` tem o conteúdo do ledger `20261018013732`. No canônico há versão recuperada diferente e fora de `supabase/migrations`; não substituir sem revisão e integração de histórico.
2. Registrar explicitamente o mapeamento de aliases: NÃO renomear versões já aplicadas às cegas nem aceitar `20261014130500` como a mesma migration nos dois contextos.
3. Definir implantação forward-only com preflight dos objetos presentes, seleção e revisão humana das mudanças ainda não aplicadas, backup e rollback por comportamento.
4. Rodar `docs/security/P06_PRODUCTION_READONLY_PREFLIGHT_20261022.sql` (SELECT-only) imediatamente antes da janela, comparando os dados com o snapshot de 22/10.

**Grupo B — aplicar correções com produção protegida, em janela aprovada:**
1. Corrigir o acesso de `retention-worker` após identificar o agendador real, exigir token interno ou JWT `service_role` **validado** e manter a gateway `verify_jwt` coerente; testar POST autenticado, negar JWT de cliente, não chamar `cleanup` real.
2. Publicar o fail-closed de exclusão de conta sandbox e testar permissões de acesso legítimo, erro da RPC e consistência de exclusão; nunca reintroduzir fallback DML parcial.
3. Ativar grants explícitos onde a Data API precisa de acesso, conferindo RLS e funções necessárias. O rollout da Supabase em 30/10/2026 muda **defaults futuros**; objetos existentes mantêm privilégios atuais. Tratar como hardening + prevenção, não como previsão de indisponibilidade automática de todas as tabelas existentes.
4. Aplicar a correção transacional RLS, previamente aprovada em banco descartável, após backup e revisão de rotas que façam DML direto em `transactions`; evitar bloquear trabalhos administrativos legítimos.
5. Criar/validar índice único Pix com pré-checagem de duplicidades e teste de concorrência: dois pagadores para mesma cobrança, primeiro ganha; segundo recebe erro amigável; sem duplicar saldo nem evento.
6. Reavaliar RPC de status de instrução Pix: verificar dependências e proteção contra vazamento de dados; não introduzir função por reflexo sem casos de uso.
7. Após cada mudança, confirmar erros, RLS, métricas e callbacks antes de avançar; rollback específico de frontend/Edge se necessário, sem desfazer automaticamente lançamentos de ledger.

**Grupo C — testes funcionais de aceitação (sandbox, sem dinheiro real):**
- Cadastro/login, recuperação, sessão expirada, restrições de usuário A versus B.
- Conta sandbox: saldos, extrato, lançamentos e exportação; exclusão fail-closed, sem confirmação falsa.
- Pix: solicitação, transferência, QR, consulta, webhook, idempotência, concorrência e estorno; nenhuma liquidação dupla.
- Cartões: compra simulada, antifraude/autorização, plano/parcelas, tarifas, recebíveis e conciliação.
- Webhooks: autenticação, assinatura, retry/backoff, duplicidade, mensagens fora de ordem e destinatário indisponível.
- Segurança: 401/403 de consumidores, revogação de API Key, isolamento de logs e dados de terceiros.
- Operação: backups verificáveis, alertas, trilha de auditoria e procedimentos de contingência.

**Grupo D — ativação real de produtos (frentes distintas):**
- **OptmaPay**: produção de uma aplicação de simulação sandbox, após os gates acima; `real_money` deve continuar falso. Não utilizar como adquirente ou instituição financeira real.
- **OptmaMenu**: pode operar loja/pedidos reais, desde que catálogo, estoque, checkout, permissões, atendimento e integrações estejam validados; cobranças reais dependem de credenciais de **produção** do PSP e aceite de pagamentos/estornos, jamais de saldos sintéticos do OptmaPay. Estado atual desse outro aplicativo **não foi revalidado nesta frente**.
- **OptmaSMSGate**: SMS real exige teste de dispositivo/chip, permissões, filas, idempotência, entrega, custos da operadora e autenticação; estado atual **não foi revalidado nesta frente**.
- Os três têm gates e deploys independentes. Não bloquear loja pública exclusivamente por pendências não utilizadas do simulador OptmaPay, mas não depender dele para liquidar pagamentos reais.

## 4. Critérios objetivos de GO / NO-GO

| Gate | Critério verificável | Situação 22/10 |
|---|---|---|
| G1 — isolamento tenant | Testes negativos HTTP de SQL, API e funções sem exposição cruzada; produção com policies corretas | CI **PASS**; produção **PENDENTE** |
| G2 — migrations | 51/51 instruções historicamente correspondentes, collision/aliases documentados; mecanismo de deploy reconciliado sem replay perigoso | SQL conferido; **PENDENTE** estratégia de versionamento |
| G3 — Pix | Índice exclusivo presente, duplicidades 0, operação concorrente sem liquidação dupla | Duplicidades 0; índice **AUSENTE** |
| G4 — retenção | Edge autoriza apenas invocador confiável; scheduler identificado, timeout e operação auditada | Código corrigido em PR; Edge produção **PENDENTE** |
| G5 — APIs | API Keys, hash, scopes, revogação, grants explícitos e `SECURITY DEFINER` triados | **PARCIAL** |
| G6 — regressão | CI, testes E2E financeiros, login mobile/desktop, reversão ensaiada | CI PostgreSQL/PostgREST **PASS**; E2E **PENDENTE** |
| G7 — observabilidade | logs não sensíveis, alertas, roteamento de falhas e runbook de plantão | **PENDENTE** |
| G8 — autorização | backup conferido, janela publicada e autorização expressa para mudança ativa | **NÃO SOLICITADA / NÃO DADA** |

Qualquer falha em G1, G3 ou G4 **bloqueia expor o correspondente fluxo OptmaPay a clientes**. Não chamar ambiente ativo de seguro só porque CI sintético passou.

## 5. Estratégia de velocidade sem regressão
Fazer revisão e testes **em paralelo por frentes**, mas publicação em ordem causal:

**Trilha 1:** P0.6 integridade SQL e checklist de release — entregue com guard na CI.  
**Trilha 2:** corrigir controles realmente expostos (retenção, user/account RLS, Pix, exclusão) e ensaiar rollout/rollback.  
**Trilha 3:** abrir piloto comercial do OptmaMenu com **fluxos não financeiros reais** enquanto credenciais de pagamento/PSP e controles são homologados; se usar cobrança real, testar ponta a ponta no provedor autorizado.  
**Trilha 4:** testar o OptmaSMSGate isoladamente, sem acoplar o lançamento ao motor de Pix sandbox.

Aceleração recomendada: uma única rodada de revisão dos PRs empilhados e janela de liberação **depois** do GO; não criar micro-PRs artificiais, não misturar bases históricas independentes por `force-push`.

## 6. Reversão e responsabilidades
- Antes da janela: snapshot/bkp verificado e pontos de restauração, lista de variáveis seguras, controle de quem aprova.
- Em erro: pausar tráfego afetado, manter ordens e eventos idempotentes, reverter deploy de Vercel/Edge quando possível; **nunca** restaurar banco por cima de lançamentos recentes sem decisão sobre reconciliação financeira.
- Aplicar RLS/grants apenas com plano de teste de regressão e recuperação de acesso a rotas legítimas.
- Não imprimir ou versionar secrets, API Keys, JWTs, dados de cartão ou PII nos logs.
- Não realizar pagamentos reais nem apagar contas de produção para testar.
- Usuário aprova explicitamente a integração/release; a auditoria pode continuar somente leitura.

**Conclusão:** P0.6 remove o principal impedimento de **proveniência do SQL** das migrations históricas, mas **não elimina** a necessidade de resolver o versionamento e publicar correções. O produto pode ser colocado em uso real por **ondas independentes**, respeitando a fronteira sandbox versus dinheiro real.
