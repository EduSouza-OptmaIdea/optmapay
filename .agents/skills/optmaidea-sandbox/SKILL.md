---
name: optmaidea-sandbox
description: Guidelines and architecture specs for OptmaIdea Sandbox (optmapay-sandbox) - internet banking simulator for testing online sales payment workflows, duplicatas, and webhooks.
---

# OptmaIdea Sandbox Skill Guide (`optmapay-sandbox`)

This skill defines the technical standards, branding rules, and business logic for `optmapay-sandbox`, part of the OptmaIdea ecosystem.

## 1. Core Principles & OptmaIdea Branding
- **Philosophy**: "Menos vaidade, mais resultado" (Less vanity, more result). Clean, fast, lightweight web applications.
- **Golden Rule**: Every API response, webhook payload, and UI view MUST explicitly state `realMoney: false` and `environment: "sandbox"`.
- **Color Palette**:
  - Primary: Teal-700 (`#0F766E`)
  - Secondary/Background: Slate-50 (`#F8FAFC`) / Slate-900 (`#0F172A`) (Dark & Light mode support)
  - Success/Credit: Emerald-500 (`#10B981`)
  - Fail/Debit/Alert: Rose-500 (`#F43F5E`)

## 2. Technical Stack
- **Frontend**: React (Vite) + TypeScript + Tailwind CSS
- **Backend & Auth & DB**: 100% Supabase (PostgreSQL, Supabase Auth, Webhooks, Edge/RPC Functions)
- **State Management**: Real-time Supabase queries + React State. No local storage for core financial scenario state.

## 3. Database Schema Overview
- `accounts`: ID, owner user_id, name, type (`merchant` or `customer`), cpf_cnpj, balance, pix_key, config JSONB.
- `transactions`: unified financial statement entries (`deposit`, `pix`, `card`, `boleto`) with `external_reference` / `order_id`.
- `boletos`: fake barcode charges with due date, status (`pending`, `paid`, `canceled`).
- `cartoes`: virtual debit/credit cards with credit limits and masked numbers.
- `webhooks_config`: registered HTTPS endpoints for events (`pix.received`, `pix.paid`, `boleto.paid`, `order.paid`).
- `webhooks_log`: delivery logs with payload, HTTP response status, body, and retry support.
- `api_keys`: test API keys (`sk_test_...`) linked to operator account.

## 4. Key Workflows
- **Active Account Context**: Operator toggles active account between Merchant (company receiving sales) and Customer (pseudo client making purchases).
- **Atomic Pix Transfer (`transfer_pix` RPC)**: Debits customer account and credits merchant account atomically while logging mirrored transactions.
- **Webhook Delivery Engine**: Sends POST HTTPS with 5s timeout, blocks SSRF to private IP ranges, attaches `x-optmapay-real-money: false` headers.
