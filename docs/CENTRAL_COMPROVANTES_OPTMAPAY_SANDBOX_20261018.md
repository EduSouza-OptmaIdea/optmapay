# OptmaPay Sandbox — Centro de Comprovantes (18/10/2026)

## Finalidade
Uma área permanente de consulta e reemissão de comprovantes fictícios de **Pix enviado, Pix recebido, devolução Pix e depósito** para cada conta de correntista. O documento pode ser recuperado mesmo após fechar a janela original e reabrir a sessão. Nunca depende de localStorage como fonte de verdade.

### Entradas de interface
- `/comprovantes`: rota autenticada (layout bancário; funcionários e Owner redirecionados ao administrativo).
- Menu desktop, em modos Dev e Educação.
- Rodapé de navegação mobile, rotulado **Recibos** para caber na tela.
- Acesso direto a partir da área Pix e do Dashboard.

### Histórico e filtros
- Visão inicial: **todos**, em ordem cronológica inversa.
- Tipos: **Pix enviados / Pix recebidos / Depósitos / Devoluções Pix**.
- Pesquisa pelo identificador de lançamento, referência, descrição ou contraparte.
- Intervalo por data no fuso `America/Sao_Paulo`, paginação de 20 documentos e botão para carregar anteriores.
- Exclusão apenas de documentos que **nunca foram emitidos** ou ainda não estão confirmados. Extrato continua sendo fonte dos lançamentos legados.

### Fonte oficial dos documentos
1. **Depósitos:** `public.sandbox_deposit_operations` contém o objeto `receipt` emitido pela transação idempotente. A recuperação preserva valor, tarifa, saldo após lançamento, data, operação e IDs; elimina a `idempotency_key` da resposta ao front. Operações anteriores sem recibo emitido continuam no extrato.
2. **Pix:** `public.transactions` somente `type='pix'`, `status IN ('completed','refunded')`, `environment='sandbox'`, `real_money=false`. O documento mostra identificador, valor, data, referência, origem, destino e dados disponíveis. Os dados de nomes contrapartes dos registros persistidos são utilizados; chaves Pix são consultadas no cadastro **atual** e recebem uma ressalva explícita, não são apresentadas como chaves históricas imutáveis. Devoluções vinculadas são identificadas como tal.
3. **Criação de comprovantes não ocorre na consulta**. O histórico gera a representação HTML a partir de dados existentes, sem débito, crédito, novas transações ou webhooks.

### Segurança e privacidade
- Funções `SECURITY DEFINER` `bank_receipts_list` e `bank_receipt_get` verificam `auth.uid()`, `auth.role()='authenticated'` e vínculo `accounts.user_id` + `accounts.id`.
- Usuários da equipe com papel ativo em `platform_staff` ficam excluídos da área bancária; a UI segue a separação administrativa.
- Tabela original de depósitos mantém `RLS` ativo e **sem grants diretos** para `authenticated`.
- `bank_receipts_list` nunca expõe `receipt` completo, contas de terceiros nem segredos. `bank_receipt_get` aceita ID individual e escopo da conta.
- Filtros de tipo, data, busca e paginação possuem validação server-side. Um usuário não recupera documento de outra conta fornecendo seu UUID.
- Todos os recibos usam a marca oficial `public/optmapay-logo-tema-claro.webp` e destaque **SANDBOX — sem movimentação de dinheiro real**.
- Impressão/PDF utiliza a função do navegador; não exige gerador PDF em servidor.

### Arquivos
- `supabase/migrations/20261018013000_bank_receipts_history.sql`
- `src/services/receiptService.ts`
- `src/pages/ReceiptsPage.tsx`
- `src/App.tsx`, `src/components/Sidebar.tsx`, `src/components/BottomNav.tsx`
- `src/pages/PixArea.tsx`, `src/pages/Dashboard.tsx`
- `tests/bankReceiptsHistory.test.ts`

### Homologação manual após deploy
1. Entrar com conta PF/PJ comum e abrir **Comprovantes** pelo menu lateral e pelo celular.
2. Conferir registros Pix antigos e atuais. Abrir documento; conferir ID e referência iguais ao lançamento, logo oficial, origem/destino e aviso de simulação.
3. Imprimir/salvar em PDF, garantindo que só o recibo apareça sem menus ou botões.
4. Recuperar depósitos já efetuados; conferir valor integral, taxa, valor líquido e saldo registrado na data da operação.
5. Alternar para outra conta do mesmo usuário. Somente registros da conta ativa devem aparecer.
6. Tentar chamar RPC com ID de conta alheia: deve retornar `42501`. A função de detalhe deve negar IDs de terceiros.
7. Filtrar por Pix enviados, recebidos, devoluções, depósitos, datas e referência. Testar botão **Carregar anteriores**.
8. Testar modo claro/escuro no desktop e mobile; verificar impressão em A4.

### Próximos incrementos (não incluídos)
- Documentos específicos de boletos e cartões, faturas, recibos de cobrança de tarifa e extratos em PDF (exigem revisar se cada operação possui dados suficientes para comprovante íntegro).
- Compartilhamento por e-mail com consentimento do titular e envio seguro; não expor uma rota pública com UUID de comprovante como autenticação.
- Snapshot histórico de nomes e chaves Pix no momento da transação, caso seja exigido comprovante integralmente imutável em futuras operações. Nunca reescrever documentos anteriores.
