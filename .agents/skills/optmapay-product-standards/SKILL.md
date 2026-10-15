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

## 3. Padrão de nomenclatura: snake_case no Supabase/PostgreSQL

**Decisão do proprietário em 15/10/2026:** o padrão principal de banco de dados é **snake_case**, não camelCase. A arquitetura do OptmaPay já adota amplamente esta convenção. Padronizar as partes novas **sem migrar nem renomear desnecessariamente o schema atual**.

### Banco de dados, RPCs e contratos de persistência
- Novas **tabelas**, **colunas**, **views**, **índices**, **constraints**, **policies**, **triggers**, **funções e procedimentos SQL**, **parâmetros de RPC**, nomes de eventos internos e campos persistidos: usar **inglês técnico em `snake_case`**. Exemplos: `family_accounts`, `guardian_user_id`, `created_at`, `monthly_spending_limit`, `create_learning_account(p_guardian_id uuid)`.
- Respeitar os nomes de produtos e estruturas existentes, inclusive exceções históricas em português, sem mudanças cosméticas perigosas. `accounts`, `transactions`, `cartoes`, `platform_limit_requests` e `credit_card_invoice_items` continuam com seus contratos atuais.
- PostgreSQL não exige aspas para identificadores `snake_case` minúsculos; evitar a necessidade de citar `"camelCase"` em SQL.
- API pública e webhooks: **preservar exatamente a versão e formato já contratados**. Para novas rotas de serviços, preferir JSON com propriedades `snake_case` **quando o contrato for de dados bancários, SDK ou interoperabilidade**, e documentar explicitamente qualquer contrato existente em outro padrão. Não quebrar integrações OptmaMenu.
- Supabase/RLS: toda mudança nova deve ter revisão de migrations, policies, grants e chamadas `supabase.rpc()` de todos os consumidores.

### Código React, TypeScript e componentes
- **Variáveis, funções, hooks, estados e propriedades locais de código JS/TS:** `camelCase` conforme convenções do ecossistema, por exemplo `activeAccount`, `loadAccounts()`, `useAuth()`.
- **Componentes React, tipos e interfaces TypeScript:** `PascalCase`, por exemplo `BankingExperiencePreview` e `AccountPolicy`. **Constantes globais imutáveis:** `UPPER_SNAKE_CASE` quando apropriado.
- Os campos que espelham respostas do Supabase, RPCs e contratos externos **mantêm `snake_case`** na camada de transporte; um adapter tipado pode converter para modelo de UI `camelCase` se isso melhorar legibilidade, **sem alterar os nomes do banco**.
- Comentários e explicações de funções **em pt-BR**, textos apresentados ao usuário **em pt-BR**; identificadores internos preferencialmente inglês.
- Não usar renomeação automática de tabelas/colunas como “refatoração de estilo”. Para substituir um contrato realmente necessário, abrir RFC específica com inventário de dependências, camada de compatibilidade, versionamento e regressão completa.

### Checklist de revisão
- [ ] Novo identificador SQL está em `snake_case` e em inglês técnico?
- [ ] Nomes de colunas e parâmetros das RPCs são preservados nas chamadas existentes?
- [ ] Qualquer objeto JS/TS proveniente do Supabase mantém chaves contratadas ou usa adapter explícito?
- [ ] Componentes React seguem `PascalCase` e variáveis/hooks locais seguem `camelCase`?
- [ ] Texto visível e comentários explicativos estão em português brasileiro?
- [ ] Nenhuma migração destrutiva ou alteração desnecessária do contrato OptmaMenu foi proposta?

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
