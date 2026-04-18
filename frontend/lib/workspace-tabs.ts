import type { ShellSession, WorkspaceTabId } from "@/types/session";

export interface WorkspaceTab {
  id: WorkspaceTabId;
  label: string;
  kind:
    | "morning-brief"
    | "live-book"
    | "coverage-desk"
    | "thesis"
    | "project-artifact"
    | "pm-review"
    | "risk-gate"
    | "trade-desk"
    | "thread"
    | "artifact";
  artifactId?: string;
  iconSrc?: string;
}

interface BuildWorkspaceTabsInput {
  activeSession: ShellSession | null;
}

export const buildWorkspaceTabs = ({
  activeSession,
}: BuildWorkspaceTabsInput): WorkspaceTab[] => {
  const tabs: WorkspaceTab[] = [
    {
      id: "morning-brief",
      label: "Morning News",
      kind: "morning-brief",
    },
    {
      id: "live-book",
      label: "Live Book",
      kind: "live-book",
    },
    {
      id: "coverage-desk",
      label: "Coverage Desk",
      kind: "coverage-desk",
    },
  ];

  if (activeSession?.snapshot.selectedTicker || activeSession?.snapshot.thesisDraft) {
    tabs.push({
      id: "thesis",
      label: "Thesis",
      kind: "thesis",
    });
  }

  const equityProject = activeSession?.snapshot.equityProject;
  if (equityProject?.status === "ready") {
    tabs.push(
      {
        id: "project:memo_docx",
        label: "Memo",
        kind: "project-artifact",
        iconSrc: "/analyst-icons/memo.png",
      },
      {
        id: "project:operating_model_xlsx",
        label: "Model",
        kind: "project-artifact",
        iconSrc: "/analyst-icons/model.png",
      },
      {
        id: "project:pm_deck_pptx",
        label: "Deck",
        kind: "project-artifact",
        iconSrc: "/analyst-icons/deck.png",
      },
      {
        id: "pm-review",
        label: "PM Review",
        kind: "pm-review",
      },
    );
  }

  if (
    equityProject?.status === "ready" &&
    (activeSession?.snapshot.pmReview?.decision === "approved_to_risk" ||
      activeSession?.snapshot.riskGate)
  ) {
    tabs.push({
      id: "risk-gate",
      label: "Risk Gate",
      kind: "risk-gate",
    });
  }

  if (
    equityProject?.status === "ready" &&
    (activeSession?.snapshot.riskGate?.decision === "approved_to_desk" ||
      activeSession?.snapshot.paperPosition)
  ) {
    tabs.push({
      id: "trade-desk",
      label: "Trade Desk",
      kind: "trade-desk",
    });
  }

  for (const artifact of activeSession?.artifacts ?? []) {
    tabs.push({
      id: `artifact:${artifact.id}`,
      label: artifact.title,
      kind: "artifact",
      artifactId: artifact.id,
    });
  }

  return tabs;
};
