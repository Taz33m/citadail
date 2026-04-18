import type { ShellSession } from "@/types/session";

export type DashboardNavigationIntent =
  | { type: "new" }
  | { type: "resume"; sessionId: string }
  | { type: "delete"; sessionId: string };

export interface SessionListItem {
  id: string;
  title: string;
  summary: string;
  status: ShellSession["status"];
  updatedAt: Date;
}

export interface DashboardSessionCard {
  id: string;
  title: string;
  status: ShellSession["status"];
  summary: string;
  artifactCount: number;
  eventCount: number;
  updatedAt: Date;
}

export interface DeterministicSummaryOutput {
  text: string;
  artifactCount: number;
  eventCount: number;
}
