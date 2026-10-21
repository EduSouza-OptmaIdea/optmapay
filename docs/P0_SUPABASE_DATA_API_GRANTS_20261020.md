# P0 — Supabase Data API explicit privileges (20–29 October 2026)

**Project boundary:** ONLY `OptmaIdea/optmapay` / `wertmoquxdrucdbobuie`.
**Decision:** **NO-GO for production cutover** until the migration history discrepancy and isolated regression are resolved. This document and SQL are staged, not deployed.

## Verified live baseline — 2026-10-20

- Supabase `ACTIVE_HEALTHY`; PostgreSQL 17.6; 30 `public` tables, all with RLS.
- 51 versions in `supabase_migrations.schema_migrations`; most recent `20261018013732_bank_receipts_history_20261018`.
- GitHub `main` HEAD `e0451515b7aa18e0f9e81b8e94595a09a97018eb`.
- Parallel branch `agent/optmapay-ux-i18n-learning-20261015` at `c109f5f45b6e36125873f4509ac869741f86898f`; do not rebase, reset, or merge into it.
- All three default-ACL object types (tables, sequences, routines) retain `anon`, `authenticated`, `service_role` grants for BOTH `postgres` and `supabase_admin` in `public`.
- 71 ordinary `public` functions: 55 currently executable by `authenticated`, 6 by `anon`, 71 by `service_role`; 45 `SECURITY DEFINER` functions executable by `authenticated` per Security Advisor. Treat as a review queue, not proof of a bypass.
- 10 tables have RLS and no policy (principally backend/platform internals), two functions have mutable `search_path`, `pg_net` is under `public`.
- One sequence: `public.platform_admin_audit_id_seq`. Current effective grants include anonymous access; this migration removes that exposure.
- Some existing financial data tables are directly writable by `authenticated` under owner-scoped RLS; existing React clients depend on this and cannot safely be revoked without refactoring.

Source: project catalogs read-only + security advisor + GitHub `main`. The existence of grants does **not** mean row access is permitted: RLS is separately enforced.

## Critical reconstruction blocker: migration-history drift

Both GitHub and the live database have 51 historical migration entries, but **18 GitHub versions are missing in the database** and **18 database versions are missing in GitHub**. A same-version collision exists:

- GitHub `20261014130500_deposits_policy_rounding_receipts.sql`
- Database `20261014130500_independent_exception_expiry_20261014`

Additional examples:

- GitHub `20260928033000_pix_single_use_and_status.sql` is not in the database migration ledger.
- GitHub `20261012175500_super_admin_users_activity_console.sql` maps conceptually to database `20261012203217_super_admin_users_activity_console`.
- Production includes version `20261018013732_bank_receipts_history_20261018`, but this mirror contains its candidate source as `20261018013000_bank_receipts_history.sql`; the deployed `bank_receipt_get` and `bank_receipts_list` functions therefore cannot be assumed reproducible from the versioned repository.

**Do not repair this by renaming files, bulk marking versions as applied, re-running schema SQL, or running `supabase db push` against production.** Recover the exact applied SQL/checksums from the original deployment source or a verified backup; compare schemas and semantics in an isolated database. Log a migration reconciliation before deployment.

## Creation / re-creation origin inventory (GitHub current tree)

| Area | Table creation source (by version or area) |
|---|---|
| Core `accounts`, `transactions`, `boletos`, `cartoes`, webhook config/logs, API keys | `20260829000000_initial_schema` |
| Retention log | `20260829000002_data_retention_and_warnings` |
| `contas_pagar`, `cofrinhos_poupanca`, `emprestimos_edu` | `20260905000000_business_days_bills_and_edu` |
| `api_idempotency_keys`, `webhook_events`, `webhook_delivery_jobs` | `20260919233000_api_keys_webhooks_idempotency_hardening` |
| `card_receivables` and four card-invoice tables | `20261004020711_card_ledger_and_settlement_authority` |
| `account_charge_ledger` | `20261010194357_pj_account_fees_overdraft_and_90d_foundation` |
| `optmapay_super_admins` | `20261012175500_super_admin_users_activity_console` |
| `platform_staff`, `platform_admin_audit` (serial-backed) | `20261013110000_platform_staff_permissions_audit` |
| `platform_system_settings` | `20261013120000_platform_system_settings` |
| `sandbox_deposit_operations` | `20261013234500_sandbox_deposits_atomic_idempotent` |
| `platform_type_policies`, `platform_account_overrides` | `20261014130000_pf_pj_policies_and_overrides` |
| `platform_limit_requests`, `platform_messages`, `platform_email_outbox` | `20261014133000_pix_limit_requests_messages_email_queue` |

