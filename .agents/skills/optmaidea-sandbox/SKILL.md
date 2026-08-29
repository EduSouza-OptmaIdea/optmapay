---
name: optmaidea-sandbox
description: Guidelines, architecture specs, design system, and business logic for OptmaPay Sandbox (optmapay-sandbox) - internet banking simulator for testing online sales payment workflows, duplicatas, and webhooks in the OptmaIdea ecosystem.
---

# OptmaPay Sandbox Skill Guide (`optmapay-sandbox`)

This skill defines the technical standards, branding rules, and business logic for `optmapay-sandbox`, part of the **OptmaIdea** ecosystem.

---

## 1. Identidade Visual e Design System

### Paleta de Cores Oficial
- **Navy Principal**: `#29324E` (Header institucional, base dos cards dark e textos principais)
- **Coral / Laranja CTA**: `#F1613A` (Botões de ação primária, badge Pay e botões de conversão)
- **Verde-Água / Teal**: `#19A999` (Status ativo/sucesso, links secundários e ícones de confirmação)
- **Mostarda / Atenção**: `#FAA832` (Alertas intermediários e avisos sandbox)
- **Roxo Premium**: `#7B2D8E` (Totalizadores, faturamento e duplicatas)
- **Vermelho Alerta**: `#DC2626` (Exclusivo para erros críticos e falhas de pagamento)
- **Fundo Claro**: `#F8F6F2` (Off-white aconchegante)
- **Fundo Escuro**: `#0F172A` / `#0B1120` (Dark mode premium)

### Tipografia
- Fonte Principal: `"Plus Jakarta Sans"`, Candara, Inter, Segoe UI, sans-serif
- Fonte Mono (Chaves, IDs, Extratos): `"JetBrains Mono"`, monospace

### Modos de Tema
- Suporte a 3 modos via `ThemeContext`: **Claro** (`light`), **Escuro** (`dark`) e **Sistema** (`system` automático).

---

## 2. Princípios Fundamentais & Regra Sandbox
- **Regra de Ouro (Golden Rule)**: Todas as operações, extratos, retornos de API e payloads de webhooks DEVEM retornar:
  ```json
  {
    "realMoney": false,
    "environment": "sandbox"
  }
  ```
- **Aviso Obrigatório**: Banner de topo persistente e legível informando que trata-se de ambiente de testes fictício.
- **Copyright Oficial**: `OptmaIdea 2026. Direitos reservados.` com link para `https://optmaidea.com.br`.

---

## 3. Arquitetura Técnica & Rotas
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + React Router DOM
- **Backend & Auth & DB**: 100% Supabase (PostgreSQL, Supabase Auth, Webhooks, Edge/RPC Functions, Realtime WebSocket)
- **Rotas Públicas**:
  - `/` -> `PublicHome` (Landing institucional, apresentação, banners, Formspree)
  - `/login` -> `Login` (Supabase Auth: E-mail/Senha e Magic Link)
  - `/onboarding` -> `Onboarding` (Abertura da primeira conta digital de teste)
- **Rotas Privadas (Protegidas)**:
  - `/dashboard` -> Visão geral, saldo e extrato unificado
  - `/pix` -> Área Pix com QR Code dinâmico, leitor de câmera e extrato exclusivo
  - `/boletos` -> Emissão e quitação de boletos
  - `/cartoes` -> Cartões virtuais de débito e crédito
  - `/settlement` -> Simulador de liquidação de duplicatas de e-commerce
  - `/dev` -> Painel do desenvolvedor, API Keys e Webhook Logs
  - `/meus-dados` -> Perfil do operador autenticado e contas vinculadas
  - `/settings` -> Reset de dados e configurações

---

## 4. Integrações Externas
- **Formulário de Contato**: Formspree endpoint `https://formspree.io/f/mljrvyga` com destino `optmapay.faleconosco@optmaidea.com.br`.
- **E-mails Transacionais / Auth**: SMTP customizado (Brevo / Supabase Auth) com templates localizados em `docs/email-templates/`.
- **Domínios de Produção**:
  - `https://optmapay.optmaidea.com.br`
  - `https://www.optmapay.optmaidea.com.br`
  - `https://optmapay.vercel.app`
- **SPA Rewrites**: `vercel.json` configurado para evitar 404 em recarregamento de página.

---

## 5. Padrão de Codificação de Instrução Pix OptmaPay
Instrução gerada em QR Codes e Copia e Cola:
`OPTMAPAY://PIX/v1?to={chave}&name={nome}&amount={valor}&ref={pedido}&desc={descricao}&env=sandbox`
- Permite que a aplicação receptora preencha automaticamente pagador, recebedor, valor e referência sem depender de APIs externas.
