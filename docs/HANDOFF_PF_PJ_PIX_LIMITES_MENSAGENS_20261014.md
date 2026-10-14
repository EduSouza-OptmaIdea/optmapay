# OptmaPay Sandbox — Handoff: políticas PF/PJ, depósitos, Pix e comunicação (2026-10-14)

## Base
- GitHub: `EduSouza-OptmaIdea/optmapay`, branch `main`.
- Supabase: `wertmoquxdrucdbobuie`.
- Vercel: `https://optmapay.optmaidea.com.br`.
- Aplicação exclusivamente **sandbox educacional** (sem dinheiro real). Assinaturas comerciais reais do futuro SaaS são independentes do razão fictício.

## Entregas implementadas
1. **Depósito em múltiplos de R$ 0,05.** A cotação e confirmação no PostgreSQL rejeitam valores sem divisibilidade exata por cinco centavos; o input React usa `step=0.05`. Operações antigas e idempotência não são alteradas.
2. **Perfil PF/PJ.** `platform_type_policies` define mínimo e máximo de depósito, limite Pix diário e limite Pix noturno por tipo `customer`/PF ou `merchant`/PJ. Padrão inicial PF: depósitos R$ 1–500, Pix diário R$ 3.000/noturno R$ 1.000; PJ: depósitos R$ 1–500, Pix diário R$ 10.000/noturno R$ 2.000. Janela noturna, comum aos dois perfis, inicialmente 22h às 6h de Brasília. Tudo configurável no administrativo.
3. **Condições individuais autorizadas.** `platform_account_overrides` com RLS restritivo, justificativa, alteração auditada e valores opcionais que prevalecem sobre os padrões PF/PJ. Podem elevar depósito máximo acima de R$ 500, sem modificar as contas dos demais clientes. Validade de exceções Pix e depósito é independente.
4. **Pix.** `platform_pix_limit_snapshot` consulta consumos e disponibilidades no horário de Brasília. Gatilho `platform_enforce_pix_outbound_limit` atua **antes do lançamento de saída no motor transacional** `transfer_pix`, que já bloqueia a conta pagadora. Se o limite for excedido, toda a movimentação é revertida. O limite diário vale também à noite, quando se aplica adicionalmente o teto noturno. Devoluções vinculadas ao Pix original não são tratadas como novo envio.
5. **Solicitação e aprovação.** Cliente autenticado pode pedir aumento justificado sem modificar limites sozinho; uma solicitação pendente por conta. Apenas operador com `limits.manage` pode analisar, aprovar ou rejeitar; aprovação aplica condição individual e gera auditoria. RPCs `platform_limit_request_create`, `platform_limit_requests_my`, `platform_limit_requests_admin`, `platform_limit_request_review`.
6. **Mensagens privadas.** `platform_messages`, `platform_messages_my`, `platform_message_mark_read`, RLS por destinatário, Realtime + polling de contingência, sino no cabeçalho e nova página `/mensagens`. Cliente recebe comprovante de envio do pedido e resultado da análise, sem SMS nem WhatsApp.
7. **E-mails.** `platform_email_outbox` persiste comunicações e o endpoint Vercel `POST /api/v1/notifications/dispatch` autentica o JWT e verifica titularidade/permissões antes de enviar via Brevo/SMTP. Endpoint não aceita destinatário arbitrário vindo do navegador. Há acionamento após criação/análise e botão de reprocessamento no administrativo. Configuração Vercel detectada: `SMTP_PASSWORD`, `SMTP_USER`, `SMTP_HOST`, `SMTP_FROM_EMAIL`. **Não foi feito envio real para uma caixa de cliente nesta rodada**; homologar a entrega e a caixa de spam. O processamento depende do acionamento do navegador/admin; não foi implantado agendador de recuperação de fila.
8. **Comprovante identificado.** Novo depósito traz rótulo permanente `Comprovante fictício OptmaPay XXXXXXXX-XXXX`, extraído do UUID da operação, tanto na tela quanto no HTML para imprimir/baixar. A confirmação idempotente preserva o mesmo rótulo.

## Telas
- `/admin/configuracoes`: parâmetros gerais, PF/PJ separados, janela noturna e valores do sandbox.
- `/admin/condicoes`: busca de contas legítimas, condições individuais, análises de solicitações e justificativas.
- `/pix-limites`: limites/consumo diário e noturno, solicitação e histórico pelo correntista.
- `/mensagens`: avisos persistidos na conta e marcação como lida.
- `/dashboard`: depósitos com limite efetivo e múltiplos de cinco centavos.

## Matriz curta de homologação manual
- No correntista PF, testar depósito R$ 1,02 (recusado), R$ 1,05 (permitido), R$ 500,05 (recusado no padrão). Testar exibição do código do comprovante.
- Em `/admin/configuracoes`, ajustar temporariamente depósito máximo PJ, salvar, atualizar a tela e confirmar persistência. Restaurar após o teste.
- Em `/admin/condicoes`, escolher uma conta de teste e permitir depósito até R$ 700. Verificar que outra conta PF/PJ mantém o teto padrão.
- Na conta de teste, pedir aumento de Pix pelo `/pix-limites` com justificativa; confirmar pedido pendente e aviso na Central de Mensagens.
- No admin, aprovar justificadamente. Conferir mudança efetiva do limite, auditoria, e-mail de aviso e mensagem Realtime. Tentar submissão de novo pedido após conclusão.
- Para testar bloqueio Pix sem depender de saldo alto, baixar temporariamente o teto diário de uma conta de teste para valor abaixo do seu saldo, tentar envio superior e verificar **ausência de débitos, transações e eventos webhook**. Restaurar os limites.
- Exercitar Pix noturno no período configurado; o limite total do dia também se aplica à noite. Confirmar que valores acima do teto são recusados pelo banco.
- Verificar se cliente comum não alcança RPCs de aprovação, listagem administrativa nem dados de outros correntistas.
- Inspecionar fila e-mail / SMTP, sem enviar dados reais de cartão ou dinheiro.

## Segurança e decisões
- Configuração e exceções só via RPCs com verificação de `system.configure` ou `limits.manage`; tabelas administrativas fechadas a leitura/escrita direta de correntistas.
- `platform_messages` permite apenas SELECT direto do próprio destinatário para assinaturas Realtime.
- Conta bancária legada do Owner não aparece na busca de contas para concessão de condições individuais; dados históricos não foram apagados.
- A mudança de limite no backend é obrigatória, não apenas cosmética no React.
- Regras monetárias reais brasileiras não são simuladas como contas efetivas: múltiplos R$ 0,05 apenas para **depósito fictício**, conforme decisão do projeto; Pix ainda aceita centavos.
- Suspensão/banimento e juros especiais ainda são **frentes futuras**, que deverão usar o mesmo padrão auditado PF/PJ/exceção por cliente.
- Auditoria do endpoint genérico legado `api/v1/email/send.ts` fica pendente; o novo processamento de limites **não o utiliza**.

## Próximas frentes
1. Teste real (sem dinheiro) de notificações, SMTP/Brevo e estados `sent`/`failed`, e processamento agendado de pendências da fila.
2. Tela de controles de risco para restringir/suspender/banir clientes, com apelação, motivo, prazo e auditoria.
3. Configuração de condições individuais de juros/taxas com integração aos motores de crédito e cobrança fictícios.
4. Aprimorar centro de mensagens: segmentação, preferências e eventos educacionais.
