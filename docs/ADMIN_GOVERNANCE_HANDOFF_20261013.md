# OptmaPay Sandbox — Entrega de governança e limpeza (13/10/2026)

## Escopo
Repositório: EduSouza-OptmaIdea/optmapay, branch main. Supabase: wertmoquxdrucdbobuie.
A aplicação administra apenas valores fictícios. Assinaturas comerciais reais para custeio de infraestrutura ficam em domínio financeiro independente.

## Implementado
- Administração separada do Internet Banking em /admin.
- Identidades internas Owner/Admin/User mantidas em public.platform_staff; RLS sem políticas abertas e grants mínimos.
- Owner legado foi reconciliado com a autoridade optmapay_super_admins, sem excluir sua conta bancária histórica.
- Novas RPCs: platform_staff_me, platform_staff_has_permission, platform_staff_list, platform_staff_save, platform_staff_set_enabled, platform_staff_customers.
- Mudanças de operador são auditadas em platform_admin_audit.
- Novo operador só pode ser vinculado a identidade autenticada preexistente com e-mail confirmado e sem conta nem movimentação fictícia.
- User interno recebe permissões apenas operacionais; Admin recebe permissões explícitas, não autoridade automática.
- Trigger impede que operadores habilitados recebam novas contas bancárias.
- /admin/operadores permite editar permissões, suspender e reativar; /admin/correntistas delegada fornece consulta restrita.
- Novas configurações persistidas: saldo inicial PF/PJ, limite inicial de cartão, mínimo/máximo de depósito, depósitos gratuitos/mês e tarifa excedente.
- Trigger aplica saldo de abertura do backend às novas contas quando a origem não é service_role; o front-end não é autoridade para esse valor.

## Limpeza controlada de testes
Foram identificados 6 usuários Auth e 6 contas associados aos lotes de smoke 390381, 753261 e 737081, criados em 20/09/2026 e sem login.
Antes de remover, verificaram-se transações externas, recebíveis, operações de webhook pendentes e referências no repositório. Não foram detectadas dependências impeditivas.
A exclusão restrita a esses seis registros foi executada em transação única, com verificação posterior: 0 usuários e 0 contas remanescentes. Um evento de limpeza foi registrado em platform_admin_audit.
Contas de correntistas não pertencentes a esses lotes foram preservadas.

## Segurança e pendências conhecidas
- RPCs privilegiadas existentes no legado de Super Admin continuam restritas ao Owner; operadores delegados acessam apenas RPCs específicas.
- platform_staff e platform_admin_audit têm RLS sem policies diretas por escolha: acesso normal apenas por funções autenticadas e verificadas no banco.
- Algumas permissões são preparatórias: atribuir um escopo não habilita um módulo que ainda não foi implementado.
- A atribuição de operador exige usuário já existente no Supabase Auth; fluxo seguro de convite e onboarding administrativo ainda pendente.
- Parâmetro default_credit_limit está persistido, mas o fluxo de emissão de cartão ainda deve consumir a regra autoritativamente.
- Depósitos continuam com implementação legada de R$ 500 fixos; novos parâmetros financeiros estão persistidos, mas ainda NÃO são consumidos por deposit_funds. Precisa de novo motor atômico com idempotência, limite mensal, tarifa e comprovante antes de anunciar ativação.
- Central de mensagens e educação/investimentos/shopping: placeholders apenas.
- Limpeza de conta legada do Owner NÃO realizada (dados financeiros históricos preservados).
- Reexecutar Security Advisor a cada mudança de schema e revisar avisos preexistentes.

## Próximo pacote proposto
1. Migrar deposit_funds para operação com chave de idempotência, contador mensal e tarifa configurável, valor de R$ 1,00 a R$ 500,00; introduzir comprovante sandbox imprimível.
2. Integrar limite de cartão configurável ao backend e ao frontend; validar override por conta.
3. Criar convite seguro para operadores internos e testes de Owner/Admin/User com usuários reais de homologação.
4. Central de mensagens com segmentação e RLS.
5. Publicar documentação comercial de planos reais de software, separada do banco fictício.

## Como homologar esta rodada
- /admin abre login administrativo próprio.
- /admin/operadores: Owner enxerga registro próprio e pode delegar a identidade Auth confirmada sem conta bancária.
- Tentativa de promover para Owner ou vincular correntista deve falhar com mensagem do backend.
- User interno com customers.read visualiza apenas consulta resumida e não recebe acesso à console Owner.
- /admin/configuracoes: alterar um valor válido, salvar, recarregar e confirmar persistência; conferir audit settings.updated.
- Correntista comum não deve acessar /admin, /admin/operadores ou qualquer RPC administrativa.
- Abertura de conta PF nova deve receber saldo inicial da configuração, não do payload cliente.
