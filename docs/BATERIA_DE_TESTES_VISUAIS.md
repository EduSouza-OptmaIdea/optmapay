# 📋 Bateria de Testes Visuais e Operacionais — OptmaPay Sandbox

Utilize este documento como checklist interativo para validar visualmente e operacionalmente todos os fluxos do **OptmaPay Sandbox**.
Você pode marcar os itens com `[x]` e adicionar seus comentários e notas diretamente nos campos de observação.

---

## 🏷️ Configuração Recomendada de Contas para os Testes:
- **Conta 1 (Credora / Lojista)**: Ex.: Estabelecimento comercial ou restaurante parceiro.
- **Conta 2 (Pagadora / Cliente)**: Ex.: Conta de testes de comprador / pessoa física.
- **Conta Master (Super Admin)**: Exclusivamente `edu.souza` via link do rodapé.

---

## 🧪 1. Emissão e Gestão de Cartões (Físico / Virtual)

Acesse: `/cartoes` (com a **Conta Pagadora** selecionada)

- [x] **1.1. Emissão de Novo Cartão de Crédito**
  - [x] Clicou em `+ Emitir Novo Cartão`
  - [x] Definiu nome impresso, limite (ex: R$ 5.000,00), dia de vencimento (ex: dia 10) e PIN (ex: 1234)
  - [x] Cartão criado foi renderizado visualmente com efeito glassmorphism, chip e bandeira
- [x] **1.2. Emissão de Cartão de Débito**
  - [x] Emitiu cartão na modalidade Débito
  - [x] Verificou prefixo BIN específico de débito (`5020...`)
- [x] **1.3. Segurança e Visualização de Dados**
  - [x] Clicou no ícone de "olho" e o código CVV de 3 dígitos foi revelado
  - [x] Clicou no botão de copiar número do cartão (com feedback de "Copiado")
  - [x] Testou a ação de **Bloquear / Desbloquear** o cartão
  - [x] Testou a ação de **Alterar PIN** do cartão informando nova senha de 4 dígitos

**Status:** [X] Aprovado | [ ] Requer Ajustes  
**Observações:**  
> Testado e aprovado com sucesso. Todos os cartões de crédito e débito foram gerados e validados.

---

## 💳 2. Venda na Maquininha POS Virtual (Terminal de Balcão)

Acesse: `/pos` (Menu Lateral: **Maquininha POS**)  
*(Nota: O estabelecimento recebedor é automaticamente a **Conta Ativa** selecionada no topo do sistema)*

- [x] **2.1. Configuração da Venda no Terminal POS**
  - [x] Selecione a **Conta Credora (Lojista)** no seletor do topo
  - [x] Digite o valor da venda (ex: R$ 150,00)
  - [x] Escolha a modalidade de pagamento:
    - **Crédito à Vista**
    - **Crédito Parcelado** (ex: 3x de R$ 50,00)
    - **Débito**: Permitido exclusivamente nos planos **D+1** ou **⚡ OnTime (D+0)**. Nos planos D+7, D+15 e No Vencimento, o botão de débito fica bloqueado e desabilitado com aviso explicativo.
- [x] **2.2. Execução da Passagem do Cartão**
  - [x] Selecionou o cartão gerado no Teste 1 (ou digitou os dados da Conta Pagadora)
  - [x] Escolheu modalidade: Inserir Cartão ou Aproximação (NFC)
  - [x] Digitou o PIN de 4 dígitos cadastrado
  - [x] Clicou em `Processar Pagamento na POS`
- [x] **2.3. Validações Visuais de Saída**
  - [x] Animação de processamento na maquininha exibiu status de "Aprovado"
  - [x] Comprovante fiscal gerado com NSU, Código de Autorização e detalhes das parcelas
  - [x] Limite do cartão na Conta Pagadora diminuiu no valor correspondente (ou saldo em caso de débito)

**Status:** [X] Aprovado | [ ] Requer Ajustes  
**Observações:**  
> Aprovado. Processamento na POS com comprovante fiscal, regras de débito em D+1/OnTime e parcelamento validados.

---

## ⚡ 3. Planos de Recebimento e Taxas MDR (Lojista)

Acesse: `/cartoes?tab=rates` (com a **Conta Credora** selecionada)

