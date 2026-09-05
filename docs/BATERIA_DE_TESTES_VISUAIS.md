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

- [ ] **1.1. Emissão de Novo Cartão de Crédito**
  - [ ] Clicou em `+ Emitir Novo Cartão`
  - [ ] Definiu nome impresso, limite (ex: R$ 5.000,00), dia de vencimento (ex: dia 10) e PIN (ex: 1234)
  - [ ] Cartão criado foi renderizado visualmente com efeito glassmorphism, chip e bandeira
- [ ] **1.2. Emissão de Cartão de Débito**
  - [ ] Emitiu cartão na modalidade Débito
  - [ ] Verificou prefixo BIN específico de débito (`5020...`)
- [ ] **1.3. Segurança e Visualização de Dados**
  - [ ] Clicou no ícone de "olho" e o código CVV de 3 dígitos foi revelado
  - [ ] Clicou no botão de copiar número do cartão (com feedback de "Copiado")
  - [ ] Testou a ação de **Bloquear / Desbloquear** o cartão
  - [ ] Testou a ação de **Alterar PIN** do cartão informando nova senha de 4 dígitos

**Status:** [ ] Aprovado | [ ] Requer Ajustes  
**Observações:**  
> *(Escreva aqui suas observações sobre o Teste 1)*

---

## 💳 2. Venda na Maquininha POS Virtual (Credora vs. Pagadora)

Acesse: `/cartoes?tab=pos` (ou aba "Maquininha POS")

- [ ] **2.1. Configuração da Venda**
  - [ ] Selecionou a **Conta Credora** no campo "Conta de Destino (Lojista)"
  - [ ] Digitou o valor da venda (ex: R$ 150,00)
  - [ ] Escolheu a forma de pagamento: **Crédito Parcelado** (ex: 3x de R$ 50,00)
- [ ] **2.2. Execução da Passagem do Cartão**
  - [ ] Selecionou o cartão gerado no Teste 1 (ou digitou os dados)
  - [ ] Escolheu modalidade: Inserir Cartão ou Aproximação (NFC)
  - [ ] Digitou o PIN de 4 dígitos cadastrado
  - [ ] Clicou em `Processar Pagamento na POS`
- [ ] **2.3. Validações Visuais de Saída**
  - [ ] Animação de processamento na maquininha exibiu status de "Aprovado"
  - [ ] Comprovante fiscal gerado com NSU, Código de Autorização e detalhes das parcelas
  - [ ] Limite disponível do cartão na Conta Pagadora diminuiu no valor correspondente (R$ 150,00)

**Status:** [ ] Aprovado | [ ] Requer Ajustes  
**Observações:**  
> *(Escreva aqui suas observações sobre o Teste 2)*

---

## ⚡ 3. Planos de Recebimento e Taxas MDR (Lojista)

Acesse: `/cartoes?tab=rates` (com a **Conta Credora** selecionada)

- [ ] **3.1. Comparação Visual de Planos**
  - [ ] Visualizou a tabela comparativa:
    - **D+1 Padrão**: Menor taxa MDR, liquidação no próximo dia útil bancário às 06h00.
    - **⚡ OnTime (D+0)**: Liquidação na hora no saldo disponível com taxa calibrada.
    - **D+7 e D+15**: Descontos progressivos na taxa MDR.
    - **No Vencimento**: Sem juros de adiantamento, liquidação no ciclo de 30 dias.
- [ ] **3.2. Troca de Plano Ativo da Conta**
  - [ ] Selecionou o plano desejado e confirmou a troca
  - [ ] Verificou se o plano ficou persistido na configuração da conta

**Status:** [ ] Aprovado | [ ] Requer Ajustes  
**Observações:**  
> *(Escreva aqui suas observações sobre o Teste 3)*

---

## 📊 4. Saldo Disponível vs. Lançamentos Futuros

Acesse: `/dashboard` (com a **Conta Credora** selecionada)

- [ ] **4.1. Verificação dos Cards do Topo**
  - [ ] **Saldo Disponível em Conta**: Mostra apenas o valor imediatamente disponível para saque, Pix ou pagamento.
  - [ ] **Lançamentos Futuros (A Receber)**: Exibe a soma de vendas em cartão ou boletos pendentes de liquidação.
