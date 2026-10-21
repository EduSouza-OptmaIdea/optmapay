-- OptmaPay only. P0: restore explicit Data API privileges independently of default grants.
-- Staged for isolated reconstruction ONLY. Do not deploy until migration history is reconciled.
-- Preserves existing RLS and existing browser DML needed by the sandbox UI.
-- No ALTER DEFAULT PRIVILEGES. No function REVOKE. No GRANT ALL.
-- Future tightening of authenticated account/transaction writes requires API refactoring.
--
-- All statements execute as one migration; fail closed if an expected table is absent.

-- Drop legacy implicit object privileges and replace with narrowly named privileges.
REVOKE ALL PRIVILEGES ON TABLE public.accounts FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.transactions FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.boletos FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.cartoes FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.contas_pagar FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.cofrinhos_poupanca FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.emprestimos_edu FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.api_keys FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.webhooks_config FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.webhooks_log FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.webhook_events FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.webhook_delivery_jobs FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.card_receivables FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.credit_card_invoices FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.credit_card_invoice_items FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.credit_card_invoice_payments FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.credit_card_invoice_payment_allocations FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.platform_messages FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.data_retention_logs FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.api_idempotency_keys FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.account_charge_ledger FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.optmapay_super_admins FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.platform_staff FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.platform_admin_audit FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.platform_system_settings FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.sandbox_deposit_operations FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.platform_type_policies FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.platform_account_overrides FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.platform_limit_requests FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.platform_email_outbox FROM anon, authenticated, service_role;

-- Browser policies continue to define row ownership; never grant anon table access.

-- Core account and payment records
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.boletos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cartoes TO authenticated;

-- Sandbox user-owned operational records
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contas_pagar TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cofrinhos_poupanca TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.emprestimos_edu TO authenticated;

-- Customer-facing read-only records
GRANT SELECT ON TABLE public.api_keys TO authenticated;
GRANT SELECT ON TABLE public.webhooks_config TO authenticated;
GRANT SELECT ON TABLE public.webhooks_log TO authenticated;
GRANT SELECT ON TABLE public.webhook_events TO authenticated;
GRANT SELECT ON TABLE public.webhook_delivery_jobs TO authenticated;
GRANT SELECT ON TABLE public.card_receivables TO authenticated;
GRANT SELECT ON TABLE public.credit_card_invoices TO authenticated;
GRANT SELECT ON TABLE public.credit_card_invoice_items TO authenticated;
GRANT SELECT ON TABLE public.credit_card_invoice_payments TO authenticated;
GRANT SELECT ON TABLE public.credit_card_invoice_payment_allocations TO authenticated;
GRANT SELECT ON TABLE public.platform_messages TO authenticated;

-- Customer-facing retention events
GRANT SELECT, INSERT ON TABLE public.data_retention_logs TO authenticated;

-- Server-side payment API, Edge Functions and privileged reconciliation.
-- DML parity is retained here as an intermediate compatibility step, subject to route-level audit.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.boletos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cartoes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contas_pagar TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cofrinhos_poupanca TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.emprestimos_edu TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_keys TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.webhooks_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.webhooks_log TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.webhook_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.webhook_delivery_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.card_receivables TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credit_card_invoices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credit_card_invoice_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credit_card_invoice_payments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credit_card_invoice_payment_allocations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.data_retention_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_idempotency_keys TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account_charge_ledger TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.optmapay_super_admins TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_staff TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_admin_audit TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_system_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sandbox_deposit_operations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_type_policies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_account_overrides TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_limit_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_email_outbox TO service_role;

-- Serial backing the privileged audit writer; never expose to browsers.
REVOKE ALL PRIVILEGES ON SEQUENCE public.platform_admin_audit_id_seq FROM anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.platform_admin_audit_id_seq TO service_role;

