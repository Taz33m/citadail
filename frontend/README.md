# Citadail Frontend

Next.js workspace for the Citadail equity desk.

## Run

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

## Environment

Create `.env.local` when using Gemini-backed generation or source import:

```bash
GEMINI_API_KEY=your_key_here
SEC_USER_AGENT="Citadail research you@example.com"
PERPLEXITY_API_KEY=your_key_here
PHOTON_PROJECT_ID=your_project_id_here
PHOTON_PROJECT_SECRET=your_project_secret_here
CITADAIL_APP_URL=http://localhost:3000
SPECTRUM_USE_TERMINAL=true
DEDALUS_API_KEY=your_key_here
DEDALUS_MACHINE_ID=optional_existing_machine_id
DEDALUS_DCS_BASE_URL=https://dcs.dedaluslabs.ai
DEDALUS_API_BASE_URL=https://api.dedaluslabs.ai
DEDALUS_MODEL=openai/gpt-5
DEDALUS_MACHINE_AUTOCREATE=false
```

Without a Gemini key, shell UI and deterministic local previews can still be exercised, but AI-backed package generation will fail instead of silently faking output.
Use `SEC_USER_AGENT` to identify your app/contact for SEC EDGAR requests.
The Perplexity key is server-only and reserved for source import/enrichment; historical replay uses stored snapshots.
Photon credentials are server/local-agent only. Do not commit `.env.local`.
Dedalus credentials are server-only. The Full Auto Dedalus card can create or attach a machine, bootstrap OpenClaw, sync the paper desk state, and report runtime status without exposing arbitrary shell execution to the browser.

## Main Routes

- `/` shows Assist Mode and Full Auto Mode.
- `/full-auto` opens the historical paper-investing control room.
- `/sessions/[id]` opens the Citadail workspace.
- `/api/voice/token` keeps the Gemini Live connection available.
- `/api/market/brief` serves Morning News data.
- `/api/equity/project/generate` creates the analyst package payload.
- `/api/equity/project/preview` renders Office previews.
- `/api/equity/project/export` exports DOCX, XLSX, and PPTX files.
- `/api/full-auto/step` advances the historical replay one bounded step.
- `/api/full-auto/run` loads the shared Spectrum/Full Auto runtime state.
- `/api/full-auto/run/reset` resets the shared Spectrum/Full Auto runtime state.
- `/api/full-auto/open-session` validates a ThesisRecord before client-side session import.
- `/api/dedalus/runtime` manages the optional machine-backed Dedalus runtime.

## Spectrum Agent

Run the TypeScript PM group copilot with:

```bash
npm run spectrum:agent
```

Use `SPECTRUM_USE_TERMINAL=true` for local terminal testing. Add Photon credentials in `.env.local` to connect the same agent to iMessage through Spectrum. Group chats require a `Citadail` or `cd` prefix, for example:

```text
Citadail start feed
Citadail brief
Citadail step
Citadail book
Citadail thesis NVDA
Citadail news NVDA
Citadail chart NVDA
Citadail deck NVDA
Citadail runtime
Citadail stop feed
```

The agent is paper-only. It can summarize the book, step Full Auto, surface watch/revisit names, fetch current ticker news outside the replay loop, record PM/Risk/Desk decisions, send generated Office artifacts, report the Dedalus/OpenClaw runtime, and run a proactive executive feed with named Morning Brief, Desk, Risk, Chart, and PM dispatches.

## Core Checks

```bash
npm run lint
npm run test:shell
npm run build
```

The focused shell tests cover session state, workspace tabs, Coverage Desk, Morning News, Thesis submission, Full Auto replay, project export, transcript preview, reconnect policy, and voice-agent controller behavior.

## Product Flow

1. Morning News opens first.
2. Coverage Desk sets the ticker.
3. Thesis captures recommendation and rationale.
4. Analyst package generation creates Memo, Model, and Deck artifacts.
5. PM Review decides whether the idea deserves capital.
6. Risk Gate decides acceptable size and risk.
7. Trade Desk manages the single paper position.
8. Live Book monitors the full active paper book.
9. Full Auto runs a continuous walk-forward paper desk from 2022 onward: scan, underwrite, approve, open, add, trim, exit, mark P&L, and journal decisions.

Full Auto MVP book rules:

- Starting paper capital: $1M
- Max position size: 10%
- Target gross exposure: 70%
- Max gross exposure: 85%
- Max open positions: 10
- No duplicate active thesis in the same name
