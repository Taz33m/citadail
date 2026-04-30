# Security Policy

Citadail is experimental software for local development, demos, research workflow simulation, and paper-portfolio experimentation.

## Supported Versions

The active branch is the only supported development target.

## Reporting a Vulnerability

Please do not open a public issue for security-sensitive reports.

Use GitHub's private vulnerability reporting flow if enabled, or contact the maintainers privately with:

- a concise description;
- affected files or routes;
- reproduction steps;
- potential impact;
- suggested mitigation, if known.

## Secrets

Never commit real values for:

- `GEMINI_API_KEY`
- `DEDALUS_API_KEY`
- `PHOTON_PROJECT_SECRET`
- `PERPLEXITY_API_KEY`
- `FINNHUB_API_KEY`
- any other private key or token

Secrets belong in local `.env.local` files or deployment secret stores.

## Product Safety Scope

Security fixes must preserve Citadail's safety boundaries:

- no brokerage integration;
- no live order routing;
- no real capital movement;
- paper positions only;
- server-only runtime secrets;
- allowlisted remote runtime commands.
