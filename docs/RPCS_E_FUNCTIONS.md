# ⚙️ Referência de RPCs, Triggers e Edge Functions — OptmaPay Sandbox

Guia de referência das funções executadas no backend PostgreSQL (Supabase) do **OptmaPay Sandbox**.

---

## 1. Funções Atômicas RPC (PostgreSQL)

### `public.transfer_pix`
Executa a transferência Pix atômica entre duas contas do sandbox com bloqueio de concorrência (`FOR UPDATE`) e geração automática dos lançamentos de extrato.

- **Parâmetros**:
  - `p_sender_account_id` (UUID): ID da conta debitada.
  - `p_receiver_pix_key` (TEXT): Chave Pix (ou CPF/CNPJ) da conta de destino.
  - `p_amount` (DECIMAL): Valor da transferência.
  - `p_description` (TEXT, opcional): Descrição do Pix.
  - `p_external_reference` (TEXT, opcional): ID de pedido do e-commerce externo.
- **Retorno**: JSONB com status da transação, IDs dos lançamentos no extrato e `realMoney: false`.

---

### `public.settle_boleto`
Realiza a quitação de um boleto bancário simulado, debitando a conta do pagador e creditando o saldo da empresa recebedora.

- **Parâmetros**:
  - `p_boleto_id` (UUID): ID do boleto a quitar.
  - `p_payer_account_id` (UUID): ID da conta que efetuou o pagamento.
- **Retorno**: JSONB com status da quitação e data de liquidação.

---

### `public.deposit_funds`
Realiza um aporte simulado de saldo em uma conta específica.

- **Parâmetros**:
  - `p_account_id` (UUID): ID da conta.
  - `p_amount` (DECIMAL): Valor a creditar.
  - `p_description` (TEXT, opcional): Descrição do aporte.
- **Retorno**: JSONB com o novo saldo resultante.

---

### `public.delete_sandbox_account`
Exclusão atômica e definitiva de uma conta e todos os seus registros em cascata em cumprimento ao direito ao esquecimento (LGPD).

- **Parâmetros**:
  - `p_account_id` (UUID): ID da conta a excluir.
- **Efeitos em Cascata**:
  - Exclui todas as `transactions` onde a conta seja pagadora ou recebedora.
  - Exclui todos os `boletos` emitidos pela conta.
  - Exclui todos os `cartoes` vinculados.
  - Exclui todos os `webhooks_config` e respectivos `webhooks_log`.
  - Exclui a linha em `accounts`.
- **Retorno**: JSONB com a contagem exata de registros eliminados.

---

### `public.export_account_data_json`
Retorna um documento JSON com todos os dados da conta para download de backup e portabilidade (LGPD).

- **Parâmetros**:
  - `p_account_id` (UUID): ID da conta.
- **Retorno**: JSONB contendo objeto `account`, arrays `transactions`, `boletos`, `cartoes` e `webhooks_config`.

---

## 2. Funções de Ciclo de Vida e Retenção

### `public.check_data_retention_warnings`
Identifica contas criadas há 53 dias (aviso de 7 dias), 58 dias (aviso de 2 dias) e 59 dias (aviso de 1 dia) que ainda não foram notificadas.

### `public.cleanup_expired_sandbox_data`
Purga automaticamente contas que ultrapassaram a janela de retenção de 60 dias (configurável para monetização futura).

---

## 3. Edge Functions

| Nome | Rota / Função | Descrição |
|---|---|---|
| `retention-worker` | `/functions/v1/retention-worker` | Executa a varredura periódica de retenção e aciona avisos por e-mail. |
| `webhook-dispatcher` | `/functions/v1/webhook-dispatcher` | Dispara webhooks HTTPS POST para sistemas terceiros com timeout seguro. |
