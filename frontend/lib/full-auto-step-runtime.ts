import {
  recordLocalOpenClawFallbackProof,
  runOpenClawStepOnDedalus,
} from "@/lib/dedalus-runtime";
import { stepFullAutoRun } from "@/lib/full-auto-orchestrator";
import type {
  FullAutoExecutionMode,
  OpenClawExecutionProof,
  OpenClawStepCommand,
} from "@/types/dedalus-runtime";
import type { FullAutoRun, FullAutoStepCommand } from "@/types/full-auto";

export const DEFAULT_FULL_AUTO_EXECUTION_MODE: FullAutoExecutionMode = "hybrid";

export const isFullAutoExecutionMode = (
  value: unknown,
): value is FullAutoExecutionMode =>
  value === "local" || value === "hybrid" || value === "dedalus_openclaw";

export const openClawCommandForStep = (
  command: FullAutoStepCommand,
): OpenClawStepCommand => {
  if (command === "start") return "start";
  if (command === "pause") return "pause";
  return "step";
};

export const runFullAutoStepWithRuntime = async ({
  command,
  mode = DEFAULT_FULL_AUTO_EXECUTION_MODE,
  run,
}: {
  command: FullAutoStepCommand;
  mode?: FullAutoExecutionMode;
  run: FullAutoRun;
}): Promise<{
  executionMode: FullAutoExecutionMode;
  proof: OpenClawExecutionProof | null;
  run: FullAutoRun;
}> => {
  if (mode === "local") {
    return {
      executionMode: "local",
      proof: null,
      run: await stepFullAutoRun({ command, run }),
    };
  }

  const openclawCommand = openClawCommandForStep(command);
  try {
    const result = await runOpenClawStepOnDedalus({
      command: openclawCommand,
      run,
    });
    return {
      executionMode: "dedalus_openclaw",
      proof: result.proof,
      run: result.run,
    };
  } catch (error) {
    if (mode === "dedalus_openclaw") {
      throw error;
    }
    const fallbackRun = await stepFullAutoRun({ command, run });
    const proof = await recordLocalOpenClawFallbackProof({
      command: openclawCommand,
      error,
      previousRun: run,
      run: fallbackRun,
    });
    return {
      executionMode: "hybrid",
      proof,
      run: fallbackRun,
    };
  }
};
