# 🚀 Guia de Integração: OptmaPay Sandbox ↔ OptmaMenu

Este documento fornece as especificações técnicas completas para integrar o sistema de pedidos e cardápio digital **OptmaMenu** com o gateway e internet banking **OptmaPay Sandbox**.

---

## 📌 1. Visão Geral da Arquitetura

```mermaid
sequenceDiagram
    autonumber
    actor Cliente as Cliente Final (OptmaMenu)
    participant Menu as Backend OptmaMenu
    participant Pay as OptmaPay Sandbox (Gateway)
    participant Wh as Webhook Receiver (OptmaMenu)
    participant Lojista as Conta Estabelecimento (OptmaPay)

    Cliente->>Menu: Fecha Carrinho / Pedido de Comida
    Menu->>Pay: POST /api/charge (Pix, Cartão ou Boleto)
    Pay-->>Menu: Retorna QR Code Pix ou Aprovação Cartão
    Menu-->>Cliente: Exibe Pagamento / Confirmação
    Pay->>Wh: POST Webhook (event: order.paid / pix.paid)
    Wh->>Menu: Atualiza Pedido para "Em Preparo" (Cozinha)
    Pay->>Lojista: Agenda Liquidação (D+0 OnTime ou D+1 às 06h)
```

### Regras de Ouro do Sandbox:
- Todos os payloads e cabeçalhos retornam:
  - `"realMoney": false`
  - `"environment": "sandbox"`
- Nenhuma operação movimenta dinheiro real.
- As chamadas simulam com precisão de centavos as taxas MDR, prazos de liquidação e webhooks de conciliação.

---

## 🔑 2. Autenticação e Chaves de API

No painel do lojista no OptmaPay (**Painel do Desenvolvedor** `dev-panel`):
1. Gere sua chave de API secreta: `sk_test_optmapay_...`
2. Obtenha o seu `account_id` (UUID da conta do restaurante/estabelecimento).

### Headers Obrigatórios em todas as requisições HTTP:
```http
Content-Type: application/json
Authorization: Bearer sk_test_optmapay_xxxxxxxxxxxxxxxxx
x-optmapay-account-id: 7c9e6679-7425-40de-944b-e07fc1f90ae7
```

---

## 💳 3. Endpoints de Cobrança

### A. Criar Cobrança Pix para o Pedido
**Endpoint:** `POST https://api.optmapay.com.br/v1/charges/pix` (ou chamada direta via Supabase SDK em sandbox)

**Payload Enviado pelo OptmaMenu:**
```json
{
  "orderId": "PED-2026-9812",
  "amount": 89.90,
  "description": "Pedido #9812 - 2x Burger Artesanal + Refrigerante",
  "customer": {
    "name": "João da Silva",
    "document": "123.456.789-00",
    "email": "joao.silva@email.com"
  },
  "expiresInMinutes": 30
}
```

**Resposta do OptmaPay:**
```json
{
  "success": true,
  "chargeId": "ch_pix_99182371",
  "orderId": "PED-2026-9812",
  "qrCodeText": "00020126580014BR.GOV.BCB.PIX0136optmapay-sandbox-pix-chave-9918520400005303986540589.905802BR5915OptmaMenu Resto6009Sao Paulo62070503***6304A1B2",
  "qrCodeBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "amount": 89.90,
  "status": "pending",
  "realMoney": false,
  "environment": "sandbox"
}
```

---

### B. Cobrança de Cartão de Crédito / Débito (Online)
**Endpoint:** `POST https://api.optmapay.com.br/v1/charges/card`

**Payload Enviado pelo OptmaMenu:**
```json
{
  "orderId": "PED-2026-9813",
  "amount": 142.50,
  "installments": 1,
  "card": {
    "cardNumber": "5502090012345678",
    "holderName": "MARIA OLIVEIRA",
    "expirationMonth": "08",
    "expirationYear": "2029",
    "cvv": "789"
  },
  "customer": {
    "name": "Maria Oliveira",
    "email": "maria@email.com"
  }
}
```

**Resposta:**
```json
{
  "success": true,
  "status": "approved",
  "transactionId": "tx_card_8817234",
  "orderId": "PED-2026-9813",
  "authorizationCode": "AUTH-77192",
  "feeAmount": 4.12,
  "netAmount": 138.38,
  "settlementDate": "2026-09-08T06:00:00Z",
  "realMoney": false,
  "environment": "sandbox"
}
```

---

## ⚡ 4. Webhooks: Notificação Automática de Pagamento

Quando um cliente paga via Pix, Cartão ou Boleto, o OptmaPay notifica o **OptmaMenu** em segundo plano via **HTTP POST**.

### Configuração no Painel OptmaPay:
1. Acesse o **Painel do Desenvolvedor** (`/dev-panel`).
2. Cadastre a URL HTTPS pública da sua API OptmaMenu, por exemplo:
   `https://api.optmamenu.com.br/webhooks/optmapay`
   *(Para testes locais no computador do dev, use um túnel HTTPS como **ngrok** ou **localtunnel**).*
3. Defina o seu **Secret de Assinatura** (ex: `sec_optmapay_menu_live_2026`).

---

