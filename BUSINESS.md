# Business

**The store that remembers every buyer.**

AfterBuy helps digital sellers run, automate and grow a store inside chat apps. This page covers who it is for, how it earns, and how it grows.

## Who it is for

| User | Who they are |
| --- | --- |
| Solo digital seller | Sells ebooks, notes or other digital items through a chat app. Does everything alone. |
| Reseller | Sells another supplier's digital products to their own audience at their own margin. |
| Platform owner | Curates the catalog, approves sellers and keeps the platform healthy. |

## The problem, paraphrased

These are typical frustrations, not survey results.

- "I answer every message and check every payment myself."
- "I do not remember what a buyer bought last month."
- "Delivery waits until I am online."
- "I cannot take on more buyers without more hours."

## The value they get

| Pain | What AfterBuy gives |
| --- | --- |
| Manual payment checks | Payment verification against the order amount, with replay protection. |
| Manual delivery | Automatic delivery in the chat after payment. |
| Forgotten buyers | Buyer Memory keeps each buyer's history for that store. |
| Slow start | A store bot goes live from a bot token. |
| No catalog | Resell products from the owner's catalog or a supplier at your own margin. |

## Business model

- **Monthly seller subscription.** Planned at ₹2,000 per month.
- **Small margin per sale.** Planned. A small share of each sale on top of the subscription.
- **Free trial or starter plan.** An option for early sellers.

Billing for the subscription is not built yet. Today the platform tracks the wholesale amount owed per sale and prepaid wallet balances.

## Unit economics, in plain terms

- All sellers share one multi-tenant system. A new seller is a new tenant, not a new deployment.
- Each extra seller adds little infrastructure cost.
- Delivery, payment checks and order tracking run as automated jobs, so support effort per sale stays low.
- Supplier APIs let one catalog serve many stores.

We have not measured costs per seller yet, so this page gives no figures.

## Scalability

| Area | Approach |
| --- | --- |
| Stores | One system serves every store. Data is isolated by tenant and row level security. |
| Work | Scheduled jobs process fulfillment, supplier reconciliation and bot health. |
| Catalog | Supplier adapters import products from external APIs. |
| Channels | Telegram is first. More chat channels come next. |
| Memory | Each store has its own memory banks, so memory grows per store. |

## Go to market

1. Onboard the first sellers for free in exchange for feedback.
2. Turn that feedback into product fixes and short seller stories.
3. Open a paid plan once the subscription billing is built.

**Goals, not results:** reach 100 sellers, then 1,000 sellers.

## Risks and how we handle them

| Risk | How we handle it |
| --- | --- |
| Payment fraud | Amounts are checked against the stored order. Transaction hashes cannot be reused. BEP20 payments are verified on-chain when a BscScan key is configured. TRC20 payments are confirmed manually by the owner. |
| Unvetted sellers | Sellers can sign up with Google or through an owner's invite link. Every new account starts as pending and gets access only after the owner approves it. |
| Data leaks between stores | Each store's data is isolated with Postgres row-level security, the tenant and role are always derived on the server, and each store has its own memory bank. |
| Account takeover of roles | A database trigger stops users from changing their own role or status. |
| Memory service outage | Buyer Memory calls are non-blocking. Orders, payments and replies continue normally. |
| Supplier downtime | Failed supplier orders are reconciled on a schedule and can be completed by hand. |
| Chat platform dependency | Telegram is first. The roadmap adds more channels. |
