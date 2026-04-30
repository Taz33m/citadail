# Spectrum

The Spectrum layer lets Citadail behave like a PM command agent from terminal mode or iMessage-style group workflows.

Entry point:

- `frontend/scripts/spectrum-agent.ts`

Core modules:

- `frontend/lib/citadail-spectrum-command.ts`
- `frontend/lib/citadail-spectrum-handler.ts`
- `frontend/lib/spectrum-desk-state.ts`
- `frontend/lib/spectrum-desk-visuals.ts`

## Local Run

```bash
cd frontend
npm run spectrum:agent
```

Use `SPECTRUM_USE_TERMINAL=true` for local terminal testing. Add Photon credentials to connect through Spectrum/iMessage.

## Example Commands

```text
Citadail start feed
Citadail brief
Citadail step
Citadail fast forward
Citadail book
Citadail positions
Citadail watch
Citadail thesis NVDA
Citadail memo NVDA
Citadail model NVDA
Citadail deck NVDA
Citadail news AAPL
Citadail chart NVDA
Citadail runtime
Citadail run machine step
Citadail stop feed
```

Group chats require a `Citadail` or `cd` prefix. Direct messages can accept bare commands.

## Safety Controls

- Duplicate message ids are ignored.
- Optional allowed sender and allowed space filters can be configured.
- Trade language is paper-only.
- Spectrum commands mutate paper desk state, not brokerage state.
- Runtime commands use the same allowlisted Dedalus/OpenClaw path as the web API.

## State

Spectrum state is stored through `frontend/lib/spectrum-desk-state.ts`. By default, the runtime JSON lives under `.citadail/runtime`, with override support through `CITADAIL_SPECTRUM_STATE_PATH`.
