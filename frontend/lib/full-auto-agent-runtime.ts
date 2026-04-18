import type {
  FullAutoAgentEvent,
  FullAutoAgentRole,
  HistoricalSource,
} from "@/types/full-auto";

export interface AgentRuntimeInput {
  role: FullAutoAgentRole;
  simulationTime: string;
  input: Record<string, unknown>;
  visibleSources: HistoricalSource[];
}

export interface AgentRuntimeOutput {
  event: FullAutoAgentEvent;
  output: Record<string, unknown>;
}

const eventId = () =>
  `agent-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const summaryForRole = (
  role: FullAutoAgentRole,
  sourceCount: number,
  input: Record<string, unknown>,
) => {
  const ticker = typeof input.ticker === "string" ? input.ticker : null;
  switch (role) {
    case "Morning Brief Agent":
      return `Morning Brief scanned ${sourceCount} visible sources.`;
    case "Candidate Agent":
      return `Candidate Agent ranked the visible universe.`;
    case "Fundamental Analyst":
      return `Fundamental analyst parsed ${ticker ?? "the candidate"} financial and filing context.`;
    case "News / Sentiment Analyst":
      return `News analyst reviewed ${ticker ?? "the candidate"} event flow.`;
    case "Market Structure Analyst":
      return `Market structure analyst checked price path and drawdown context.`;
    case "Macro / Context Analyst":
      return `Macro analyst checked regime and exposure constraints.`;
    case "PM Synthesizer":
      return `PM Synthesizer compressed the work into one ThesisRecord.`;
    case "Validation Agent":
      return `Validation Agent ran a prior-window setup check before Risk Gate.`;
    case "Risk Gate Agent":
      return `Risk Gate checked size, exposure, and kill conditions.`;
    case "Desk Agent":
      return `Desk Agent translated approval into a paper position.`;
    case "Monitor Agent":
      return `Monitor Agent re-checked active theses against new visible data.`;
    case "Journal Agent":
      return `Journal Agent logged the decision trail.`;
  }
};

export const runAgent = async ({
  input,
  role,
  simulationTime,
  visibleSources,
}: AgentRuntimeInput): Promise<AgentRuntimeOutput> => {
  const visibleSourceIds = visibleSources.map((source) => source.sourceId);
  const output = {
    role,
    visibleSourceIds,
    sourceCount: visibleSourceIds.length,
    simulationTime,
  };

  return {
    event: {
      id: eventId(),
      role,
      status: "complete",
      timestamp: new Date().toISOString(),
      simulationTime,
      message: summaryForRole(role, visibleSourceIds.length, input),
      visibleSourceIds,
      output,
    },
    output,
  };
};
