# 🗄️ Supabase - OptmaPay Sandbox

Guia técnico de estrutura, migrações, funções atômicas RPC, templates de e-mail e edge functions para o **OptmaPay Sandbox Dev Bank**.

---

## 📁 Estrutura de Pastas

```
supabase/
├── migrations/
│   ├── 20260829000000_initial_schema.sql         # Tabelas, índices, extensões e RLS
│   ├── 20260829000001_rpc_functions.sql          # RPCs atômicas (transfer_pix, settle_boleto, delete_sandbox_account, export_account_data_json)
│   └── 20260829000002_data_retention_and_warnings.sql # Política de retenção de 60 dias e avisos
├── email-templates/
│   ├── confirm-signup.html                       # Confirmação de e-mail no cadastro
│   ├── magic-link.html                           # Link mágico de login sem senha
│   ├── reset-password.html                       # Redefinição de senha
│   ├── change-email.html                         # Confirmação de troca de e-mail
│   ├── data-retention-warning.html               # Aviso de expiração (7, 2 e 1 dia)
│   └── account-deleted.html                      # Confirmação de exclusão total LGPD
├── functions/
│   ├── retention-worker/                         # Edge Function de purga e monitoramento de 60 dias
│   └── webhook-dispatcher/                       # Edge Function de envio de webhooks HTTPS com HMAC
└── README.md                                     # Este documento
```

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

## 📧 Configuração dos Templates de E-mail

No painel do Supabase:
1. Vá em **Authentication** -> **Email Templates**.
2. Copie o conteúdo HTML dos arquivos em `supabase/email-templates/` e cole nos respectivos campos:
   - **Confirm signup**: `confirm-signup.html`
   - **Magic Link**: `magic-link.html`
   - **Reset Password**: `reset-password.html`
   - **Change Email Address**: `change-email.html`
3. Salve as alterações.
