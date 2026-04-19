# Citadail Architecture

## OpenClaw Execution Path

Citadail can execute a bounded Full Auto replay step through a machine-backed OpenClaw runtime on Dedalus.

- The browser calls `/api/full-auto/step` with an execution mode: `dedalus_openclaw`, `hybrid`, or `local`.
- Machine-backed mode calls the safe Dedalus action `run_openclaw_step`.
- The remote command vocabulary is frozen to `start`, `step`, and `pause`.
- The Dedalus worker writes proof to `/home/machine/citadail/state/openclaw-proof.json`.
- The web UI and Photon command layer read a sanitized proof copy from the local Dedalus runtime state.
- Hybrid mode falls back to local execution if the machine runtime is unavailable.

Paper positions only. No live trading or brokerage execution.
