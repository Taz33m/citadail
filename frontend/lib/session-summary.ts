import type { ShellSession } from "@/types/session";
import type { DeterministicSummaryOutput } from "@/types/session-app";

export const generateDeterministicSummary = (
  session: ShellSession,
): DeterministicSummaryOutput => {
  const artifactCount = session.artifacts.length;
  const eventCount = session.events.length;

  const text =
    artifactCount === 0
      ? "Session started; no artifacts created yet."
      : `Session has ${artifactCount} artifact${artifactCount === 1 ? "" : "s"} and ${eventCount} event${eventCount === 1 ? "" : "s"}.`;

  return {
    text,
    artifactCount,
    eventCount,
  };
};