- [x] **3.1. Comparação Visual de Planos**
  - [x] Visualizou a tabela comparativa:
    - **D+1 Padrão**: Menor taxa MDR, liquidação no próximo dia útil bancário às 06h00 (Aceita Débito e Crédito).
    - **⚡ OnTime (D+0)**: Liquidação na hora no saldo disponível com taxa calibrada (Aceita Débito e Crédito).
    - **D+7 e D+15**: Descontos progressivos na taxa MDR (Apenas Crédito).
    - **No Vencimento**: Sem juros de adiantamento, liquidação no ciclo de 30 dias (Apenas Crédito).
- [x] **3.2. Troca de Plano Ativo da Conta**
  - [x] Selecionou o plano desejado e confirmou a troca
  - [x] Verificou se o plano ficou persistido na configuração da conta

**Status:** [X] Aprovado | [ ] Requer Ajustes  
**Observações:**  
> Aprovado. Configurações de taxas MDR e persistência do plano do estabelecimento operando com precisão.

---

## 📊 4. Saldo Disponível vs. Lançamentos Futuros no Dashboard

Acesse: `/dashboard` (com a **Conta Credora** selecionada)

- [x] **4.1. Verificação dos Cards de Métricas do Topo**
  - [x] **Saldo Disponível**: Mostra rigorosamente apenas o dinheiro liberado e em conta (o saldo não se altera no dia 05/09 por uma venda que liquidará no futuro).
  - [x] **Lançamentos Futuros**: Exibe o montante total de previsões a compensar.
  - [x] **Saldo Projetado Total**: Soma do saldo disponível + previsões futuras.
- [x] **4.2. Cronograma de Lançamentos Futuros por Data Prevista de Baixa**
  - [x] A venda no débito realizada no sábado 05/09/2026 é listada sob o grupo **Terça-feira • 08/09/2026** (pois 06/09 é domingo e 07/09 é feriado nacional da Independência).
  - [x] Exibe contagem regressiva `D-1 • Próximo Dia Útil` e nota de liquidação às 06:00.
  - [x] Mostra a data e hora do evento original (venda em 05/09/2026).
- [x] **4.3. Extrato Bancário Realizado**
  - [x] Apenas dias com movimentação financeira efetiva que alteraram a conta corrente aparecem com Saldo Anterior e Saldo do Dia.
  - [x] As 3 abas de filtro funcionam com precisão: `Visão Consolidada`, `🏦 Saldo Disponível (Realizado)` e `⏳ Lançamentos Futuros`.

**Status:** [X] Aprovado | [ ] Requer Ajustes  
**Observações:**  
> Aprovado. Separação de saldo disponível vs futuros, feriados bancários e contagens regressivas perfeitas.

---

## ⏩ 5. Antecipação de Débito (Taxa Cheia OnTime) e Crédito (Pro Rata)

Acesse: `/dashboard` ou `/cartoes?tab=statement` (com a **Conta Credora** selecionada)

- [x] **5.1. Abertura do Modal de Antecipação de Débito**
  - [x] Localizou o lançamento futuro de Débito no cronograma de 08/09/2026
  - [x] Clicou no botão `⚡ Antecipar`
- [x] **5.2. Validação da Regra de Negócio de Débito no Modal**
  - [x] O modal identifica como **Antecipação de Débito** com badge `⚡ Débito OnTime`
  - [x] Previsão oficial indicada: Terça-feira 08/09 às 06:00 (1 dia útil restante com aviso de feriado 07/09)
  - [x] Cobrança da **taxa cheia do OnTime para o tipo débito** (1.99%)
  - [x] Desconto da taxa D+1 já retida (0.85%), apurando o custo adicional da antecipação (1.14%)
  - [x] Exibição clara do **Valor Líquido a Receber AGORA**
- [x] **5.3. Autorização com PIN e Liquidação Instantânea**
  - [x] Digitou a senha PIN de 4 dígitos da conta (ex: 1234)
  - [x] Clicou em confirmar:
    - O valor líquido entra **imediatamente no Saldo Disponível** da conta
    - O lançamento futuro **deixa de ser exibido como futuro** e passa para o extrato de saldo realizado de Hoje (05/09) com status `completed`
    - Dispara webhook de conciliação (`payment.settled`)
  - [x] Clicou em `Confirmar Antecipação Pro Rata`
- [x] **5.4. Migração Imediata dos Valores**
  - [x] O lançamento **deixa de ser exibido como futuro** e passa para `completed` / `Antecipado Pro Rata`
  - [x] O valor líquido entra **imediatamente no Saldo Disponível** da Conta Credora
  - [x] Foi disparado o webhook de conciliação de liquidação (`payment.settled`)