No explicit `CREATE SEQUENCE` statements were found in the scanned current migrations; the platform audit serial column generates the single live sequence implicitly. `CREATE OR REPLACE FUNCTION` statements occur across many migrations and must preserve function-level ACL expectations. The database-only receipts history must be recovered before claiming full reproduction.

## Role matrix — compatibility staging

| Object family | `anon` | `authenticated` | `service_role` | RLS |
|---|---|---|---|---|
| `accounts`, `transactions`, `boletos`, `cartoes` | No table DML | SELECT / INSERT / UPDATE / DELETE for legacy client UI; owner policies | Server DML | Enabled |
| `contas_pagar`, `cofrinhos_poupanca`, `emprestimos_edu` | No table DML | Owner-scoped CRUD | Server DML | Enabled |
| Card receivables and invoices (5 tables) | No table DML | SELECT own rows | Server DML | Enabled |
| API keys, webhook config/events/log/jobs | No table DML | SELECT RLS-scoped records, never direct write | Server DML | Enabled |
| `data_retention_logs` | None | SELECT / INSERT RLS-scoped | Server DML | Enabled |
| `platform_messages` | None | SELECT own messages | Server DML | Enabled |
| Internal ledger, idempotency and platform governance tables (11 tables) | None | None | Server DML | Enabled, service-role-only paths |
| `platform_admin_audit_id_seq` | None | None | USAGE, SELECT only | Not applicable |
| Function RPCs | Existing approved function-specific roles preserved | Explicit existing EXECUTE per signature | Explicit existing EXECUTE per signature | RLS does not cover function bodies |

**Temporary least-exposure exception:** direct owner-scoped client writes to `accounts`, `transactions`, `cartoes` and `boletos` cannot be removed without replacing active UI flows. The SQL does **not** expand their current effective privileges; it retains DML while removing broad grants like TRUNCATE/TRIGGER/REFERENCES. A follow-up authoritative-API refactor must eliminate these writes before claiming full least-privilege completion.

**Temporary server exception:** all 30 tables receive only named DML privileges for the trusted `service_role` (no schema-level `GRANT ALL`). Per-endpoint server DML reduction requires full source coverage and live operation testing. The service-role secret must remain server-side only; it bypasses RLS, so API authorization remains mandatory.

## Code-path inventory and sensitive dependencies

- React `src/lib/supabase/accountService.ts`: direct `accounts` CRUD, `transactions` inserts/deletes, fallback account deletion; server RPCs for deletion, export, banking, and superadmin.
- React `src/pages/CartoesArea.tsx`: direct `cartoes` create/update and account configuration updates.
- React `src/pages/PixArea.tsx`: transactions READ and `refund_pix` RPC.
- React `src/lib/cardService.ts`: `process_card_payment`, `pay_credit_card_invoice`, `release_d1_settlement`.
- React `src/services/sandboxDepositService.ts`: `sandbox_deposit_quote` and `sandbox_deposit_confirm` RPCs.
- Server routes `api/sandbox/v1/dev/api-keys.ts` and `webhooks.ts`: service role accesses API keys, webhook configuration, delivery jobs.
- API shared `api/_lib/idempotency.ts`: idempotency key reads/inserts/updates (server only).
- Edge `pix-transfer`: user JWT plus privileged backend operations; `webhook-dispatcher` and `webhook-retry-worker` use server-side secrets.

## Isolated validation without new paid resources

Existing `.github/workflows/ci.yml` uses PostgreSQL 17 with `scripts/apply-migrations-test.js`.
Before this PR the script granted ALL to `service_role` globally, masking absent explicit grants.
This PR removes those fallback grants, disables default function EXECUTE to PUBLIC in CI,
and asserts all 30 RLS tables, role ACLs, the audit sequence, and five essential payment RPC signatures.

**Isolation limits:** the CI PostgreSQL emulator does not substitute for a full isolated Supabase project with PostgREST, JWTs, Realtime, Edge Functions, pg_net and scheduled workers. No production cutover based only on CI.

### Acceptance and evidence still required

