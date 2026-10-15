---
name: optmapay-product-standards
description: Regras obrigatórias de idioma, nomenclatura, UX acessível, ambientes sandbox, integrações e proteção de contas familiares e educacionais no OptmaPay.
---

# OptmaPay — Padrões de produto e engenharia

## 1. Escopo e baseline
- Projeto `EduSouza-OptmaIdea/optmapay`. Preservar `main`, PRs, políticas de autorização e integrações OptmaMenu existentes.
- Ler também `.agents/skills/optmaidea-sandbox/SKILL.md`, `docs/ARQUITETURA_E_SEGURANCA.md` e o handoff mais recente.
- Separar três planos de autoridade: plataforma `admin`, contas bancárias sandbox `customer/merchant` e ambientes educacionais `guardian/learner/instructor`. Um papel não concede outro.
- Em toda mutação financeira, autenticação no servidor, autorização por tenant/conta, bloqueio transacional, registros auditáveis e idempotência. Nunca inventar sucesso no frontend.

## 2. Português brasileiro, localização e terminologia
- **pt-BR** é idioma obrigatório e padrão de toda UI pronta: títulos, rótulos, botões, placeholders, toast, mensagens de erro, comprovantes, e-mails, textos de ajuda, acessibilidade, avisos sandbox, relatórios.
- Idiomas planejados: **en-US e es-ES**. Mostrar no seletor com bandeiras e `EN`/`ES` como "Em breve"; **não** ativar idioma que ainda não tem catálogo completo/validado nem misturar idiomas.
- Usar `Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})`, data/hora em `pt-BR` com `America/Sao_Paulo` quando regra de negócio exigir, e formatar datas por utilitário central.
- Estado atual contém jargões e rótulos mistos (ex.: Dashboard, Home Banking, User, Dev, SQL). Corrigir progressivamente quando textos sejam exibidos ao usuário; nomes de produtos/tecnologias e termos técnicos de desenvolvedor podem permanecer como nomes próprios.
- Comentários explicativos, ADRs, guias de negócio e anotações sobre funções: **português brasileiro**. Identificadores técnicos, contratos de API e nomes de módulos em inglês, quando apropriado.
- Sem traduções literais frágeis no componente: novas telas devem resolver `translationKey` em dicionário versionado. Revisão por pessoa antes de publicar novo idioma.

## 3. Padrão camelCase e contratos legados
- Variáveis, funções, métodos, estados, propriedades JSON, campos DTO, modelos TypeScript e nomes de componentes *lógicos*: **camelCase**; React Components: **PascalCase**; constantes fixas: **UPPER_SNAKE_CASE**; arquivos de componentes: PascalCase; demais arquivos: camelCase ou kebab-case de acordo com tooling.
- Novas tabelas e colunas de domínio financeiro/educacional devem ter nomes funcionais em inglês e `camelCase`, quando aprovadas na ADR de banco. Em PostgreSQL, `"camelCase"` exige aspas em SQL e também nos nomes de relacionamentos e RLS.
- **Não renomear diretamente o schema legado** de `public` (ex.: `accounts`, `transactions`, `platform_limit_requests`, `credit_card_invoice_items`) sem inventário, adapters, novas RPCs, views de compatibilidade, cobertura de RLS e testes de contrato com OptmaMenu.
- Em fronteiras com legados usar transformadores explícitos de `snake_case` para `camelCase`, por exemplo `created_at` → `createdAt`, `account_id` → `accountId`. Nunca renomear chaves obrigatórias das APIs existentes sem versionamento. Nomes de tabelas legadas permanecem até migração aprovada.
- Migração estruturada: inventário de dependências → compatibilidade expand → migração de consumidores → CI contract tests → depreciação controlada (não imediata).

## 4. UX de internet banking e mobile
- **Mobile-first** (360–430 px) com variações para tablets 768 px e desktop 1280 px; testes em 320, 375, 390, 768 e 1440 px.
- Não bloquear zoom; navegação por teclado, foco visível, alvo de toque confortável (ideal 44x44 CSS px), contraste WCAG AA e estados loading/empty/error/success acessíveis.
- Nova hierarquia: saldo real da conta fictícia, atalho Pix, depósito, pagar contas, cartões, extrato, limites, mensagens. Proteção de saldo visível/oculto e aviso permanente de `sandbox`.
- A jornada `edu` apresenta objetivo, tarefa e reflexão sem competir com o fluxo `dev`. Não misturar resultados de aplicações educacionais com rendimentos/ações reais.
- Sem números, avaliações, gráficos ou extratos fabricados em telas que pretendem representar a conta autenticada. Se uma prévia usa dados demonstrativos, rotular como **exemplo**.
- Privacidade e segurança em estado de conta deslogada, sessão expirada, múltiplas contas e telas compartilhadas.
- Inspiração em bancos é de **padrões de interação**, nunca copiar marca, layout, assets, textos, logos ou decisões gráficas exclusivas de concorrentes.

## 5. Finanças fictícias, mercado e crianças
- **Regra inegociável:** `realMoney=false`, `environment='sandbox'` nas APIs financeiras e registros relevantes; valores não conversíveis, não sacáveis, não transferíveis a bancos reais, não apresentados como depósitos protegidos ou corretagem real.
- Assinaturas monetizadas do **software** devem passar por sistemas reais de cobrança totalmente segregados do razão fictício.
- Ativos pedagógicos: preferir símbolos fictícios e geração auditável com `seed` + regras de mercado documentadas. Se usar cotações, marcas ou tickers de terceiros, checar licenças antes. Evitar elementos com aparência de recomendação de investimento.
- **Famílias:** perfil do menor pseudonimizado, criado e autorizado por responsável, sem exigência de e-mail próprio em crianças. Pai/responsável não deve conseguir administrar contas externas; menor não tem funções admin ou API keys.
- Não usar `localStorage` ou PIN matemático como prova de consentimento dos pais ou proteção financeira. Qualquer saque, salário, compra, aplicação, tarefa e alteração de limites deve ser autorizado pelo servidor conforme regras do responsável e tenant.
- Experiências offline e modelos locais podem servir lições e exercícios **sem dados sensíveis**; operações de conta só com conexão, autenticação e ledger autoritativo.
- Salvaguardas para abuso e conteúdo inadequado devem combinar prevenção, detecção proporcional, revisão e possibilidade de contestação. **Não** promover vigilância intrusiva por padrão nem coleta excessiva de conversas de crianças.
- ECA Digital (Lei 15.211/2025, em vigor desde março de 2026), LGPD art.14, acessibilidade e contratos institucionais exigem avaliação jurídica antes de abrir para terceiros.
- OptmaSMSGate OTP é possibilidade **futura** de cadastro/login; não elevar o sistema a exigência de SMS ou WhatsApp nas operações educativas atuais.

## 6. Fluxo de execução com evidências
1. Confirmar commit GitHub, CI, Supabase migrations e Vercel; identificar branch de homologação e risco.
2. Não alterar `main` em experimentos de UI, catálogos, menores ou novos produtos. Preferir branch `agent/optmapay-ux-i18n-learning-20261015`.
3. Fechar cada pacote com implementação e teste de build/typecheck, segurança de RPC/RLS, responsividade, regressões `dev` e ao menos um teste manual.
4. Documentar decisão, mudança, migration, motivo, compatibilidade, reversão e próximos passos em `docs/`. Separar **entregue**, **protótipo**, **planejado**, **bloqueado**.
5. Nunca chamar um protótipo React de produto funcional financeiro se backend, autorização e ledger ainda não existirem.
