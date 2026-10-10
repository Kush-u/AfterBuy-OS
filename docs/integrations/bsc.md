# BSC BEP20 USDT (platform docs)

See also `integrations/bsc/README.md`.

BEP20 USDT payments are verified on-chain via BscScan when `BSCSCAN_API_KEY` is configured. Without the key, the app runs in demo verification mode (for testing only), using `createSandboxBscClient()`.

TRC20 payments are confirmed manually by the owner from the Payments page. Automatic TRC20 verification is on the roadmap.

Live BEP20 verification checks the token contract, amount, time window and hash uniqueness.
