# P08 — Um produto, dois ambientes: Learn + Dev e consumo pelo OptmaMenu
**Data:** 22/10/2026. **Operação:** OptmaPay Sandbox, dinheiro exclusivamente fictício.

## Regra de produto confirmada
- **Learn**: educação financeira (mesada, despesas, poupança, cenários, empréstimos, cartões didáticos).
- **Dev**: desenvolvimento e validação de APIs, emissão/revogação de chaves Sandbox, webhooks, cartões simulados, Pix e POS.
- **MESMO aplicativo, MESMA infraestrutura de contas fictícias**, sem bifurcar bancos, receitas, versões ou builds.
- **OptmaIdea Owner**: navega em Learn e Dev sob a mesma sessão autenticada, além de manter console administrativo. **Conta de teste própria**, nunca sessão assumida de outro correntista.
- **Staff administrativo comum**: permanece confinado ao console e às permissões delegadas; não vira correntista.
- **Pilotagem familiar**: conta de teste operada pelo adulto; não liberar credenciais autônomas a menores. Futuras restrições por papel deverão ser impostas também no backend (RLS/RPC/API) antes de abrir a terceiros. Um alternador no frontend não é autorização.

## Implementação efetiva da candidata P08
- `src/lib/sandboxModeAccess.ts` define a política de roteamento client-side que permite participante autenticado ou owner com `isSuperAdmin` verificado no Supabase. Funcionários delegados não são autorizados a usar a área bancária fictícia.
- `src/App.tsx` mantém o mesmo conjunto de rotas Learn e Dev, mas deixa o owner abrir o workspace com sua própria identidade.
- `src/context/AuthContext.tsx` preserva `isPlatformStaff` para o console e `platformRole=owner` para permissões administrativas, enquanto carrega contas de sandbox do owner **estritamente filtradas por `user_id`** usando consulta normal (RLS). Nunca carrega contas de outros usuários. Não autoprovisiona conta do owner pelo perfil; a criação exige ação explícita.
- `src/pages/AdminArea.tsx` disponibiliza atalhos owner Learn, Dev e APIs/Webhooks.
- `src/components/Header.tsx`, `Sidebar.tsx`, `BottomNav.tsx` deixam os rótulos Learn/Dev visíveis, preservando os caminhos e preferências existentes.
- `src/pages/Dashboard.tsx` permite ao owner criar conscientemente conta de teste própria com identificador sintético exclusivo `SANDBOX-OWNER-<uid>`, chave `owner.<uid>@optmapay.fake`; sem dados bancários reais.
- `tests/sandboxModeAccess.test.ts` cobre owner autenticado, usuário regular, funcionário administrativo e acesso anônimo.

## Comprovação de segurança
A política **ativa** do banco para contas é `auth.uid() = user_id` nos quatro comandos (SELECT, INSERT, UPDATE e DELETE). O owner seleciona via `fetchUserAccounts(userId)` que filtra explicitamente `user_id`. A autorização master `is_optmapay_super_admin` vem de RPC no Supabase; não se baseia em uma flag de localStorage ou e-mail.

Essa implementação **não** dá leitura irrestrita de contas de clientes ao proprietário e não cria suporte a `impersonation`. O owner deve criar/selecionar suas próprias contas sintéticas. Teste de autorização real no banco continua necessário após implantação; os testes da CI certificam o algoritmo de roteamento, não o acesso remoto ativo.

## Integração OptmaMenu — leitura em dois bancos em 22/10
- OptmaMenu: um `optma_sandbox` habilitado, credencial `ready`, ambiente `sandbox`; 26 intents (15 paid, 4 failed, 6 expired, 1 pending).
- OptmaPay: 30 linhas de `transactions` com referência `optmamenu:%`, todas sandbox e dinheiro fictício; 15 pares `in/out`.
- Conciliação por hash dos identificadores opacos: **15/15 intents paid** têm exatamente um débito e um crédito, **15/15** débitos batem com o valor bruto, oito cartões têm crédito líquido não superior ao bruto, 11 intents não pagos sem movimento finalizado. Sem duplicação Pix observada.
- O fluxo é **REAL entre os aplicativos, mas os saldos e pagamentos são FICTÍCIOS**. Jamais usar status sandbox `paid` como comprovante de recebimento de reais.

## Roteiro de validação doméstica após segurança implantada
1. Entrar na sessão owner, abrir `/admin`, verificar os atalhos `Learn` e `Dev` e o alternador no cabeçalho.
2. Criar uma única conta de teste sintética própria, navegar entre Learn e Dev preservando o mesmo ID de conta, testar extrato e mesada fictícia.
3. No Dev, conferir a API Key existente **sem copiá-la ao chat**; rotação somente quando preparado para atualizar Vault do OptmaMenu, pois revoga integrações anteriores.
4. No OptmaMenu, usar a loja de homologação, estoque conhecido e pedido fictício novo, confirmar opção `OptmaPay Sandbox`.
5. Simular Pix por conta fictícia do OptmaPay, confirmar webhook e dupla partida `out/in`, verificar expiração/regeração, cartão D+/recebíveis, reenvio sem duplicidade.
6. Executar reconciliador read-only `supabase/tests/p09_optmapay_reconciliation.test.mjs` disponível no PR independente do OptmaMenu; não registrar segredos ou referências originais em logs públicos.
7. Não usar pedidos históricos de clientes para testes destrutivos nem compartilhar login de owner com criança.

## Bloqueadores antes do GO amplo
- P0.7 e P0.8 estão em PRs, não implantados; RLS `transactions` ativo continua antigo, índice único Pix ativo continua ausente, worker de retenção de produção ainda precisa autorização.
- Divergência de timestamp de migrations (colisão `20261014130500`) exige implantação forward-only selecionada e backup; **não usar `db push`/repair indiscriminadamente**.
- A autorização Learn/Dev de outros papéis, a relação adulto-criança no backend e a atomicidade das outras operações didáticas são etapas futuras, distintas da pilotagem owner.

**Status:** entrega de código em homologação; GO de revisão e testes automatizados. **Nenhum deploy remoto** realizado nesta frente.