-- Explicit routine ACL parity. This does not change any SECURITY DEFINER ownership.
-- The two bank_receipts routines are missing from source migrations; guarded until recovered.
DO $optmapay_grants$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.anticipate_card_receivable(uuid,uuid)', 'authenticated, service_role', false),
    ('public.apply_optmapay_account_charge(uuid,text,date,numeric,text,numeric,numeric,jsonb)', 'service_role', false),
    ('public.bank_receipt_get(uuid,text,uuid)', 'authenticated, service_role', true),
    ('public.bank_receipts_list(uuid,text,text,date,date,integer,integer)', 'authenticated, service_role', true),
    ('public.block_card_pin_attempts(uuid,text)', 'authenticated, service_role', false),
    ('public.block_overdue_card(uuid)', 'authenticated, service_role', false),
    ('public.calculate_card_mdr_rate(text,text,integer)', 'anon, authenticated, service_role', false),
    ('public.check_data_retention_warnings()', 'service_role', false),
    ('public.claim_single_webhook_job(uuid,text,boolean)', 'service_role', false),
    ('public.claim_webhook_delivery_jobs(integer,text)', 'service_role', false),
    ('public.cleanup_expired_sandbox_data(integer)', 'service_role', false),
    ('public.delete_sandbox_account(uuid)', 'authenticated, service_role', false),
    ('public.deposit_funds(uuid,numeric,text)', 'service_role', false),
    ('public.enforce_optmapay_card_test_limit()', 'service_role', false),
    ('public.enforce_optmapay_pf_opening_balance()', 'anon, authenticated, service_role', false),
    ('public.export_account_data_json(uuid)', 'authenticated, service_role', false),
    ('public.get_credit_card_invoice_snapshot(uuid)', 'authenticated, service_role', false),
    ('public.get_eligible_webhook_job_ids(integer)', 'authenticated, service_role', false),
    ('public.guard_optmapay_direct_balance_update()', 'anon, authenticated, service_role', false),
    ('public.is_optmapay_super_admin()', 'authenticated, service_role', false),
    ('public.lookup_pix_recipient(text)', 'authenticated, service_role', false),
    ('public.optmapay_add_business_days(date,integer)', 'anon, authenticated, service_role', false),
    ('public.optmapay_credit_due_date(timestamp with time zone,integer,integer)', 'anon, authenticated, service_role', false),
    ('public.optmapay_overdraft_limit(uuid)', 'authenticated, service_role', false),
    ('public.optmapay_settlement_at(date)', 'anon, authenticated, service_role', false),
    ('public.pay_credit_card_invoice(uuid,numeric)', 'authenticated, service_role', false),
    ('public.platform_account_override_get(uuid)', 'authenticated, service_role', false),
    ('public.platform_account_override_save(uuid,numeric,numeric,numeric,numeric,text,timestamp with time zone)', 'authenticated, service_role', false),
    ('public.platform_account_override_save_v2(uuid,numeric,numeric,numeric,numeric,text,timestamp with time zone,integer,numeric,numeric,numeric)', 'authenticated, service_role', false),
    ('public.platform_accounts_search(text,integer)', 'authenticated, service_role', false),
    ('public.platform_apply_opening_defaults()', 'service_role', false),
    ('public.platform_effective_financial_policy_internal(uuid)', 'service_role', false),
    ('public.platform_effective_policy(uuid)', 'authenticated, service_role', false),
    ('public.platform_effective_policy_internal(uuid)', 'service_role', false),
    ('public.platform_enforce_pix_outbound_limit()', 'service_role', false),
    ('public.platform_limit_request_create(uuid,numeric,numeric,text)', 'authenticated, service_role', false),
    ('public.platform_limit_request_review(uuid,text,text)', 'authenticated, service_role', false),
    ('public.platform_limit_requests_admin(text)', 'authenticated, service_role', false),
    ('public.platform_limit_requests_my(uuid)', 'authenticated, service_role', false),
    ('public.platform_message_mark_read(uuid)', 'authenticated, service_role', false),
    ('public.platform_messages_my(integer)', 'authenticated, service_role', false),
    ('public.platform_pix_is_night(timestamp with time zone,text,integer,integer)', 'authenticated, service_role', false),
    ('public.platform_pix_limit_snapshot(uuid)', 'authenticated, service_role', false),
    ('public.platform_staff_customers(text,integer)', 'authenticated, service_role', false),
    ('public.platform_staff_has_permission(text)', 'authenticated, service_role', false),
    ('public.platform_staff_list()', 'authenticated, service_role', false),
    ('public.platform_staff_me()', 'authenticated, service_role', false),
    ('public.platform_staff_save(text,text,text[],boolean)', 'authenticated, service_role', false),
    ('public.platform_staff_set_enabled(uuid,boolean)', 'authenticated, service_role', false),
    ('public.platform_system_settings_get()', 'authenticated, service_role', false),
    ('public.platform_system_settings_save(numeric,numeric,numeric,numeric,numeric,integer,numeric)', 'authenticated, service_role', false),
    ('public.platform_type_policies_list()', 'authenticated, service_role', false),
    ('public.platform_type_policy_save(text,numeric,numeric,numeric,numeric,integer,integer)', 'authenticated, service_role', false),
    ('public.platform_type_policy_save_v2(text,numeric,numeric,numeric,numeric,integer,integer,integer,numeric,numeric,numeric)', 'authenticated, service_role', false),
    ('public.prevent_platform_staff_bank_account()', 'service_role', false),
    ('public.process_card_payment(uuid,uuid,text,text,text,text,numeric,text,integer,text,text,text,uuid,text,text)', 'authenticated, service_role', false),
    ('public.refund_pix(uuid,numeric,text)', 'authenticated, service_role', false),
    ('public.release_d1_settlement(uuid,uuid)', 'authenticated, service_role', false),
    ('public.run_golden_card_engine_tests()', 'service_role', false),
    ('public.run_optmapay_daily_account_charges(date)', 'service_role', false),
    ('public.sandbox_deposit_confirm(uuid,numeric,text,text,numeric)', 'authenticated, service_role', false),
    ('public.sandbox_deposit_quote(uuid,numeric)', 'authenticated, service_role', false),
    ('public.sandbox_guard_direct_deposit_ledger()', 'service_role', false),
    ('public.settle_boleto(uuid,uuid)', 'authenticated, service_role', false),
    ('public.settle_due_card_receivables(integer)', 'service_role', false),
    ('public.super_admin_activity_feed(uuid,text,integer,integer)', 'authenticated, service_role', false),
    ('public.super_admin_global_metrics()', 'authenticated, service_role', false),
    ('public.super_admin_list_accounts()', 'authenticated, service_role', false),
    ('public.super_admin_list_users(text,integer,integer)', 'authenticated, service_role', false),
    ('public.super_admin_user_metrics()', 'authenticated, service_role', false),
    ('public.transfer_pix(uuid,text,numeric,text,text,uuid,text,text)', 'authenticated, service_role', false)
  ) AS acl(signature, roles, optional_legacy)
  LOOP
    IF to_regprocedure(r.signature) IS NULL THEN
      IF r.optional_legacy THEN CONTINUE; END IF;
      RAISE EXCEPTION 'Missing expected OptmaPay RPC: %',r.signature USING ERRCODE='undefined_function';
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s',r.signature,r.roles);
  END LOOP;
END
$optmapay_grants$;

-- Verify no new public grants are inferred from this migration.
-- RLS policies remain unchanged. Default grants must be changed only after isolated sign-off.
