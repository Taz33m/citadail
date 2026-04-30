# Contributing

Thanks for helping improve Citadail.

Citadail is an experimental equity research and paper-desk workflow project. Contributions should preserve the product's core safety posture: paper-only positions, no brokerage integration, no live order routing, and no real capital movement.

## Good First Contributions

- Improve source freshness labels.
- Add screenshots or a hosted demo link.
- Improve artifact styling.
- Expand focused tests.
- Improve accessibility and responsive UI states.
- Clarify docs and setup notes.
- Add contributor-friendly issues.

## Local Setup

```bash
cd frontend
npm install
npm run dev
```

Copy `.env.example` into `frontend/.env.local` if you need AI-backed generation, Spectrum, or Dedalus features.

## Verification

Before opening a pull request, run:

```bash
cd frontend
npm run lint
npm run test:shell
npm run build
```

If you cannot run a check, mention why in the pull request.

## Pull Request Guidelines

- Keep changes focused.
- Include screenshots for visible UI changes.
- Add or update tests for behavior changes.
- Do not commit secrets, generated local runtime state, or `.env.local`.
- Do not introduce live trading, brokerage, or real-money movement features.
- Keep financial disclaimers and paper-only language intact.
