# AfterBuy — Master Plan

*The store that remembers every buyer.*

AfterBuy is a multi-tenant commerce platform for digital sellers who sell inside chat apps. Telegram is the first supported channel. The owner sells digital products (ebooks, handwritten notes) through their own store bot. Resellers connect their own store bots, prepay a USDT wallet via admin-generated top-up tokens, and sell the owner's products to their own customers.

For the current system, see [ARCHITECTURE.md](../ARCHITECTURE.md) and [setup.md](./setup.md). Hosted app: https://after-buy-os.vercel.app

This document is the product and engineering plan. Phase 0 implements only repository setup, scaffolding, environment configuration, module skeletons, fake adapters, and the database foundation. Later phases must not be pulled forward.

## Money and tenancy invariants

- Currency at launch is USDT only. Amounts are integer minor units with 6 decimal places (`1 USDT = 1_000_000`).
- Ledger rows are append-only. Corrections are new reversal entries.
- Tenant IDs used in queries come from the authenticated session, never from the request body.
- Prices are calculated server-side. Client and bot submitted prices are ignored.
- Order and wallet mutations require idempotency keys.
- Bot webhooks validate `X-Telegram-Bot-Api-Secret-Token` from Phase 4 onward.

## System shape

- **App:** Next.js 14 App Router on Vercel
- **Auth / DB / Storage:** Supabase (PostgreSQL, Auth, private Storage)
- **Scheduled jobs:** HTTP endpoints called by an external cron service
- **Bots:** grammY behind `/api/webhooks/telegram/[botId]`
- **Payments:** Binance Pay and USDT BEP20, sandbox-first
- **Reseller API:** `/api/v1` in Phase 7

## Phases

### Phase 0 — Foundation (this phase)

Repository structure, TypeScript strict mode, Tailwind, Vitest, env templates, Supabase clients, domain module skeletons, sandbox Binance/BSC/Telegram adapters, initial SQL schema, health endpoint, webhook stub.

Exit: `type-check`, `test`, `build`, and `lint` pass; health route returns ok; no secrets in git.

### Phase 1 — Identity and tenants

Supabase Auth for owner, staff, and resellers. Invitations. Profile roles. Dashboard middleware that actually gates routes. Tenant records for resellers only (owner has no tenant row).

### Phase 2 — Catalog and pricing

Owner product CRUD, private Storage assets, reseller listings with server-side retail prices, wholesale snapshots.

### Phase 3 — Wallet and top-up tokens

Persist wallets and the append-only ledger. Admin 12-digit top-up tokens. Reservation and wholesale debit in a database transaction.

### Phase 4 — Telegram bots

grammY webhook processing, encrypted bot tokens, customer records, owner store bot and reseller bots, secret-token enforcement.

### Phase 5 — Payments

Live Binance Pay and BEP20 verification. Payment claims, order payment track, refund/dispute stubs with audit logging.

### Phase 6 — Fulfillment and delivery

File delivery from private Storage, manual queue, supplier connector calls, delivery attempts to Telegram or API, independent fulfillment/delivery tracks.

### Phase 7 — Public reseller API

Versioned `/api/v1` with API keys, idempotent order create, and documented error shapes.

## Out of scope until named

- Fiat currencies and FX
- Real payout automation beyond the USDT wallet model
- Multi-owner marketplaces
- Customer-facing web checkout (Telegram and API are the channels)
