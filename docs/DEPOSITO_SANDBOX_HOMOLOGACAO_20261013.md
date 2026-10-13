# OptmaPay Sandbox — Depósitos configuráveis, tarifa e idempotência

Data: 2026-10-13. Projeto Supabase: `wertmoquxdrucdbobuie`. Repositório `EduSouza-OptmaIdea/optmapay`, branch `main`.

## Escopo concluído

A interface legada `+ Aporte`, que transferia R$ 500 fictícios por chamada, foi substituída por `+ Depósito` no dashboard do correntista. O novo diálogo solicita valor entre R$ 1 e R$ 500, consulta a tarifa ao servidor antes de habilitar a confirmação, apresenta valor bruto/tarifa/líquido e emite comprovante fictício imprimível e disponível em HTML.

RPCs `sandbox_deposit_quote(uuid,numeric)` e `sandbox_deposit_confirm(uuid,numeric,text,text,numeric)` controlam titularidade, valores, tarifas e idempotência no PostgreSQL. A função legada `deposit_funds` teve EXECUTE revogado do papel `authenticated`. Ela não pode mais ser usada pelo correntista para ignorar as regras.

## Regras operacionais

- Os limites são lidos de `platform_system_settings` e inicialmente são R$ 1 a R$ 500.
- Cada conta tem 5 depósitos gratuitos por mês civil, considerando `business_timezone` (padrão `America/Sao_Paulo`).
- A partir do 6º depósito, cobra-se `deposit_excess_fee` por evento. O valor configurado permanece em R$ 0,00 até o Owner alterá-lo.
- O valor informado pelo correntista é **bruto**: lança-se a entrada integral no extrato, o débito separado da tarifa e o crédito **líquido** no saldo. Caso a tarifa seja igual ou superior ao valor escolhido, rejeita-se a operação.
- Depósitos fictícios anteriores do mês, gravados em `transactions` como `deposit`, contam para a franquia; não há reinicialização artificial do contador na migração.
- O sistema confirma a tarifa novamente dentro da transação. Se o valor diferir da prévia, a confirmação falha e solicita nova revisão.
- A transação bloqueia a linha da conta antes de contar os depósitos, evitando duas confirmações simultâneas na transição entre a 5ª e a 6ª operação.
- Chave de idempotência por conta: reenvio com mesmo valor e descrição devolve o comprovante original sem novo crédito. Reutilização com conteúdo divergente é rejeitada.
- `sandbox_deposit_operations` registra operação, lançamento, tarifa, identificador de repetição e comprovante, sem permitir acesso direto a `authenticated` ou `anon`.
- A função de segurança `sandbox_guard_direct_deposit_ledger` bloqueia alterações diretas a lançamentos de depósito/tarifa feitas por papéis web. Já existia gatilho `guard_optmapay_direct_balance_update` protegendo saldo de alterações diretas.
- Todos os valores movimentados são fictícios (`real_money=false`, `environment='sandbox'`).

## Transações e extrato

`transactions` recebe entrada `deposit` e, quando a tarifa é positiva, saída `withdraw` com identificadores `DEP-` e `DEP-FEE-`. O débito da tarifa é cronologicamente posterior à entrada para cálculo coerente de saldo por lançamento. Nenhuma API para movimentação real foi implementada.

## Testes automatizados

`tests/sandboxDepositIntegration.test.ts` cobre contagem mensal, tarifa na sexta operação, saldo líquido, repetição idempotente, bloqueio da RPC antiga, restrições de propriedade/limites e confronto entre tarifa cotada e tarifa solicitada. A CI existente executa migrations completas, Vitest, ESLint, typecheck, Deno check e build.

## Homologação manual recomendada

1. Entrar como correntista PF ou PJ na loja sandbox e abrir **+ Depósito** pelo dashboard.
2. Informar R$ 1,00 e confirmar prévia. Testar valores inválidos (0,99; 500,01; mais de duas casas decimais) e verificar bloqueio.
3. Abrir Administração → Regras e configurações, configurar temporariamente tarifa fictícia de R$ 1,00 e salvar. Para validar rapidamente a cobrança, usar conta de teste com cinco depósitos no mês (cada conta tem franquia própria).
4. Na sexta operação de R$ 10,00 conferir a prévia: R$ 10,00 bruto, R$ 1,00 de tarifa e R$ 9,00 de crédito líquido. Confirmar **uma vez**.
5. Verificar dois lançamentos no extrato (depósito e tarifa), saldo acrescido em R$ 9,00 e um único comprovante. Imprimir e baixar HTML.
6. Testar reload da página e conferir persistência; confirmar que não foram criados depósitos duplicados.
7. Restaurar a tarifa desejada em Administração, lembrando que por padrão ela é R$ 0,00.

## Pendente fora deste pacote

- Fluxo seguro para convites de operadores internos.
- Integração dos limites globais de cartões e limites individuais de correntistas ao motor de crédito.
- Gestão completa de tarifas contábeis e relatórios de receita institucional fictícia.
- Regime de assinaturas comerciais **reais** separado das transações sandbox.
- Teste de ponta a ponta com credenciais de correntista em navegador real (não executado automaticamente nesta rodada).

## Segurança remanescente

O Supabase Security Advisor ainda aponta funções `SECURITY DEFINER` expostas a `authenticated`, inclusive intencionais que fazem validação de autoridade. Cada alerta deve ser classificado e o uso de acesso anônimo revisado. O novo histórico de depósito tem RLS habilitado sem policies diretas por desenho, via RPCs verificadas.

