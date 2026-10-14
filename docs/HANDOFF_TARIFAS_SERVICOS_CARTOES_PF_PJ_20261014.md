# OptmaPay Sandbox — Handoff de tarifas, mensalidades PF/PJ e limites de cartão

**Data:** 2026-10-14. **Projeto:** `EduSouza-OptmaIdea/optmapay` (`main`), Supabase `wertmoquxdrucdbobuie`, Vercel `https://optmapay.optmaidea.com.br`.

## Solicitação incorporada
O superadministrador pediu, adicionalmente à separação de depósitos e Pix por PF/PJ, tarifas de depósito separadas, limite inicial de cartão de crédito separado e área administrativa de taxas de serviços. **Mensalidade inicial da PF: R$ 0,00; da PJ: R$ 29,90**. As operações bancárias são fictícias; não representam assinaturas comerciais reais do software.

## Autoridade dos parâmetros
- `platform_type_policies` agora possui `deposit_free_monthly`, `deposit_excess_fee`, `card_credit_limit` e `service_monthly_fee` por tipo `customer`/PF e `merchant`/PJ.
- Padrões gravados: **PF 5 depósitos gratuitos/mês, tarifa excedente R$ 0,00, cartão R$ 3.000,00, serviço R$ 0,00/mês**; **PJ 5 depósitos gratuitos/mês, tarifa excedente R$ 0,00, cartão R$ 3.000,00, serviço R$ 29,90/mês**. Os cartões PF/PJ têm parâmetros distintos e editáveis, mesmo quando os valores iniciais coincidem.
- O máximo de depósito PJ de R$ 1.000,00 já configurado anteriormente deve ser preservado; não foi redefinido nesta etapa.
- `platform_account_overrides` contempla condições financeiras por correntista: franquia gratuita, tarifa excedente, limite inicial de cartão, mensalidade e valores gerais de depósito/Pix.
- `platform_effective_financial_policy_internal(uuid)` resolve, no banco, o perfil e exceções válidas. `platform_effective_policy(uuid)` devolve a política autorizada ao correntista ou ao operador permitido.
- `platform_type_policy_save_v2` e `platform_account_override_save_v2` exigem permissões administrativas e registram as alterações em `platform_admin_audit`.

## Implementação financeira
1. **Depósitos:** `sandbox_deposit_quote` e `sandbox_deposit_confirm` leem os parâmetros PF/PJ e exceções por conta na mesma transação. Mantêm limites e múltiplos de R$ 0,05, tarifa inferior ao depósito, idempotência e comprovante.
2. **Cartões:** gatilho `enforce_optmapay_card_test_limit` determina o limite inicial do novo cartão no PostgreSQL, conforme o perfil da conta e exceções. A interface consulta a política para mostrar o valor. **Cartões já emitidos não são modificados automaticamente.**
3. **Mensalidade fictícia:** `run_optmapay_daily_account_charges` utiliza `service_monthly_fee`. O padrão PF é zero; o padrão PJ é 29,90. A cobrança somente é admitida **a partir do ciclo de 01/11/2026**, no dia 1, e utiliza o mecanismo `apply_optmapay_account_charge`, que registra no razão e é idempotente por conta/código/data. Cobranças antigas de R$ 12,99 em setembro/outubro foram preservadas.
4. **Segregação:** operadores ativos não são alvos de novas regras de produtos bancários, inclusive em contas históricas legadas. As tarifas bancárias não devem se confundir com a futura assinatura real do SaaS.

## Interface
- `/admin/configuracoes`: saldos iniciais e limites gerais de depósitos e Pix separados por PF/PJ.
- `/admin/tarifas`: **área dedicada** para a franquia de depósitos, a tarifa excedente, o limite inicial do cartão e a mensalidade fictícia — configuração separada de PF e PJ e com salvamento auditado.
- `/admin/condicoes`: exceções por conta, com justificativa e validade.
- `/cartoes`: apresenta o limite de emissão disponibilizado pela política PF/PJ, em vez de um número fixo.
- `/dashboard`: o depósito simulado utiliza as tarifas efetivas do banco e o comprovante mantém identificador único.
- `/pix-limites` e `/mensagens`: pedidos de aumento de Pix e comunicação educacional implementados na etapa anterior.

## Testes
- `tests/platformProfileFinancial.test.ts` contém quatro verificações transacionais: valores PF/PJ; política PJ de cartão versus PF; exceção financeira; primeira mensalidade PJ de novembro sem cobrança PF nem duplicidade.
- `tests/sandboxDepositIntegration.test.ts` consulta os novos valores de tarifa por **perfil PF**, não os parâmetros globais antigos.
- A homologação automatizada é via GitHub Actions: migrations PostgreSQL, Vitest, typecheck e build. A validação funcional manual no navegador e SMTP real permanece indispensável.

## Roteiro manual de homologação
1. Como Owner, entrar em `/admin/tarifas`, conferir PF serviço R$ 0,00 e PJ R$ 29,90. Trocar temporariamente a tarifa PJ de depósito para R$ 1,50 e salvar.
2. Em uma conta PJ de teste com a franquia mensal esgotada, fazer depósito fictício de R$ 10,00 e conferir **R$ 8,50 líquido**. Conta PF comum mantém tarifa R$ 0,00, salvo exceção.
3. Configurar PJ com cartão inicial R$ 6.000,00, emitir **um cartão novo de teste** e confirmar R$ 6.000,00 no novo cartão. Cartões antigos permanecem com seus limites.
4. Em `/admin/condicoes`, definir uma exceção individual com limite inicial de cartão e mensalidade distinta; testar conta alvo e outra conta sem exceção.
5. Conferir ausência de novos lançamentos históricos no razão. Não executar cobrança manual para datas anteriores.
6. Retornar temporários aos valores pretendidos e conferir o audit trail.
7. Homologar envio de e-mails reais de teste no fluxo Pix antes de considerar notificações operacionais plenamente entregues.

## Pendências fora desta entrega
- Interface para **aplicar alteração de limite também a cartões já emitidos**, mediante ação administrativa expressa e verificação do saldo utilizado.
- Rotina operacional agendada e supervisão da execução da cobrança mensal do dia 1; a função backend está pronta para quando o agendador chamar, mas o disparo periódico deve ser validado.
- E-mails de homologação entregues em caixa de entrada/Spam e política de retentativas agendadas.
- Condições diferenciadas de juros, bloqueio/suspensão de correntistas e regras pedagógicas correspondentes, em pacotes futuros.
