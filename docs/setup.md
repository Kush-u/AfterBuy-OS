# Setup Guide

**AfterBuy: The store that remembers every buyer.**

This guide covers local setup and production deployment. Hosted app: https://after-buy-os.vercel.app

## What you need

| Item | Required | Used for |
| --- | :---: | --- |
| Node.js 20 or later | Yes | Running the app |
| Supabase project | Yes | Postgres, Auth and Storage |
| Google Cloud OAuth client | Yes | Sign-in with Google |
| Telegram bot token from [@BotFather](https://t.me/BotFather) | For selling | Connecting a store bot |
| Vercel account | For production | Hosting |
| Hindsight and Groq keys | Optional | Buyer Memory and Remy |
| BscScan API key | Optional | On-chain USDT BEP20 verification |

## 1. Create the Supabase project

1. Create a project at https://supabase.com.
2. Open **Project Settings, API** and copy:
   - the project URL
   - the anon key
   - the service role key
3. Keep the service role key private. It is for server use only.

## 2. Run the migrations

1. Open the Supabase **SQL editor**.
2. Run every file in `supabase/migrations` in numeric order, from `0001_initial_schema.sql` to `0023_profile_role_guard.sql`.
3. Number 0022 is intentionally absent. Do not look for it.

The migrations create the tables, row level security policies, wallet functions, storage buckets and the role guard trigger. Never edit an applied migration. Add a new one instead.

Optional: `supabase/seed/dev_seed.sql` adds two synthetic products for development.

## 3. Set up Google sign-in

### In Google Cloud

1. Create an OAuth client of type **Web application**.
2. Add this authorized redirect URI. Replace `<project-ref>` with your Supabase project reference:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

3. Copy the client id and client secret.

### In Supabase

1. Open **Authentication, Providers, Google**. Enable it and paste the client id and secret.
2. Open **Authentication, URL Configuration**.
3. Set **Site URL** to your app origin.
4. Add these **Redirect URLs**:

```text
https://after-buy-os.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

The app sends users to `/auth/callback` after Google sign-in. If a URL is missing, sign-in fails.

## 4. Environment variables

Copy `.env.example` to `.env.local` and fill in your own values. Never commit `.env.local`.

| Variable | Required | Purpose |
| --- | :---: | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser-safe key, protected by row level security. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only key. Never expose it to the browser. |
| `NEXT_PUBLIC_APP_URL` | Yes | Public origin. Used for bot webhooks, invite links and the assistant's links. |
| `BOT_TOKEN_ENCRYPTION_KEY` | Yes | 64 hex characters (32 bytes). Encrypts bot tokens and payment credentials. Required in production. |
| `CRON_SECRET` | Yes | Shared secret for scheduled job endpoints. Required in production. |
| `GROQ_API_KEY` | Optional | Enables Remy. Without it the assistant returns a clear error. |
| `HINDSIGHT_API_KEY` | Optional | Enables Buyer Memory. |
| `HINDSIGHT_API_URL` | Optional | Hindsight API base URL. |
| `HINDSIGHT_ENABLED` | Optional | Set to `true` to turn Buyer Memory on. |
| `HINDSIGHT_BANK_PREFIX` | Optional | Namespace for memory banks. Default `afterbuy-prod`. |
| `BSCSCAN_API_KEY` | Optional | Enables on-chain BEP20 verification via BscScan. Without it the app runs in demo verification mode, for testing only. |
| `ACTIVE_SUPPLIER` | Optional | Selects the supplier connection. |
| `SUPPLIER_1_API_KEY` | Optional | Supplier API key. |
| `SUPPLIER_1_BASE_URL` | Optional | Supplier API base URL. |

Generate the two secrets with:

```bash
openssl rand -hex 32
```

Binance Pay credentials and wallet addresses are not environment variables. Owners and resellers save them in the dashboard, and they are stored encrypted.

## 5. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Telegram needs a public HTTPS URL to reach your webhooks. To test a bot locally:

```bash
npm run tunnel   # terminal 1: starts an ngrok tunnel and updates NEXT_PUBLIC_APP_URL
npm run dev      # terminal 2
```

More detail is in [local-development.md](./local-development.md).

## 6. Deploy to Vercel

1. Push the repository to GitHub and import it in Vercel.
2. Add every environment variable from the table above.
3. Set `NEXT_PUBLIC_APP_URL` to the production origin, for example `https://after-buy-os.vercel.app`.
4. Deploy. Vercel runs `next build`.
5. Redeploy after you change any environment variable.

`vercel.json` raises the time limit for the Telegram webhook, fulfillment and supplier reconcile functions.

## 7. Make the first owner account

New sign-ins start as pending resellers, so the first owner is promoted by SQL.

1. Sign in with Google once.
2. Open the Supabase SQL editor. It runs as a role that is allowed to change roles.
3. Run this, with your own email address:

```sql
-- Promote the account to platform owner
update public.profiles
set role = 'owner',
    status = 'active',
    onboarding_completed = true
where id = (select id from auth.users where email = 'you@example.com');

-- Put the role in the sign-in token as well. Row level security policies read it.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "owner"}'::jsonb
where email = 'you@example.com';
```

4. Sign out and sign in again so your token carries the new role.
5. You land on `/owner`.

First sign-in also created a pending store record for you. It appears in the resellers list. If you want to remove it, run the statement below. If Postgres reports a foreign key error, leave the record.

```sql
delete from public.tenants
where owner_user_id = (select id from auth.users where email = 'you@example.com');
```

A database trigger blocks users from changing their own role or status through the app. The SQL editor is allowed.

## 8. Approve sellers

Sellers can sign up with Google or through an owner's invite link. Every new account starts as pending and gets access only after the owner approves it.

1. The seller signs up and completes onboarding.
2. They wait on the pending page.
3. Open `/owner/resellers` and choose **Activate**.

To invite a seller, use `/owner/resellers/invite` and share the invite link.

## 9. Connect a bot

### Reseller store bot

1. In Telegram, message @BotFather and create a bot. Copy the token.
2. Sign in as an approved reseller and open `/reseller/bot`.
3. Paste the token and connect.

The server checks the token with Telegram and encrypts it. It then registers the webhook at `NEXT_PUBLIC_APP_URL/api/webhooks/telegram/<botId>` with a per-bot secret. The "My Telegram Bot" sidebar panel shows the status.

### Owner store bot

Sign in as the owner, open `/owner/settings` and connect the owner bot token there.

### Payment methods

- Owners and resellers add Binance Pay credentials and USDT wallet addresses in their settings.
- BEP20 USDT payments are verified on-chain via BscScan when `BSCSCAN_API_KEY` is configured and a receiving wallet is set. Without the key, the app runs in demo verification mode (for testing only).
- TRC20 payments are confirmed manually by the owner from the Payments page. Automatic TRC20 verification is on the roadmap.
- With no live method configured, the platform runs in demo mode.

## 10. Scheduled jobs

Vercel's free plan only allows daily crons, so use an external scheduler such as cron-job.org. Create four jobs that call these URLs with the header `Authorization: Bearer <CRON_SECRET>`:

| URL | Interval | Purpose |
| --- | --- | --- |
| `https://after-buy-os.vercel.app/api/fulfillment/process` | 2 minutes | Fulfill and deliver paid orders. |
| `https://after-buy-os.vercel.app/api/supplier/reconcile` | 15 minutes | Reconcile pending supplier orders. |
| `https://after-buy-os.vercel.app/api/supplier/sync` | 30 minutes | Sync the supplier catalog. |
| `https://after-buy-os.vercel.app/api/bots/health` | 30 minutes | Check every bot webhook. |

- If your scheduler cannot set headers, append `?secret=<CRON_SECRET>` to the URL.
- The owner dashboard has "Run now" buttons for fulfillment, supplier reconcile and bot health.
- In production a missing `CRON_SECRET` means the endpoints refuse requests.

Step-by-step scheduler setup is in [cron-setup.md](./cron-setup.md).

## 11. Optional: Buyer Memory and Remy

1. Set `HINDSIGHT_ENABLED=true` with `HINDSIGHT_API_KEY` and `HINDSIGHT_API_URL`.
2. Set `GROQ_API_KEY` for Remy.
3. Check memory isolation:

```bash
npm run memory:smoke
```

`npm run memory:seed` loads demo memory data for a local walkthrough.

## 12. Check your setup

```bash
npm run type-check
npm run lint
npm run test
npm run build
```

All four should pass before you deploy.
