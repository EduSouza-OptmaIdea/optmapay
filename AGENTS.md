# OptmaPay — Orientações obrigatórias a agentes

Antes de qualquer mudança técnica ou de interface no repositório, leia:

1. `.agents/skills/optmaidea-sandbox/SKILL.md` — regras e arquitetura bancária existentes.
2. `.agents/skills/optmapay-product-standards/SKILL.md` — pt-BR, arquitetura de localização, **snake_case para Supabase/PostgreSQL**, UX e menores.
3. `docs/OPTMAIDEA_ECOSYSTEM_VISION_20261015.md` — visão, escopos, fronteiras e evolução.
4. `docs/OPTMA_PAY_UX_AND_ARCHITECTURE_20261015.md` — propostas de UX, infraestrutura e refatorações.
5. Handoff técnico mais recente, status do GitHub e migrations efetivamente aplicadas no Supabase.

## Invariantes não negociáveis

- Pagamentos, saldos, investimentos, compras e recompensas do sandbox são fictícios; **nunca** se convertem em dinheiro real.
- A separação `Platform Admin` versus `Sandbox Account Holder` versus `Guardian/Student` é aplicada por backend e RLS, nunca por alternador de UI/localStorage.
- **Banco Supabase/PostgreSQL usa `snake_case`** para tabelas, colunas, views, funções SQL e parâmetros RPC. **React/TypeScript usa `camelCase` para variáveis/hooks e `PascalCase` para componentes**. Não renomear nomes legados apenas por estilo.
- Códigos externos do OptmaMenu e integrações atuais não podem quebrar por mudanças de nomenclatura ou contrato.
- Interfaces e comunicações de usuários em **pt-BR**. EN/ES só serão habilitados quando a cobertura de tradução e revisão humana estiver completa.
- Iterar sobre a branch `agent/optmapay-ux-i18n-learning-20261015` sem mesclar na `main` automaticamente.
- A autenticação de responsáveis e proteção de menores exige tratamento jurídico/privacidade antes de produto externo; não confundir demo local com controle parental.
- Novos planos comerciais são assunto distinto de mensalidades **fictícias** bancárias por perfil PF/PJ.

Registre entregas, testes reais, bloqueios e riscos. Evite criar API, migration ou UI fingindo que um módulo planejado está pronto.
