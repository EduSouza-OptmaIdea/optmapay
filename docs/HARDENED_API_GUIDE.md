# Guia da API Endurecida (Hardened Sandbox API) — OptmaPay

> **Ambiente**: `sandbox` | **Dinheiro Real**: `false` (`realMoney: false`)
> **Baseline**: Pacote de Execução 01 — OptmaPay API Hardening

Este documento detalha o novo contrato seguro da API de Sandbox do OptmaPay, os requisitos de autenticação criptográfica, a assinatura server-side de webhooks por HMAC-SHA256 v1, idempotência de mutações e proteção contra SSRF e Replay.

---

## 1. Princípios de Segurança e Golden Rules

1. **Tokens Criptográficos**: Nunca armazenamos API Keys em texto claro no banco de dados. Todas as chaves são geradas via CSPRNG de alta entropia (256 bits) e persistidas exclusivamente como hash **SHA-256**. A chave completa é revelada **uma única vez** no momento da criação/rotação.
2. **Autenticação Padrão**:
   - Header: `Authorization: Bearer sk_test_optmapay_<keyId>_<secret>`
   - Header: `x-optmapay-account-id: <UUID da conta merchant>`
   - O header `x-api-key` está descontinuado.
3. **Escopos de Permissão (Scopes)**: A chave deve conter o escopo exigido pelo endpoint chamado:
   - `account:read`: Consulta de dados cadastrais e saldo da conta.
   - `transactions:read`: Consulta de extrato bancário.
   - `cards:charge`: Liquidação e cobrança via cartão de crédito/débito.
   - `pix:transfer`: Iniciação de transferências Pix.
   - `refunds:create`: Estorno de transações.
4. **Idempotência Server-Side**: Mutações (`/cards/charge`, etc.) exigem o header `Idempotency-Key: <string 1..128 chars>`. Requisições repetidas com o mesmo payload retornam a mesma resposta sem reprocessar débito ou crédito.
5. **Webhooks com HMAC-SHA256 v1**: Os antigos prefixos `sha256_mock_...` foram extintos. Assinatura gerada e verificada via HMAC-SHA256 com derivação server-side de segredos (`whsec_optmapay_...`) e proteção contra replay (janela estrita de 300s).
6. **Headers de Resposta Padrão em todas as rotas**:
   - `x-optmapay-real-money: false`
   - `x-optmapay-environment: sandbox`
   - `x-optmapay-request-id: <uuid>`
   - `Cache-Control: no-store`

---

## 2. Formato de Erro Canônico

