<p align="center">
  <img src="https://wertmoquxdrucdbobuie.supabase.co/storage/v1/object/public/images/optmapay-logo-tema-claro.png" alt="OptmaPay Sandbox Dev Bank" width="340" />
</p>

<p align="center">
  <strong>O Internet Banking Fictício para Homologação de Checkout, Pix Dinâmico, Boletos e Webhooks</strong>
</p>

<p align="center">
  <a href="https://optmapay.optmaidea.com.br"><img src="https://img.shields.io/badge/Production-optmapay.optmaidea.com.br-19A999?style=for-the-badge&logo=vercel" alt="Production Domain" /></a>
  <img src="https://img.shields.io/badge/Environment-Sandbox-F1613A?style=for-the-badge" alt="Environment Sandbox" />
  <img src="https://img.shields.io/badge/realMoney-false-FAA832?style=for-the-badge" alt="Real Money False" />
  <img src="https://img.shields.io/badge/LGPD-Compliant-29324E?style=for-the-badge" alt="LGPD Compliant" />
</p>

---

## 📌 Visão Geral

O **OptmaPay Sandbox** é uma plataforma de simulação bancária e liquidação de vendas online projetada para desenvolvedores, e-commerces, ERPs e aplicativos do ecossistema **OptmaIdea**. 

Ele permite testar todo o ciclo financeiro de compras — desde a emissão de cobranças Pix com QR Code dinâmico, boletos com linha digitável e cartões virtuais até o disparo automático de **Webhooks HTTPS** e liquidação de duplicatas — sem riscos e sem utilizar dinheiro real.

> ⚠️ **Regra de Ouro (Golden Rule):** Todas as transações, extratos, respostas de API e payloads de webhooks operam exclusivamente com `"realMoney": false` e `"environment": "sandbox"`.

---

## ✨ Recursos Principais

- ⚡ **Área Pix em Tempo Real**: Cobrança dinâmica com valor fixo, QR Code estático, leitor de câmera para WebApp mobile e instrução customizada `OPTMAPAY://PIX/v1`.
- 🔄 **Sincronização Instantânea sem Reload**: Atualização reativa de saldos e extratos via **Supabase Realtime (WebSockets)** em milissegundos entre contas recebedoras e pagadoras.
- 🧾 **Simulador de Baixa de Duplicatas**: Fluxo completo de liquidação entre Empresa (*Merchant*) e Cliente (*Customer*).
- 📄 **Boletos Bancários com Linha Digitável**: Emissão, cancelamento e quitação imediata de títulos simulados.
- 💳 **Cartões Virtuais de Teste**: Emissão de cartões de débito e crédito com limites ajustáveis.
- 🔔 **Disparo de Webhooks HTTPS com HMAC**: Auditoria completa de eventos (`pix.paid`, `boleto.paid`, `order.paid`) com tentativas de entrega e assinatura secreta.
- 📱 **Mobile WebApp & PWA**: Experiência responsiva de aplicativo bancário com suporte a instalação na tela inicial (PWA) e temas **Claro**, **Escuro** e **Sistema**.
- 🛡️ **Conformidade LGPD & Retenção de 60 Dias**: Exportação de **Backup Completo em JSON** e exclusão atômica em cascata via RPC PostgreSQL (`delete_sandbox_account`).

---

## 🏗️ Arquitetura do Sistema

O projeto adota o padrão **Backend-First, Frontend-Reader**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 18 + Vite)                      │
│   • Landing Institucional (/)            • Área Pix (/pix)             │
│   • Login & Magic Link (/login)          • Extrato & Boletos           │
│   • Onboarding (/onboarding)             • Meus Dados & Backups        │
└────────────────────────────────────────────────────────────────────────┘
                                    │ ▲
                 (RPCs Transacionais) │ │ (Supabase Realtime WebSocket)
                                    ▼ │
┌────────────────────────────────────────────────────────────────────────┐
│                     BACKEND & DB (PostgreSQL Supabase)                 │
│   • Supabase Auth (E-mail, Senha, Magic Link & SMTP Brevo)             │
│   • Funções Atômicas: transfer_pix, settle_boleto, deposit_funds       │
│   • Exclusão em Cascata: delete_sandbox_account (LGPD)                 │
│   • Exportação Estruturada: export_account_data_json                   │
│   • Edge Functions: retention-worker & webhook-dispatcher              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons |
| **Roteamento & SPA** | React Router DOM v7, Vercel Rewrites (`vercel.json`) |
| **Backend & Banco de Dados** | Supabase (PostgreSQL 15), Supabase Auth, Row Level Security (RLS) |
| **Comunicação em Tempo Real** | Supabase Realtime (Postgres Changes via WebSockets) |
| **Serviço de E-mails** | SMTP Próprio (Brevo Relay) com 11 templates HTML responsivos |
| **Hospedagem & CI/CD** | Vercel (Deploy automático via GitHub Dual Remote) |

---

## ⚙️ Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz do projeto (ou configure no painel da Vercel):

```ini
# Supabase
VITE_SUPABASE_URL=https://sua-instancia.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_publica_anon

# Servidor SMTP (Server-side / Vercel)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=seu_usuario_smtp
SMTP_PASSWORD=sua_senha_ou_api_key_smtp
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_FROM_EMAIL=naoresponda@auth.optmapay.optmaidea.com.br
SMTP_FROM_NAME="OptmaPay | Banco Sandbox para Devs"
```

---

## 🚀 Como Executar Localmente

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/EduSouza-OptmaIdea/optmapay.git
   cd optmapay
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Execute o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```

4. **Execute as Migrações no Supabase:**
   Acesse o SQL Editor do Supabase e execute os scripts da pasta `supabase/migrations/`:
   - `20260829000000_initial_schema.sql`
   - `20260829000001_rpc_functions.sql`
   - `20260829000002_data_retention_and_warnings.sql`

---

## 📧 Suíte de Templates de E-mail

Localizados em [`supabase/email-templates/`](./supabase/email-templates/):

- **Auth (Supabase)**: `confirm-signup.html`, `magic-link.html`, `reset-password.html`, `password-changed.html`, `change-email.html`, `email-changed.html`, `reauthentication.html`, `invite-user.html`.
- **Transacional (Backend)**: `app-welcome.html`, `app-account-deleted.html`, `data-retention-warning.html`.

---

## ⚖️ Licença e Governança

Desenvolvido por **[OptmaIdea](https://optmaidea.com.br)**.  
Copyright © 2026 OptmaIdea. Todos os direitos reservados.
