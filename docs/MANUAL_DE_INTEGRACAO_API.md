# 🔌 Manual de Integração de APIs & Webhooks — OptmaPay Sandbox

Guia prático para desenvolvedores integrarem sistemas de e-commerce, ERPs, PDVs e aplicativos com o **OptmaPay Sandbox**.

---

## 1. Padrão de Codificação de Instrução Pix OptmaPay

O OptmaPay Sandbox utiliza um formato de payload específico para QR Codes e Copia e Cola, garantindo que o aplicativo do banco preencha pagador, recebedor, valor e referência do pedido instantaneamente:

```
OPTMAPAY://PIX/v1?to={chave_pix}&name={nome_recebedor}&amount={valor}&ref={order_id}&desc={descricao}&env=sandbox
```

### Exemplo de Payload:
```
OPTMAPAY://PIX/v1?to=vendas@optmaidea.com.br&name=OptmaIdea%20Vendas&amount=249.90&ref=PED-98402&desc=Pedido%20Loja%20Online&env=sandbox
```

---

## 2. Formato dos Eventos de Webhook

Quando um pagamento Pix ou boleto é quitado no sandbox, a Edge Function do OptmaPay dispara um `POST` HTTPS para o endpoint cadastrado na aba Desenvolvedor.

### Cabeçalhos Enviados:
```http
POST /api/webhooks/optmapay HTTP/1.1
Host: seu-site.com.br
Content-Type: application/json
x-optmapay-event: pix.paid
x-optmapay-real-money: false
x-optmapay-environment: sandbox
x-optmapay-secret: whsec_test_98f4a1c0d2e8
```

### Exemplo de Payload JSON Recebido:
```json
{
  "event": "pix.paid",
  "realMoney": false,
  "environment": "sandbox",
  "data": {
    "transactionId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "amount": 249.90,
    "externalReference": "PED-98402",
    "payer": {
      "name": "Carlos Eduardo Silva",
      "cpf": "123.456.789-00"
    },
    "receiver": {
      "name": "OptmaIdea Vendas & Soluções LTDA",
      "pixKey": "vendas@optmaidea.com.br"
    },
    "settledAt": "2026-08-29T19:30:00Z"
  },
  "timestamp": "2026-08-29T19:30:01Z"
}
```

---

## 3. Boas Práticas para o Endpoint de Webhook

1. **Retornar HTTP 200 Imediatamente**: Responda o webhook em até 3 segundos antes de executar processamentos pesados.
2. **Validar o Secret**: Verifique se o cabeçalho `x-optmapay-secret` confere com o segredo cadastrado no painel Dev.
3. **Idempotência**: Processe o `transactionId` de forma idempotente para evitar baixas duplicadas caso haja retry.
