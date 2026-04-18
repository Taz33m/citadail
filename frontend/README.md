# Citadail Frontend

Next.js workspace for the Citadail equity desk.

## Run

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

## Environment

Create `.env.local` when using Gemini-backed generation:

```bash
GEMINI_API_KEY=your_key_here
```

Without a Gemini key, shell UI and deterministic local previews can still be exercised, but AI-backed package generation will fail instead of silently faking output.

## Main Routes

- `/` creates or resumes a session.
- `/sessions/[id]` opens the Citadail workspace.
- `/api/voice/token` keeps the Gemini Live connection available.
- `/api/market/brief` serves Morning News data.
- `/api/equity/project/generate` creates the analyst package payload.
- `/api/equity/project/preview` renders Office previews.
- `/api/equity/project/export` exports DOCX, XLSX, and PPTX files.

## Core Checks

```bash
npm run lint
npm run test:shell
npm run build
```

The focused shell tests cover session state, workspace tabs, Coverage Desk, Morning News, Thesis submission, project export, transcript preview, reconnect policy, and voice-agent controller behavior.

## Product Flow

1. Morning News opens first.
2. Coverage Desk sets the ticker.
3. Thesis captures recommendation and rationale.
4. Analyst package generation creates Memo, Model, and Deck artifacts.
5. PM Review decides whether the idea deserves capital.
6. Risk Gate decides acceptable size and risk.
7. Trade Desk manages the single paper position.
8. Live Book monitors the full active paper book.
