# Guia Técnico: Sistema de Cartões OptmaCard & Maquininha Virtual (OptmaPay Sandbox)

Este documento descreve a arquitetura, regras de negócio, tabelas de taxas MDR, prefixos BIN, fluxos da Maquininha Virtual Smart POS e contratos de API para processamento de cartões no **OptmaPay Sandbox**.

---

## 1. Regra Fundamental & Prefixo BIN Exclusivo

### 1.1. Regra de Ouro (*Golden Rule*)
Todas as operações de cartão, payloads de API, retornos e webhooks retornam obrigatoriamente:
```json
{
  "realMoney": false,
  "environment": "sandbox"
}
```

### 1.2. Prefixo BIN OptmaCard & Identidade Visual
* **Paleta de Cores Oficial**:
  * Azul Oceano: `#1367A2`
  * Magenta / Purple: `#A63987`
* **Logotipo**: `public/optmacard-logo.webp` / `public/optmacard-logo.png`
* **Prefixo Crédito**: Inicia obrigatoriamente com o prefixo **`5899`** (ex: `5899 4123 8891 0042`).
* **Prefixo Débito**: Inicia obrigatoriamente com o prefixo **`5898`** (ex: `5898 9012 3341 5567`).

> [!WARNING]
> Qualquer tentativa de enviar cartões de bandeiras reais (Visa `4xxx`, Mastercard `51-55` / `22-27`, Amex `34/37`, Elo `5067/4576`, Hipercard `6062`) é imediatamente rejeitada com o código `ERRO 05 (BLOQUEIO POR SEGURANÇA)`.

---

## 2. Tabela Oficial de Taxas MDR e Planos de Liquidação

O OptmaPay Sandbox opera com 2 planos oficiais de recebimento:

| Modalidade / Parcelas | Plano Padrão (D+1 / 1 dia útil) 💳 | Plano ⚡ OnTime (Recebimento na Hora) ⚡ |
| :--- | :---: | :---: |
| **Pix** | **GRÁTIS (0,00%)** | **GRÁTIS (0,00%)** |
| **Débito** | **0,85%** | **2,79%** |
| **Crédito à vista (1x)** | **2,89%** | **5,99%** |
| **Crédito 2x** | **4,22%** | **11,39%** |
| **Crédito 3x** | **4,83%** | **12,49%** |
| **Crédito 4x** | **5,44%** | **13,09%** |
| **Crédito 5x** | **6,05%** | **13,79%** |
| **Crédito 6x** | **6,64%** | **14,49%** |
| **Crédito 7x** | **7,24%** | **15,49%** |
| **Crédito 8x** | **7,82%** | **16,09%** |
| **Crédito 9x** | **8,41%** | **16,69%** |
| **Crédito 10x** | **8,98%** | **17,39%** |
| **Crédito 11x** | **9,56%** | **18,39%** |
| **Crédito 12x** | **10,12%** | **18,79%** |

### Fórmula de Cálculo:
$$\text{Taxa MDR (R\$)} = \text{Valor Bruto} \times \left( \frac{\text{Taxa \%}}{100} \right)$$
$$\text{Valor Líquido (R\$)} = \text{Valor Bruto} - \text{Taxa MDR}$$

---

## 3. Maquininha Virtual (Smart POS WebApp)

A Maquininha Virtual simula um terminal POS moderno e touch-screen:
1. **Digitação de Valor**: Teclado numérico capacitivo com botões *Limpa* (Amarelo), *Anula* (Vermelho) e *Entra* (Verde).
2. **Seleção de Modalidade**: 1. Débito | 2. Crédito à Vista | 3. Crédito Parcelado (2x a 12x).
3. **Leitura/Inserção do Cartão**: Seleção em 1 toque de cartão virtual salvo ou digitação manual.
4. **PIN / Senha**: Digitação de senha de 4 dígitos.
5. **Processamento Realista**: Simulação de handshake com a adquirente OptmaPay Sandbox.
6. **Comprovante Térmico**: Impressão e cópia da filipeta fiscal contendo NSU, Autorização, TID e detalhamento de taxas.

---

## 4. Endpoint de API REST para Cobrança de Cartão

### `POST /api/sandbox/v1/cards/charge`

#### Headers:
```http
Content-Type: application/json
x-optmapay-api-key: optmapay_sk_sandbox_test_key
```

#### Request Body:
```json
{
  "cardNumber": "5899482910394821",
  "cardholderName": "CLIENTE FICTÍCIO",
  "expirationDate": "12/29",
  "cvv": "123",
  "amount": 250.00,
  "installments": 3,
  "tipo": "credito",
  "plan": "ontime",
  "orderId": "PEDIDO-8831",
  "description": "Venda de Teste no App"
}
```

#### Response (200 OK):
```json
{
  "success": true,
  "status": "paid",
  "message": "Transação autorizada com sucesso no OptmaPay Sandbox!",
  "data": {
    "transactionId": "tx_card_1725220000000",
    "orderId": "PEDIDO-8831",
    "amountGross": 250.00,
    "feePercent": 12.49,
    "feeAmount": 31.23,
    "amountNet": 218.77,
    "installments": 3,
    "plan": "ontime",
    "tipo": "credito",
    "cardMasked": "5899 **** **** 4821",
    "cardBrand": "OptmaCard",
    "cardholderName": "CLIENTE FICTÍCIO",
    "authorizationCode": "AUTH-492019",
    "nsu": "84920192",
    "tid": "TID-20260901-849201",
    "realMoney": false,
    "environment": "sandbox",
    "timestamp": "2026-09-01T21:00:00.000Z"
  }
}
```

---

## 5. Webhooks de Cartão Disparados

Quando uma transação de cartão é concluída, os seguintes eventos são disparados para a URL de webhook cadastrada:
1. `card.paid`
2. `order.paid`

### Exemplo de Payload do Webhook:
```json
{
  "event": "card.paid",
  "realMoney": false,
  "environment": "sandbox",
  "timestamp": "2026-09-01T21:00:00.000Z",
  "data": {
    "transactionId": "tx_card_1725220000000",
    "orderId": "PEDIDO-8831",
    "amountGross": 250.00,
    "feePercent": 12.49,
    "feeAmount": 31.23,
    "amountNet": 218.77,
    "installments": 3,
    "plan": "ontime",
    "tipo": "credito",
    "status": "paid",
    "authorizationCode": "AUTH-492019",
    "nsu": "84920192",
    "tid": "TID-20260901-849201",
    "cardMasked": "5899 **** **** 4821",
    "cardBrand": "OptmaCard",
    "cardholderName": "CLIENTE FICTÍCIO",
    "merchantName": "Lojista Sandbox",
    "payerName": "Cliente Sandbox",
    "realMoney": false,
    "environment": "sandbox",
    "paidAt": "2026-09-01T21:00:00.000Z"
  }
}
```
