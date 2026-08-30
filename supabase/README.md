# 🗄️ Supabase - OptmaPay Sandbox

Guia técnico de estrutura, migrações, funções atômicas RPC, templates de e-mail e arquitetura transacional para o **OptmaPay Sandbox Dev Bank** (baseado nos padrões do ecossistema **OptmaSMSGate**).

---

## 📁 Estrutura de Pastas

```
supabase/
├── migrations/
│   ├── 20260829000000_initial_schema.sql         # Tabelas, índices, extensões e RLS
│   ├── 20260829000001_rpc_functions.sql          # RPCs atômicas (transfer_pix, settle_boleto, delete_sandbox_account, export_account_data_json)
│   └── 20260829000002_data_retention_and_warnings.sql # Política de retenção de 60 dias e avisos
├── email-templates/
│   ├── confirm-signup.html                       # [Auth] Confirmação de e-mail no cadastro ({{ .ConfirmationURL }})
│   ├── magic-link.html                           # [Auth] Link mágico de login sem senha ({{ .ConfirmationURL }})
│   ├── reset-password.html                       # [Auth] Redefinição de senha ({{ .ConfirmationURL }})
│   ├── password-changed.html                     # [Auth] Confirmação de troca de senha
│   ├── change-email.html                         # [Auth] Confirmação de troca de e-mail ({{ .ConfirmationURL }})
│   ├── email-changed.html                        # [Auth] Confirmação de novo e-mail ativo
│   ├── reauthentication.html                     # [Auth] Código de reautenticação ({{ .Token }})
│   ├── invite-user.html                          # [Auth] Convite de usuário ({{ .ConfirmationURL }})
│   ├── app-welcome.html                          # [App Transacional] Boas-vindas pós-confirmação ({{GREETING}})
│   ├── app-account-deleted.html                  # [App Transacional] Despedida pós-exclusão LGPD ({{ACCOUNT_NAME_LINE}})
│   └── data-retention-warning.html               # [App Transacional] Aviso de retenção de 60 dias (7, 2 e 1 dia)
├── functions/
│   ├── retention-worker/                         # Edge Function de purga e monitoramento de 60 dias
│   ├── webhook-dispatcher/                       # Edge Function de envio de webhooks HTTPS com HMAC
│   └── deno.d.ts / tsconfig.json                 # Tipagens Deno isoladas
└── README.md                                     # Este documento
```

---

## 📧 Arquitetura de E-mails: Supabase Auth vs. Backend da Aplicação

Seguindo a mesma arquitetura validada do **OptmaSMSGate**, dividimos os e-mails em duas camadas de responsabilidade:

| Camada | Quem envia | Templates | Variáveis / Placeholders |
|---|---|---|---|
| **Supabase Auth** | Servidor de Auth do Supabase | `confirm-signup.html`<br>`magic-link.html`<br>`reset-password.html`<br>`change-email.html`<br>`reauthentication.html`<br>`invite-user.html`<br>`password-changed.html`<br>`email-changed.html` | `{{ .ConfirmationURL }}`<br>`{{ .Token }}`<br>`{{ .SiteURL }}`<br>`{{ .Email }}`<br>`{{ .NewEmail }}` |
| **Backend Transacional** | Backend Serverless via SMTP | `app-welcome.html`<br>`app-account-deleted.html`<br>`data-retention-warning.html` | `{{GREETING}}`<br>`{{ACCOUNT_NAME_LINE}}`<br>`{{DAYS_LEFT}}` |

---

## 🚀 Como Executar as Migrações no Supabase

1. Acesse o **[Painel do Supabase](https://supabase.com/dashboard)** no projeto `wertmoquxdrucdbobuie`.
2. Vá em **SQL Editor** -> **+ New Query**.
3. Execute os arquivos em ordem:
   - `20260829000000_initial_schema.sql`
   - `20260829000001_rpc_functions.sql`
   - `20260829000002_data_retention_and_warnings.sql`
4. Na aba **Database** -> **Replication**, certifique-se de que as tabelas `accounts`, `transactions` e `boletos` estão com o **Realtime ativado**.

---

## ⚙️ Configuração dos Templates no Painel do Supabase

No painel do Supabase em **Authentication -> Email Templates**, copie e cole os arquivos correspondentes:
- **Confirm signup**: `confirm-signup.html`
- **Magic Link**: `magic-link.html`
- **Reset Password**: `reset-password.html`
- **Change Email Address**: `change-email.html`
- **Reauthentication**: `reauthentication.html`
- **Invite user**: `invite-user.html`

Todos os templates contam com a logo oficial em `https://wertmoquxdrucdbobuie.supabase.co/storage/v1/object/public/images/optmapay-logo-tema-claro.png` e a paleta oficial da OptmaIdea (`#29324E`, `#F1613A`, `#19A999`).