Todas as falhas retornam HTTP status correspondente e o corpo estruturado:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_API_KEY",
    "message": "API key inválida ou revogada."
  },
  "requestId": "d3b07384-d113-40f2-9cb8-b0a345e69e4a",
  "realMoney": false,
  "environment": "sandbox"
}
```

Códigos comuns:
- `UNAUTHORIZED`: Cabeçalho `Authorization` ausente ou mal formatado.
- `INVALID_API_KEY`: Chave não encontrada, hash divergente, inativa ou expirada.
- `MISSING_ACCOUNT_ID`: Header `x-optmapay-account-id` ausente ou inválido.
- `FORBIDDEN_ACCOUNT`: A chave fornecida pertence a outra conta.
- `FORBIDDEN_SCOPE`: A chave não possui o escopo necessário para esta operação.
- `IDEMPOTENCY_KEY_MISSING`: Header `Idempotency-Key` obrigatório ausente.
- `IDEMPOTENCY_IN_PROGRESS` (HTTP 409): Chamada simultânea já em processamento com a mesma chave.
- `IDEMPOTENCY_KEY_REUSED` (HTTP 409): Mesma `Idempotency-Key` reutilizada com payload diferente.

---

## 3. Endpoints da API Pública

### 3.1 `GET /api/sandbox/v1/account`
Consulta os dados e saldo da conta vinculada à API key.

- **Headers**:
  ```http
  Authorization: Bearer sk_test_optmapay_...
  x-optmapay-account-id: <account-uuid>
  ```
- **Scope**: `account:read`
- **Exemplo de Resposta (HTTP 200)**:
  ```json
  {
    "success": true,
    "account": {
      "id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "name": "Restaurante Exemplo Ltda",
      "type": "merchant",
      "balance": 15420.00,
      "pixKey": "contato@exemplo.com.br",
      "agency": "0001",
      "accountNumber": "100234-5"
    },
    "realMoney": false,
    "environment": "sandbox"
  }
  ```

---

### 3.2 `GET /api/sandbox/v1/transactions`
Consulta o extrato bancário oficial da conta.

- **Headers**:
  ```http
  Authorization: Bearer sk_test_optmapay_...
  x-optmapay-account-id: <account-uuid>
  ```
- **Scope**: `transactions:read`
- **Query Params**:
  - `limit`: `1..100` (padrão: 50)
  - `type`: `pix`, `card_payment`, `card_credit`, `card_debit`, `boleto`, `fee`, `refund`
  - `status`: `pending`, `completed`, `failed`, `cancelled`
  - `createdFrom`: ISO 8601 string
  - `createdTo`: ISO 8601 string
- **Exemplo de Resposta (HTTP 200)**:
  ```json
  {
    "success": true,
    "transactions": [
      {
        "id": "78c9b83b-9a99-4c12-87ad-f65e2363198f",
        "type": "card_payment",
        "direction": "in",
        "amount": 116.53,
        "description": "Recebimento Cartão #PED-2026-0043",
        "externalReference": "PED-2026-0043",
        "status": "completed",
        "createdAt": "2026-09-19T21:00:00.000Z"
      }
    ],
    "count": 1,
    "realMoney": false,
    "environment": "sandbox"
  }
  ```
> **Aviso**: `POST /api/sandbox/v1/transactions` foi extinto e retorna **HTTP 405 Method Not Allowed** (`USE_OPERATION_SPECIFIC_ENDPOINT`). Lançamentos não podem ser criados artificialmente sem motor bancário.

---

### 3.3 `POST /api/sandbox/v1/cards/charge`
Processa cobrança no cartão utilizando a RPC atômica bancária `process_card_payment`.

- **Headers**:
  ```http
  Authorization: Bearer sk_test_optmapay_...
  x-optmapay-account-id: <merchant-account-uuid>
  Idempotency-Key: <1..128 chars únicos da operação>
  Content-Type: application/json
  ```
- **Scope**: `cards:charge`
- **Regras de Validação de Cartão**:
  - BINs aceitos no Sandbox: `5899` (Crédito OptmaPay) e `5898` (Débito OptmaPay). Cartões reais de produção são estritamente rejeitados.
  - Débito: `installments` deve ser estritamente `1`.
  - Crédito: `installments` entre `1` e `12`.
  - O cartão deve existir na base de sandbox, estar ativo, não expirado e ter CVV coincidente.
  - O valor deve ser maior que 0 e ter no máximo 2 casas decimais.
  - Nunca logamos PAN completo nem CVV.

- **Corpo da Requisição**:
  ```json
  {
    "cardNumber": "5899123456789012",
    "cardholderName": "JOAO TESTE SILVA",
    "expirationDate": "12/29",
    "cvv": "123",
    "amount": 120.00,
    "installments": 1,
    "tipo": "credito",
    "orderId": "PED-2026-0043",
    "description": "Pedido PED-2026-0043",
    "settlementPlan": "standard"
  }
  ```

- **Exemplo de Resposta de Aprovação (HTTP 200)**:
  ```json
  {
    "success": true,
    "status": "approved",
    "message": "Transação autorizada com sucesso.",
    "nsu": "847291",
    "authorizationCode": "AUTH8472",
    "tid": "TID-20260919-847291",
    "grossAmount": 120.00,
    "netAmount": 116.53,
    "feeAmount": 3.47,
    "feePercent": 2.89,
    "cardMasked": "•••• 9012",
    "orderId": "PED-2026-0043",
    "realMoney": false,
    "environment": "sandbox"
  }
  ```

---

## 4. Assinatura de Webhook (HMAC-SHA256 v1)

Todos os eventos de pagamento (`pix.paid`, `pix.refunded`, `card.paid`) são criados de forma atômica no banco de dados (`webhook_events`) na mesma transação financeira que liquidou o saldo.

O webhook dispatcher envia notificações HTTP POST com os seguintes cabeçalhos canônicos:

```http
Content-Type: application/json
x-optmapay-event: pix.paid
x-optmapay-event-id: <UUID do evento>
x-optmapay-delivery-id: <UUID desta tentativa de entrega>
x-optmapay-attempt: 1
x-optmapay-timestamp: 1789876543
x-optmapay-signature: v1=3f8a92b0...64_hex_chars...
x-optmapay-real-money: false
x-optmapay-environment: sandbox
```

### 4.1 Formato da Assinatura
A assinatura é calculada sobre a concatenação exata:
```
signing_input = `${x-optmapay-timestamp}.${x-optmapay-event-id}.${raw_body}`
```
Em seguida calcula-se o HMAC:
```
signature = HMAC-SHA256(webhook_secret, signing_input).toHex()
header    = `v1=${signature}`
```

### 4.2 Verificação pelo Receptor (ex: Merchant / OptmaMenu)
Para validar com segurança:
1. Extraia o timestamp de `x-optmapay-timestamp` e a assinatura de `x-optmapay-signature` (`v1=<hex>`).
2. Valide o drift de horário (proteção contra replay):
   ```js
   const now = Math.floor(Date.now() / 1000);
   if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
     throw new Error("Webhook expirado / Replay rejeitado.");
   }
   ```
3. Monte a string exata `<timestamp>.<eventId>.<rawBody>`.
4. Calcule o HMAC com seu `whsec_optmapay_...` e compare com a assinatura recebida usando comparação em tempo constante (`crypto.timingSafeEqual`).
5. Certifique-se de registrar o `x-optmapay-event-id` processado para garantir deduplicação na sua aplicação.

---

## 5. Política de Tentativas e SSRF

### 5.1 Backoff Exponencial
- Tentativa 1: Imediata.
- Tentativa 2: +1 minuto.
- Tentativa 3: +5 minutos.
- Tentativa 4: +15 minutos.
- Tentativa 5: +60 minutos.
Após 5 falhas consecutivas em erros transitórios (timeout, rede, 408, 425, 429, 5xx), o job é marcado como `dead`. Erros 4xx definitivos (exceto transitórios) vão direto para `dead`.
Tentativas manuais reabrem o job e registram auditoria imutável com `is_manual_retry = true`.

### 5.2 Validação Severa Anti-SSRF
Todas as URLs de webhook passam por resolução de DNS server-side (IPv4 / IPv6) e inspeção prévia de rota. URLs com IPs de loopback (`127.0.0.1`, `::1`), ranges privados (RFC 1918, RFC 4193), metadata cloud (`169.254.169.254`), portas diferentes de 443 ou protocolos diferentes de HTTPS são terminantemente bloqueadas antes de qualquer handshake TCP.
