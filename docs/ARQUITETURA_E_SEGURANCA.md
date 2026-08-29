# 🏛️ Arquitetura, Segurança e Conformidade — OptmaPay Sandbox

Documento técnico oficial da arquitetura do **OptmaPay Sandbox Dev Bank**, especificando padrões backend-first, segurança, isolamento e conformidade com a LGPD.

---

## 1. Visão Geral do Sistema

O **OptmaPay Sandbox** foi concebido sob a filosofia *"Backend-First, Frontend-Reader"*:
- **Frontend (React + Vite + Tailwind CSS)**: Responsável unicamente pela renderização da interface, captura de ações do usuário e leitura reativa de estados via WebSocket Supabase Realtime.
- **Backend (PostgreSQL Supabase + Edge Functions + RLS + RPCs)**: Concentra **100% da lógica transacional**, consistência atômica de saldos, disparo seguro de webhooks com HMAC e políticas de expiração e purga.

---

## 2. Diagrama de Arquitetura

```
+-----------------------------------------------------------------------------------+
|                              INTERFACE DO USUÁRIO                                 |
|  - Landing Institucional (/)                - Área Pix (/pix)                     |
|  - Login / Auth (/login)                    - Boletos & Cartões (/boletos)        |
|  - Onboarding (/onboarding)                 - Meus Dados & Backups (/meus-dados)  |
+-----------------------------------------------------------------------------------+
                                         │  ▲
                     (Chamadas RPC Seguras) │  │ (Supabase Realtime WebSocket)
                                         ▼  │
+-----------------------------------------------------------------------------------+
|                              SUPABASE BACKEND                                     |
|  ├── Supabase Auth (E-mail / Senha / Magic Link / SMTP Brevo)                     |
|  ├── PostgreSQL Schema (accounts, transactions, boletos, cartoes, webhooks)       |
|  ├── Row Level Security (RLS) & Triggers                                          |
|  ├── Funções Atômicas (transfer_pix, settle_boleto, delete_sandbox_account)       |
|  └── Edge Functions (retention-worker, webhook-dispatcher)                        |
+-----------------------------------------------------------------------------------+
```

---

## 3. Diretrizes de Segurança

### 3.1 Isolamento Sandbox e Regra de Ouro (Golden Rule)
- Todas as respostas de API, payloads de webhooks e lançamentos de extrato contêm obrigatoriamente:
  ```json
  {
    "realMoney": false,
    "environment": "sandbox"
  }
  ```
- Nenhuma operação envolve liquidação bancária real no Sistema de Pagamentos Brasileiro (SPB) ou no Banco Central.

### 3.2 Proteção Contra Vulnerabilidades (SSRF & Injeções)
- **Disparo de Webhooks**: O `webhook-dispatcher` implementa timeout estrito de 5 segundos e validação de URLs contra faixas de IP privados (`127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`).
- **Assinatura HMAC**: Cada payload enviado contém um cabeçalho `x-optmapay-secret` para conferência de autenticidade pela aplicação recebedora.

---

## 4. Conformidade LGPD e Privacidade

| Pilar LGPD | Implementação Técnica no OptmaPay |
|---|---|
| **Finalidade** | Dados utilizados exclusivamente para simulação técnica de APIs e checkout. |
| **Não Compartilhamento** | Dados fictícios e credenciais nunca são vendidos ou compartilhados. |
| **Portabilidade (Art. 18)** | Download de backup completo em formato padronizado JSON na seção Meus Dados. |
| **Direito ao Esquecimento** | Exclusão atômica em cascata via RPC `delete_sandbox_account`. |
| **Transparência** | Páginas públicas `/termos-de-uso` e `/politica-de-privacidade` com Cookie Banner. |