**Status:** [X] Aprovado | [ ] Requer Ajustes  
**Observações:**  
> Aprovado. Regra de antecipação com taxa cheia de débito e migração imediata de lançamentos futuros para realizados validada com sucesso.

---

## 📑 6. Fatura de Cartão: Extrato, Fechamento e Pagamento

Acesse: `/cartoes?tab=invoices` (com a **Conta Pagadora** selecionada)

- [x] **6.1. Visualização da Fatura Aberta e Gestão por Cartão**
  - [x] Seletor visual no topo para alternar entre cartões de crédito da conta com limites independentes
  - [x] Exibição da fatura do mês com as compras e parcelas correspondentes ao cartão selecionado
  - [x] Gráfico e métricas de **Limite Consumido vs. Limite Disponível** convergindo perfeitamente com o total
- [x] **6.2. Ciclos de Fatura e Lançamentos Futuros**
  - [x] Fatura Fechada com quitação e sem acúmulo indevido
  - [x] Faturas Futuras exibem seus valores de parcelamento mantidos (não zeram ao quitar faturas anteriores)
- [x] **6.3. Pagamento de Fatura com Saldo em Conta**
  - [x] Clicou em `Pagar Fatura com Saldo`
  - [x] Ao confirmar o pagamento:
    - O saldo da conta corrente sofre o débito correspondente
    - O status da fatura do ciclo pago passa para `Paga`
    - O **limite de compras do cartão é imediatamente restaurado e liberado**
    - Parcelas das faturas futuras permanecem ativas aguardando seus respectivos meses

**Status:** [X] Aprovado | [ ] Requer Ajustes  
**Observações:**  
> Aprovado. Faturas por cartão de crédito, convergência exata de limites e ciclos mensais 100% operacionais.

---

## 🔒 7. Acesso Restrito no Rodapé e Painel Master (Super Admin)

Acesse: Página Inicial `/` (deslogado ou a partir da home pública)

- [ ] **7.1. Tela de Login Limpa**
  - [x] Acessou `/login` e constatou que **não há mais qualquer menção, botão ou modal de Super Admin**
  - [x] O aviso legal no rodapé cita ausência de valores reais e normas do BACEN
- [ ] **7.2. Link "Acesso Restrito" no Rodapé**
  - [x] Foi até o rodapé da home page ([PublicHome.tsx](file:///d:/OptmaIdea/optmapay/src/pages/PublicHome.tsx))
  - [x] Localizou o link simples e discreto `Acesso Restrito` ao lado dos termos
- [ ] **7.3. Autenticação e Bloqueio de Não-Autorizados**
  - [x] Tentou digitar um e-mail comum (ex: `cliente@teste.com`): sistema bloqueia informando que o acesso é restrito ao administrador central
  - [x] Informou as credenciais da conta `edu.souza`: login efetuado com sucesso e redirecionamento direto para `/master-admin`
- [ ] **7.4. Operações no Console Master**
  - [ ] Visualizou a lista de todas as contas e empresas cadastradas
  - [ ] Testou a calibração de tarifas do banco em `Parâmetros do Banco`
  - [ ] Testou o botão `Zerar Extrato` de uma conta de teste para reiniciar lançamentos

**Status:** [ ] Aprovado | [ ] Requer Ajustes  
**Observações:**  
> *(Escreva aqui suas observações sobre o Teste 7)*

---

## 🌐 8. Webhooks e Painel do Desenvolvedor

Acesse: `/dev-panel`

- [ ] **8.1. Cadastro de Endpoint HTTPS**
  - [ ] Cadastrou uma URL de webhook (ex: URL pública do OptmaMenu ou túnel ngrok)
  - [ ] Definiu o secret de assinatura HMAC
- [ ] **8.2. Histórico de Disparos em Tempo Real**
  - [ ] Após realizar uma liquidação Pix ou antecipação de cartão, conferiu a tabela de logs
  - [ ] Verificou o payload JSON transmitido com atributos `"realMoney": false` e `"environment": "sandbox"`
  - [ ] Clicou no botão `Reenviar Webhook` para testar a resiliência da entrega

**Status:** [ ] Aprovado | [ ] Requer Ajustes  
**Observações:**  
> *(Escreva aqui suas observações sobre o Teste 8)*

---

## 📝 Parecer Geral de Homologação

- **Data da Homologação:** ____/____/2026
- **Responsável:** Edu Souza / Equipe OptmaIdea
- **Resultado Final:**  
  [ ] Aprovado para Produção / Staging  
  [ ] Pendências Mapeadas (descrever abaixo)

**Anotações Gerais:**
> 
