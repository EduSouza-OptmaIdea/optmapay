# 📦 Retenção de Dados (60 Dias), Alertas e Backup JSON — OptmaPay Sandbox

Documento sobre a política de retenção temporal, disparo preventivo de alertas e modelo de exportação de dados (Portabilidade LGPD) do **OptmaPay Sandbox**.

---

## 1. Ciclo de Vida dos Dados no Plano Gratuito (60 Dias)

Para manter a integridade, performance e conformidade com a LGPD no ambiente de desenvolvimento, contas de teste criadas no modelo gratuito possuem um ciclo de vida de **60 dias**.

```
[Dia 0] Criação da Conta Sandbox
   │
[Dia 53] Disparo do 1º Alerta por E-mail (Faltam 7 dias para expiração)
   │
[Dia 58] Disparo do 2º Alerta por E-mail (Faltam 2 dias para expiração)
   │
[Dia 59] Disparo do 3º Alerta por E-mail (Falta 1 dia para expiração)
   │
[Dia 60] Purga Automática via RPC cleanup_expired_sandbox_data
```

> **Futura Monetização:** O prazo de retenção e limites de contas serão configuráveis em planos premium (ex: retenção estendida de 1 ano, 2 anos ou ilimitada).

---

## 2. Exportação de Backup em JSON (Portabilidade LGPD)

A qualquer momento, o desenvolvedor pode gerar e baixar o backup integral de qualquer uma de suas contas sandbox.

### Estrutura do Arquivo `optmapay-backup-{nome}-{data}.json`:
```json
{
  "export_version": "1.0.0",
  "exported_at": "2026-08-29T19:45:00.000Z",
  "environment": "sandbox",
  "realMoney": false,
  "account": {
    "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "name": "OptmaIdea Vendas & Soluções LTDA",
    "type": "merchant",
    "cpf_cnpj": "45.892.102/0001-90",
    "balance": 10000.00,
    "pix_key": "vendas@optmaidea.com.br",
    "agency": "0001",
    "account_number": "40592-8"
  },
  "transactions": [ ... ],
  "boletos": [ ... ],
  "cartoes": [ ... ],
  "webhooks_config": [ ... ]
}
```

---

## 3. Exclusão sob Demanda (Direito ao Esquecimento)

Se o usuário desejar eliminar sua conta antes dos 60 dias, a exclusão pode ser acionada diretamente no painel através da RPC `delete_sandbox_account`, que remove em cascata todos os registros relacionados.
