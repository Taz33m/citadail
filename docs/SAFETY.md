# Safety

Citadail is designed as a research, education, workflow simulation, and paper-portfolio experimentation tool. It is not a brokerage system or live trading platform.

## Explicit Boundaries

- No brokerage integration.
- No live order routing.
- No real capital movement.
- All positions are paper-only.
- Historical replay avoids future-data access.
- Remote runtime commands are allowlisted.
- Secrets stay server-side or local-agent-side.
- Generated artifacts are research drafts, not investment recommendations.

## Paper-Only Desk

The Trade Desk and Full Auto book produce paper positions. Actions such as open, add, trim, exit, and recheck update local simulated state only.

Any future brokerage integration would require a separate design, review, permission model, compliance process, and user-facing safety boundary.

## Historical Replay Safety

Full Auto uses historical sources with `knownAt` timestamps. Replay steps should only see data known at or before the simulation time. This prevents future-data leakage in historical simulations.

## Runtime Safety

Dedalus/OpenClaw execution is optional and bounded. The remote command vocabulary is limited to `start`, `step`, and `pause`, and the browser receives sanitized proof/status payloads.

## Secrets

Secrets such as `GEMINI_API_KEY`, `DEDALUS_API_KEY`, `PHOTON_PROJECT_SECRET`, and `PERPLEXITY_API_KEY` must never be committed. They belong in local `.env.local` files or secure deployment secret stores.

Only variables intentionally prefixed with `NEXT_PUBLIC_` should be considered browser-visible.

## Financial Disclaimer

Citadail is for research, education, workflow simulation, and paper-portfolio experimentation only. It is not financial advice, investment advice, brokerage software, or a live trading system.