- [ ] **4.2. Linha do Tempo e Badges Decrescentes**
  - [ ] Venda efetuada no Teste 2 aparece listada com badge de contagem regressiva:
    - Ex: `D-1 • Próximo Dia Útil (às 06:00)` ou `D-15`, `D-30`
  - [ ] O valor líquido exibido já desconta a taxa MDR da maquininha/gateway.

**Status:** [ ] Aprovado | [ ] Requer Ajustes  
**Observações:**  
> *(Escreva aqui suas observações sobre o Teste 4)*

---

## ⏩ 5. Antecipação de Recebíveis Pro Rata com Validação de PIN

Acesse: `/cartoes?tab=statement` (com a **Conta Credora** selecionada)

- [ ] **5.1. Abertura do Modal de Antecipação**
  - [ ] Localizou o lançamento futuro na tabela de extrato
  - [ ] Clicou no botão `⚡ Antecipar Recebível`
- [ ] **5.2. Análise da Simulação Financeira**
  - [ ] Modal exibe:
    - Valor nominal bruto a antecipar
    - Quantidade exata de dias úteis adiantados
    - Taxa Pro Rata die proporcional ao tempo
    - Custo do desconto e **Valor Líquido Imediato a Receber**
- [ ] **5.3. Autorização com PIN**
  - [ ] Digitou o PIN de 4 dígitos de segurança
  - [ ] Clicou em `Confirmar Antecipação Pro Rata`
- [ ] **5.4. Migração Imediata dos Valores**
  - [ ] O lançamento **deixa de ser exibido como futuro** e passa para `completed` / `Antecipado Pro Rata`
  - [ ] O valor líquido entra **imediatamente no Saldo Disponível** da Conta Credora
  - [ ] Foi disparado o webhook de conciliação de liquidação (`payment.settled`)

**Status:** [ ] Aprovado | [ ] Requer Ajustes  
**Observações:**  
> *(Escreva aqui suas observações sobre o Teste 5)*

---

## 📑 6. Fatura de Cartão: Extrato, Fechamento e Pagamento

Acesse: `/cartoes?tab=invoices` (com a **Conta Pagadora** selecionada)

- [ ] **6.1. Visualização da Fatura Aberta**
  - [ ] Exibição da fatura do mês com as compras realizadas
  - [ ] Gráfico de barra com **Limite Consumido vs. Limite Disponível**
- [ ] **6.2. Fechamento de Fatura**
  - [ ] Clicou no botão de simulação de **Fechar Fatura**
  - [ ] Status da fatura mudou para `Fechada / Aguardando Pagamento` com cálculo de data de vencimento
- [ ] **6.3. Pagamento de Fatura com Saldo em Conta**
  - [ ] Clicou em `Pagar Fatura`
  - [ ] Escolheu pagar o valor integral (ou parcial) utilizando o saldo da conta
  - [ ] Ao confirmar o pagamento:
    - O saldo da conta corrente sofre o débito correspondente
    - O status da fatura passa para `Paga`
    - O **limite de crédito do cartão é imediatamente restaurado e liberado**

**Status:** [ ] Aprovado | [ ] Requer Ajustes  
**Observações:**  
> *(Escreva aqui suas observações sobre o Teste 6)*

---

## 🔒 7. Acesso Restrito no Rodapé e Painel Master (Super Admin)

Acesse: Página Inicial `/` (deslogado ou a partir da home pública)

- [ ] **7.1. Tela de Login Limpa**
  - [ ] Acessou `/login` e constatou que **não há mais qualquer menção, botão ou modal de Super Admin**
  - [ ] O aviso legal no rodapé cita ausência de valores reais e normas do BACEN
- [ ] **7.2. Link "Acesso Restrito" no Rodapé**
  - [ ] Foi até o rodapé da home page ([PublicHome.tsx](file:///d:/OptmaIdea/optmapay/src/pages/PublicHome.tsx))
  - [ ] Localizou o link simples e discreto `Acesso Restrito` ao lado dos termos
- [ ] **7.3. Autenticação e Bloqueio de Não-Autorizados**
  - [ ] Tentou digitar um e-mail comum (ex: `cliente@teste.com`): sistema bloqueia informando que o acesso é restrito ao administrador central
  - [ ] Informou as credenciais da conta `edu.souza`: login efetuado com sucesso e redirecionamento direto para `/master-admin`
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
