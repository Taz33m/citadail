# Citadail

Citadail is an AI-native equity research desk for building, reviewing, and monitoring medium-horizon equity theses. It combines a session workspace, artifact tabs, Gemini Live connection, ADK-style tool plumbing, Office artifact generation, and paper-trade workflow surfaces.

The core loop is simple:

1. Start from the Morning News desk.
2. Pick a ticker in Coverage Desk.
3. Create a Thesis with a long, neutral, or short bias.
4. Generate analyst deliverables: memo, operating model, and PM deck.
5. Move through PM Review, Risk Gate, Trade Desk, and Live Book.

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
```

## Verification

```bash
cd frontend
npm run lint
npm run test:shell
npm run build
```