1. Recover production-only `bank_receipts_history` migration and reconcile every version/checksum and semantic difference.
2. PR CI successful: strict PostgreSQL reconstruction, existing Vitest suites, typecheck, Deno, lint, build.
3. In a fully isolated Supabase branch, after explicit approval for hourly charges if applicable, disable automatic object grants and reproduce migration installation.
4. Test logged-out requests, own and other-account JWTs, and server-only secrets; verify no inter-account reads/writes or direct ledger manipulation.
5. Sandbox Pix: create, confirm, refund and idempotent replay. Card: charge, D1/receivables, anticipation, reversal/estorno. Validate fees and unchanged ledger totals on duplicate events.
6. Webhook: authentication/HMAC, retries and idempotence; use duplicate delivery keys and rejected signatures; verify no unauthorized state changes.
7. Accounts, statements, receipts, ledger invariants, reconciliation and tenant isolation; compare before/after snapshots.
8. Investigate all `42501` exceptions by request path/role without re-granting entire schemas.
9. Audit 45 `SECURITY DEFINER` routines separately: caller validation, fixed search_path, privilege escalation and caller restrictions. No bulk REVOKE.
10. Only then schedule default-privilege policy change and Data API setting with rollback readiness.

## Rollback and production change control

- Before staging: export and review object ACLs (`pg_class.relacl`), default ACLs (`pg_default_acl`), all RLS policies and definitions, effective per-role grants, relevant function grants, and database migration ledger. Store encrypted backup securely outside GitHub.
- Run grants as a reviewed migration after reconciling versions; do not run `ALTER DEFAULT PRIVILEGES` in production in this first stage.
- If the staged migration causes `42501`, identify exactly the affected role/object/route, stop release, and restore that object's previously recorded explicit ACL only after confirming policy isolation.
- Never fix errors by `GRANT ALL` on a schema, turning off RLS, exposing service-role secrets, replaying paid transactions, or making blind schema history repairs.
- Stop and roll back app changes if payments, idempotent webhooks or ledger invariants fail; database ACL rollback must use approved pre-change ACL snapshot, not a guessed blanket statement.

**GO:** reconciled migrations, strict build and isolated Supabase flows all green, explicit owner-scoped isolation tested, no unexplained `42501`, rollback ready.
**NO-GO today:** migration drift unresolved, receipts history missing from source, complete isolation test pending, service-role and authenticated legacy CRUD reduction pending.

Reference: https://supabase.com/docs/guides/api/securing-your-api

## 2026-10-21 follow-up: two-repository provenance, Pix uniqueness

**Dual GitHub layout:** `OptmaIdea/optmapay` (private canonical, main `e0451515...`), and `EduSouza-OptmaIdea/optmapay` (public deployment mirror, main `61655e208...`). Their `main` histories differ and must not be force-synchronized. Their 51 shared migration files have matching GitHub blob SHAs. The mirror has one additional file, `supabase/migrations/20261018013000_bank_receipts_history.sql`. Vercel production deployment `dpl_CNagzx43upnipChUCxBuM8LrdTht` is READY and its Git origin is the mirror `main` at `61655e208...`.

**Recovered receipts proof:** live `bank_receipts_list` and `bank_receipt_get` function bodies were compared against the mirror SQL; both are identical after whitespace normalization, including `SECURITY DEFINER` and pinned search path. Canonical preserved a read-only archive under `docs/recovered/20261018013000_bank_receipts_history_source.sql`; it is intentionally **not** under `supabase/migrations`, as DB ledger version `20261018013732` differs from source filename and replay would be unsafe.

**Pix single-use gap:** `20260928033000_pix_single_use_and_status.sql` exists in both Git repos, but the live DB has neither `ux_transactions_pix_paid_external_reference` nor `get_pix_instruction_status_safe(text)`. The current server-side `api/sandbox/v1/pix/instruction-status.ts` endpoint does not call that RPC, so the missing RPC is not evidence of an endpoint failure. The live `transfer_pix` function implements request-idempotency per sender account, but no global unique index on completed incoming `external_reference`; read-only audit detected **zero currently duplicated nonempty completed Pix references**. A new staged forward-only migration `20261021100000_restore_pix_single_use_index.sql` explicitly restores the global unique index, with a strict rebuild CI assertion. **Not deployed to production**. Test duplicate settlement attempts from two different sandbox payer accounts and confirm no second debit or webhook before approving its deploy.

**Isolation cost:** Supabase reported USD 0.01344/hour for a new branch. The branch tool asked for a cost confirmation ID; the user must acknowledge this exact rate before `confirm_cost` and branch creation. Existing GitHub Actions PostgreSQL tests incur no new Supabase branch charge.
