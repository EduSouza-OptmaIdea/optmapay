# OptmaPay — P0.5 | Reconciliação de provenance de migrations (somente leitura)

**Data de auditoria:** 22/10/2026 — projeto Supabase `wertmoquxdrucdbobuie`.
**Objetivo:** identificar diferenças entre ledger do Supabase, GitHub canônico privado e GitHub espelho de implantação; impedir reconciliação automática insegura.

## Baseline real confirmado

- Supabase: PostgreSQL 17.6; **51** registros em `supabase_migrations.schema_migrations`.
- Canônico: `OptmaIdea/optmapay`, branch base do pacote P0.4 `392ac1177c134356e1dff9241da70814be4eaf4a`, **54** arquivos SQL.
- Espelho: `EduSouza-OptmaIdea/optmapay`, branch base P0.4 `57377325b7619e738fc4cb878a62a895e0792f93`, **55** arquivos SQL.
- Os **54** arquivos de migrations com os mesmos caminhos em ambos os repositórios têm **Git blob SHA-1 idênticos**. O espelho acrescenta `20261018013000_bank_receipts_history.sql`.
- Produção Vercel permanece ligada ao espelho `main`, `61655e208c66bc89f79d3a8e46cbd2b183dff547`. As branches `main` dos dois GitHubs não foram alteradas nesta auditoria.

## Reconciliação classificatória — NÃO é uma reparação do ledger

| Critério | Canônico | Espelho |
|---|---:|---:|
| Mesmo nome lógico e versão do ledger | 32 | 32 |
| Mesmo nome lógico, mas **versão SQL diferente** | 18 | 19 |
| Entrada no ledger sem SQL no diretório `supabase/migrations` | 1 | 0 |
| SQLs sem correspondência pelo nome no ledger | 4 | 4 |
| **Colisões entre versão registrada e outro arquivo no Git** | **1** | **1** |

**Colisão relevante:** `20261014130500` no ledger identifica `independent_exception_expiry_20261014`, mas no GitHub o arquivo de mesmo número é `20261014130500_deposits_policy_rounding_receipts.sql`. O conteúdo lógico de `independent_exception_expiry` aparece como `20261014135500_independent_exception_expiry.sql` nos dois repositórios. Portanto, correspondência apenas por timestamp produz falso positivo e `supabase db push`/replay pode executar SQL indevido.

**Comprovantes bancários:** o ledger registra `20261018013732_bank_receipts_history_20261018`; o espelho contém `20261018013000_bank_receipts_history.sql`. No canônico, não há arquivo executável em migrations; existe cópia **não executável** `docs/recovered/20261018013000_bank_receipts_history_source.sql`. A cópia recuperada e o SQL do espelho **não são blobs idênticos**, logo não se deve intercambiá-los automaticamente.

**Quatro SQLs sem entrada identificável por nome no ledger, comuns aos dois GitHubs:**

1. `20260928033000_pix_single_use_and_status.sql` — fonte histórica presente no repositório, porém sem linha correspondente no ledger; a ausência do registro **não prova** que toda sua lógica esteja ausente ou presente no banco. Confrontar objetos e dependências antes de qualquer ação.
2. `20261020235000_explicit_data_api_object_grants.sql` — P0 grants explícitos de Data API, ainda em revisão.
3. `20261021100000_restore_pix_single_use_index.sql` — proteção de uso único de referência Pix, ainda em revisão.
4. `20261022004000_transactions_owner_account_rls.sql` — proteção do vínculo de usuário e conta nos lançamentos, testada em CI e não publicada.

## Qual é a prova disponível?

O Supabase preserva metadados `version`, `name` e `statements` no ledger. Nesta leitura foram encontrados **31** registros com um único elemento SQL e **20** com múltiplos elementos. Foram coletados os hashes MD5 dos elementos únicos sem publicar seu texto, e os SHA-1 de **blobs Git** dos arquivos.

**O que essas provas significam:** versão e nome são indícios de correlação, não hashes de execução. SHA-1 do Git atesta o conteúdo versionado nos repositórios. O hash do texto armazenado no ledger pode comprovar igualdade de bytes **somente se coincidir com o conteúdo integral do arquivo**. Nos registros de múltiplos statements, a divisão do SQL dificulta comparação direta. O script P0.5 relata essas comparações e destaca tudo o que continuar inconclusivo.

## Entrega verificável

- `docs/security/P05_LIVE_MIGRATION_LEDGER_SNAPSHOT_20261022.json` — inventário da fonte ao vivo (somente leitura), correspondente ao respectivo repositório. Estático e datado.
- `scripts/check-migration-provenance.js` — guardião offline que:
  - verifica a presença das 51 linhas, seu identificador e nome;
  - verifica cada blob SQL Git por SHA-1, e a cópia de recuperação quando aplicável;
  - impede exclusão/modificação de arquivos auditados e novos SQLs sem classificação;
  - testa se um arquivo foi vinculado a mais de uma entrada, distingue aliases e protege contra **novas colisões**;
  - executa self-test negativo que rejeita um manifesto incompleto;
  - mede igualdade de conteúdo de fonte e texto registrado para os 31 casos de um statement, separando resultados inconclusivos;
  - **nunca** lê credenciais Supabase, não executa SQL remoto e não chama `db push`, `migration repair` ou `apply_migration`.
- `.github/workflows/ci.yml` — integra a barreira **antes** do smoke test da base reconstruída, aproveitando o runner gratuito.

## Go / no-go

**GO:** manter a execução gratuita de segurança no GitHub Actions e analisar objetos implantados por consultas somente leitura.

**NO-GO:** aplicar migrations em produção, alterar registros em `supabase_migrations.schema_migrations`, renomear versões historicamente ou publicar SQL de grants/RLS/Pix sem antes resolver as colisões, provar compatibilidade das 19 candidatas renumeradas no espelho e realizar testes ponta a ponta financeiros. A aprovação da barreira offline **não significa** que o estado da produção esteja reconciliado.

## Próximo pacote recomendado — P0.6

1. Contrastar hashes dos 31 statements de corpo único e, para as diferenças, realizar revisão SQL linha a linha sem mutação de produção.
2. Para as 20 migrations multistatement, comparar a divisão SQL do ledger com os scripts históricos e anotar divergências.
3. Revisar a migration histórica Pix `20260928033000`, o índice único em operação, as funções de status e o histórico de comprovantes a partir dos objetos existentes.
4. Criar uma estratégia forward-only *específica* para cada diferença comprovada, sem executar alterações no ledger de produção; preservar o espelho sincronizado com o canônico.

**Escopo:** somente OptmaPay; OptmaMenu e demais branches não alterados.
