# Citadail

Citadail is an AI-native equity research desk for building, reviewing, and monitoring medium-horizon equity theses. It combines a session workspace, artifact tabs, Gemini Live connection, ADK-style tool plumbing, Office artifact generation, and paper-trade workflow surfaces.

The core loop is simple:

1. Start in Assist Mode or Full Auto Mode.
2. In Assist Mode, pick a ticker in Coverage Desk and create a Thesis.
3. Generate analyst deliverables: memo, operating model, and PM deck.
4. Move through PM Review, Risk Gate, Trade Desk, and Live Book.
5. In Full Auto, run the historical replay loop: brief, candidates, agents, PM/Risk, paper positions, and monitoring.

This is not a live trading system. Citadail is a research, review, and paper-trade workspace for medium-horizon equity theses.

## Product Shape

- Morning News: market context, screeners, and sentiment.
- Coverage Desk: ticker search, current coverage, watchlist, and flagged names.
- Thesis: recommendation selection and rationale capture.
- Memo: generated investment memo preview and DOCX export.
- Model: generated operating model preview and XLSX export.
- Deck: generated PM pitch deck preview and PPTX export.
- PM Review: compressed decision packet for capital approval.
- Risk Gate: size and risk acceptance screen.
- Trade Desk: single-position paper trade view.
- Live Book: portfolio-level monitor for active theses and positions.
- Full Auto: continuous walk-forward paper desk from 2022 onward, with time-isolated source packs, agent activity, position management, and an equity curve.

## Technical Shape

- `frontend/` is the Next.js app.
- Gemini powers the voice/text agent connection and analyst package generation.
- Local equity modules hold the first version of market data, thesis state, project generation, Office previews, and paper-trade state.
- Office exports are real generated files:
  - `Investment Memo.docx`
  - `Operating Model.xlsx`
  - `PM Pitch Deck.pptx`

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

For Gemini-backed package generation, create `frontend/.env.local` with:

```bash
GEMINI_API_KEY=your_key_here
PERPLEXITY_API_KEY=your_key_here
```

The Perplexity key is used only for source import/enrichment. Historical replay uses saved source snapshots filtered by simulation time.

Full Auto starts with $1M of paper capital, 10% max position size, 70% target gross exposure, 85% max gross exposure, and 10 max open positions in the MVP replay.

## Verification

```bash
cd frontend
npm run lint
npm run test:shell
npm run build
```
