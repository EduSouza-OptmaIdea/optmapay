-- OptmaPay sandbox safety: restore the intended single-use invariant.
-- Previously defined in 20260928033000_pix_single_use_and_status.sql,
-- but absent in the live database despite existing in both GitHub repositories.
-- Read-only audit (2026-10-21): zero duplicate completed-incoming Pix references.
-- Deploy ONLY after full isolated verification and migration-history reconciliation.
--
-- Idempotency per sending account and request key cannot prevent two different
-- senders from settling the same dynamic payment instruction.
CREATE UNIQUE INDEX IF NOT EXISTS ux_transactions_pix_paid_external_reference
ON public.transactions (external_reference)
WHERE type = 'pix'
  AND direction = 'in'
  AND status = 'completed'
  AND external_reference IS NOT NULL
  AND btrim(external_reference) <> '';