### Cabeçalhos Enviados no Webhook:
| Cabeçalho | Exemplo | Descrição |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Formato do corpo |
| `x-optmapay-event` | `order.paid` | Tipo de evento |
| `x-optmapay-signature` | `sha256_mock_sec_optmapay_menu_live_2026` | Token/Assinatura de autenticidade |
| `x-optmapay-real-money` | `false` | Indicador de Sandbox |
| `x-optmapay-environment` | `sandbox` | Ambiente de execução |

---

### Eventos Suportados:
1. `order.paid`: Pagamento de pedido aprovado com sucesso.
2. `pix.paid`: QR Code Pix escaneado e quitado.
3. `payment.settled`: Recebível liquidado na conta ou antecipação liberada.
4. `boleto.paid`: Boleto bancário compensado.

---

### Exemplo de Payload do Webhook (`order.paid`):
```json
{
  "event": "order.paid",
  "realMoney": false,
  "environment": "sandbox",
  "timestamp": "2026-09-05T15:10:00.000Z",
  "data": {
    "orderId": "PED-2026-9812",
    "transactionId": "tx_pix_0918231",
    "paymentMethod": "pix",
    "grossAmount": 89.90,
    "feeAmount": 0.00,
    "netAmount": 89.90,
    "payer": {
      "name": "João da Silva",
      "document": "123.456.789-00"
    },
    "metadata": {
      "tableNumber": "Mesa 04",
      "waiter": "Carlos"
    }
  }
}
```

---

## 💻 5. Código de Exemplo para o Backend OptmaMenu

### Exemplo em Node.js / Express / TypeScript:
```typescript
import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

const OPTMAPAY_WEBHOOK_SECRET = process.env.OPTMAPAY_WEBHOOK_SECRET || 'sec_optmapay_menu_live_2026';

app.post('/webhooks/optmapay', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-optmapay-signature'];
    const event = req.headers['x-optmapay-event'];
    const isSandbox = req.headers['x-optmapay-environment'] === 'sandbox';

    // 1. Validação de Segurança
    if (signature !== `sha256_mock_${OPTMAPAY_WEBHOOK_SECRET}`) {
      console.warn('⚠️ Assinatura de Webhook OptmaPay Inválida!');
      return res.status(401).json({ error: 'Assinatura inválida' });
    }

    const { event: payloadEvent, data } = req.body;
    console.log(`🔔 Notificação recebida do OptmaPay [${event}]:`, data.orderId);

    // 2. Processar evento de acordo com a regra do OptmaMenu
    switch (payloadEvent) {
      case 'order.paid':
      case 'pix.paid':
        // Ação: Atualizar status do pedido para 'CONFIRMADO' / 'EM PREPARO'
        await updateOrderStatusInOptmaMenu(data.orderId, 'EM_PREPARO', {
          transactionId: data.transactionId,
          amountPaid: data.grossAmount,
          paidAt: new Date(),
        });

        // Notificar impressora térmica / tela KDS da cozinha
        await dispatchToKitchenDisplay(data.orderId);
        break;

      case 'payment.settled':
        // Recebível caiu na conta do restaurante
        console.log(`💰 Saldo liquidado para o pedido ${data.orderId}`);
        break;

      default:
        console.log(`Evento não monitorado: ${payloadEvent}`);
    }

    // 3. Resposta obrigatória HTTP 200 para confirmar recebimento
    return res.status(200).json({ received: true, realMoney: false });
  } catch (error: any) {
    console.error('Erro ao processar webhook:', error);
    return res.status(500).json({ error: error.message });
  }
});
```

---

### Exemplo em PHP (Laravel / Tradicional):
```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Order;

class OptmaPayWebhookController extends Controller
{
    public function handle(Request $request)
    {
        $signature = $request->header('x-optmapay-signature');
        $expectedSecret = env('OPTMAPAY_WEBHOOK_SECRET', 'sec_optmapay_menu_live_2026');

        if ($signature !== 'sha256_mock_' . $expectedSecret) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $payload = $request->all();
        $event = $payload['event'] ?? '';
        $data = $payload['data'] ?? [];

        if ($event === 'order.paid' || $event === 'pix.paid') {
            $order = Order::where('code', $data['orderId'])->first();
            if ($order && $order->status !== 'PAID') {
                $order->status = 'EM_PREPARO';
                $order->payment_id = $data['transactionId'];
                $order->save();

                // Disparar evento para a cozinha
                event(new OrderSentToKitchen($order));
            }
        }

        return response()->json(['received' => true, 'realMoney' => false], 200);
    }
}
```

---

## 🛡️ 6. Políticas de Segurança e Reenvio (Retries)

1. **Proteção Anti-SSRF**:
   - O OptmaPay Sandbox não dispara para IPs locais (`127.0.0.1`, `localhost`, `192.168.x.x`). Para desenvolvimento local, exponha seu backend OptmaMenu usando **ngrok** (`https://xxx.ngrok-free.app/webhooks/optmapay`).
2. **Idempotência no OptmaMenu**:
   - Como webhooks podem ser reenviados caso sua API demore a responder (> 5 segundos), certifique-se de validar se o pedido já está pago antes de duplicar comandos para a cozinha.
3. **Reenvio Manual**:
   - No painel do desenvolvedor do OptmaPay (`/dev-panel`), há uma tabela de auditoria com o botão **"Reenviar Webhook"** para simular falhas e testes de resiliência.
