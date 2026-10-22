# OptmaPay Sandbox — P0.7 | Piloto familiar supervisionado e dinheiro 100% fictício
**Data:** 22/10/2026. **Escopo:** OptmaPay Sandbox educacional. **Status:** somente branch de homologação; NÃO publicado.

## Definição do produto aprovada pelo usuário
O OptmaPay Sandbox é um **simulador de educação financeira**, voltado especialmente a crianças e adolescentes **acompanhados por um adulto**. Pix, saldos, cartões, contas a pagar, juros e mesadas são fictícios. **Não haverá movimentação de dinheiro real pela plataforma.** Monetização futura significa cobrar **pelo acesso/licença/assinatura**, por serviço externo e separado do livro-razão fictício; essa comercialização é uma fase futura, após piloto familiar.

**Consequência arquitetural:** nunca construir ou ativar rails bancários, Pix SPI, adquirência, cash-in ou cash-out reais. Identificadores Pix/cartões são apenas simulados e não devem conectar-se a contas ou números válidos reais.

## P0.7 entregas já preparadas, mas NÃO implantadas
- `supabase/migrations/20261022123000_enforce_educational_sandbox_only.sql`: constraint `transactions_sandbox_only_check` exige `real_money IS FALSE` e `environment='sandbox'` em INSERT/UPDATE, **inclusive por service_role**. Preflight aborta se encontrar registros inconsistentes; nenhuma alteração em produção. Não substitui auditoria de endpoints externos.
- Quatro novos cenários HTTP/JWT em `scripts/test-data-api-rls.js`: usuário autenticado tenta inserir lançamento real, service_role tenta inserir real ou ambiente `production`, e UPDATE tenta converter lançamento fictício. Resposta deve falhar por CHECK PostgreSQL `23514`. O total dos testes HTTP sobe de 26 para **30**, se todos aprovados.
- `src/context/AppModeContext.tsx`: o reconhecimento de adulto não nasce mais `true` por padrão; o estado antigo não é convertido em nova aprovação. O modo júnior exige confirmação local explícita e um apelido. Mesada passa pela **RPC atômica** `sandbox_deposit_quote` + `sandbox_deposit_confirm`, evitando atualização de saldo e inclusão de transação separadas sem conferir erros. Resposta é verificada quanto a sandbox, ficticiedade e conta.
- `src/components/edu/ParentalSupervisionModal.tsx`: textos corrigidos, botão de júnior e mesada bloqueados antes de confirmação local, mensagens de erro na tela e prevenção de duplo clique durante confirmação.

### LIMITE IMPORTANTE: confirmação local != controle parental verificável
O checkbox e o apelido são configurações do navegador (localStorage), **não** garantem que a pessoa seja adulta, não autenticam tutor/professor, não estabelecem vínculo legal e não impedem adolescente de alterar o próprio navegador. **Não disponibilizar autoinscrição de menores nem considerar isso suficiente para uso autônomo infantil**. Para liberar contas júnior independentes é necessária uma arquitetura de responsável **no servidor**: conta do adulto autenticada, autorização escopada a conta do estudante, trilha de consentimento/retirada, permissões de criação e mesada em RPCs, proteção RLS por vínculos, revogação e bloqueio, minimização/eliminação de dados.

### Dado real ≠ dado fictício
A interface antiga alegava que não coletava CPF, mas o banco possui colunas `accounts.cpf_cnpj`, `boletos.payer_cpf` e `cartoes.cvv`. Removemos essa promessa ampla, porque o esquema **pode armazenar** dados inseridos. **No piloto, use apenas documentos, chaves e cartões sintéticos**. Nunca digite CPF de criança, PIN/código de cartão bancário real, dados da escola, endereço, senha bancária ou números válidos de familiares. Mesmo o valor do nome do supervisor deve ser apenas apelido e pode persistir localmente. Um projeto separado deve eliminar campos desnecessários ou substituir por tokens de teste inconfundíveis.

## Critérios de aceitação do piloto doméstico
1. **Adulto responsável opera a sessão** e mantém o acesso de autenticação; criança acompanha sob sua supervisão. Não criar logins independentes de menores nesta versão.
2. Usar dispositivos domésticos controlados, sem publicar links para cadastro de terceiros, sem credenciais compartilhadas, sem dados reais de crianças.
3. Login/logout, seleção de conta, saldo, mesada didática, boleto fictício, cofrinho, Pix entre contas sintéticas, cartão de teste, histórico, estorno, filtros e exportação devem ser exercitados e anotados em checklist. O frontend atual tem outras operações didáticas com atualização direta de saldo e lançamentos separados; **essas operações ainda precisam de auditoria transacional específica antes do GO geral.**
4. Restringir acessos externos; nunca enviar webhooks reais com dados de participantes nem conectar PSP de produção.
5. Confirmação local desmarcada após migração de UI; modo júnior não ativa sem apelido e confirmação. Não alegar validação de responsável.
6. Mesada fictícia só deve mostrar sucesso com comprovante da RPC atômica e valores de sandbox; no erro, nenhuma confirmação otimista e o extrato/saldo devem permanecer coerentes.
7. Auditoria de transações: `count(*) FILTER (WHERE real_money=true OR environment <> 'sandbox')=0`; testar a tentativa negativa no PostgreSQL descartável; não executar ataques ou inserções em produção.
8. O dono do produto confirma os gates de backups, logs e ciclo de restauração, além do papel da supervisão.

## Etapas de liberação e monetização
- **Fase 1 — Homologação gratuita:** CI PostgreSQL/PostgREST, revisão RLS e grants, testes com contas fictícias, release candidate privada. Sem merge nem deploy de produção.
- **Fase 2 — Piloto familiar:** somente após liberação controlada dos controles P0 e checklist acima; sessão do adulto supervisionando a criança. Feedback pedagógico e revisão UX.
- **Fase 3 — Famílias/escolas externas:** implementar responsável no backend (permissões, auditoria e minimização), política de segurança e privacidade, contas de estudantes associadas a responsáveis e rotina de suporte. Avaliação jurídica de tratamento de dados de crianças antes de disponibilização pública.
- **Fase 4 — Monetização:** assinatura/licenciamento pago por provedor externo autorizado, administrado pela empresa que vende o software; separado das movimentações fictícias. Não movimentar dinheiro real dentro das contas de aprendizagem.

## Bloqueadores ainda ativos
- Históricos de migrations possuem colisão `20261014130500`; NÃO rodar `db push` ou `migration repair` automático.
- Worker de retenção em produção ainda não foi atualizado com verificação de origem; possível invocação privilegiada por JWT e cron não identificado.
- Índice de uso único Pix ausente da produção; 0 duplicatas em leitura anterior.
- As correções RLS e do fluxo de exclusão também estão em PRs, não no banco/cliente de produção.
- A área didática tem operações de saldo não atômicas além da mesada; precisam ser isoladas em RPCs seguras.
- Aplicar a constraint sandbox apenas após preflight SELECT, backup verificado, janela de release e aprovação expressa.
- Campos sensíveis em tabelas legadas precisam de revisão/minimização antes de uso externo por menores.

**GO apenas para continuidade da homologação sintética. NO-GO para contas autônomas de crianças e tráfego público.** A segurança do software não depende de ser uma instituição financeira: autorização, integridade do extrato, privacidade e prevenção de abuso continuam essenciais.
