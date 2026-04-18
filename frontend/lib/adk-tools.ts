'use client';

import { Type } from "@google/genai";
import type { FunctionDeclaration, Schema } from "@google/genai";

import { playToolCue } from "@/lib/audio";
import type { SessionArtifact } from "@/types/session";

export interface CreateArtifactInput {
  title: string;
  summary: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface AdkToolContext {
  createArtifact: (artifact: CreateArtifactInput) => SessionArtifact;
  getArtifacts: () => SessionArtifact[];
  getConversationContext?: () => string | undefined;
}

export interface AdkToolResult {
  success: boolean;
  message: string;
  [key: string]: unknown;
}

export interface AdkFunctionTool {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<AdkToolResult>;
  getDeclaration: () => FunctionDeclaration;
}

interface CreateAdkFunctionToolConfig {
  name: string;
  description: string;
  parameters: Schema;
  execute: (args: unknown) => Promise<AdkToolResult>;
}

const createFunctionTool = ({
  name,
  description,
  parameters,
  execute,
}: CreateAdkFunctionToolConfig): AdkFunctionTool => ({
  name,
  execute: (args) => execute(args),
  getDeclaration: () => ({
    name,
    description,
    parameters,
  }),
});

const reqStr = (description: string) => ({
  type: Type.STRING,
  description,
});

const optStr = (description: string) => ({
  type: Type.STRING,
  description,
});

const toNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function createAdkTools(ctx: AdkToolContext): AdkFunctionTool[] {
  const { createArtifact, getArtifacts, getConversationContext } = ctx;

  return [
    createFunctionTool({
      name: "create_text_artifact",
      description:
        "Create a neutral text artifact for durable work product that should appear as a tab in the workspace. Use this for memos, notes, structured summaries, plans, or any response that should persist outside the chat thread.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: reqStr("Short artifact title."),
          summary: reqStr("One-sentence summary of the artifact."),
          content: reqStr("Artifact body in Markdown."),
          sourceLabel: optStr(
            "Optional short label for the source or assumption behind the artifact.",
          ),
        },
        required: ["title", "summary", "content"],
      },
      execute: async (args: unknown) => {
        const input = args as Record<string, unknown>;
        const title = toNonEmptyString(input.title);
        const summary = toNonEmptyString(input.summary);
        const content = toNonEmptyString(input.content);

        if (!title || !summary || !content) {
          const result = {
            success: false,
            message: "title, summary, and content are required.",
          };
          playToolCue(result);
          return result;
        }

        const artifact = createArtifact({
          title,
          summary,
          content,
          metadata: {
            sourceLabel: toNonEmptyString(input.sourceLabel) ?? "agent",
          },
        });

        const result = {
          success: true,
          message: `Created artifact: ${artifact.title}`,
          artifactId: artifact.id,
          title: artifact.title,
        };
        playToolCue(result);
        return result;
      },
    }),

    createFunctionTool({
      name: "list_artifacts",
      description:
        "List the artifacts currently available in the workspace so the agent can refer to existing durable context before creating another artifact.",
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
      execute: async () => {
        const artifacts = getArtifacts().map((artifact) => ({
          id: artifact.id,
          title: artifact.title,
          summary: artifact.summary,
          type: artifact.type,
          createdAt: artifact.createdAt.toISOString(),
        }));

        return {
          success: true,
          message:
            artifacts.length === 0
              ? "No artifacts have been created yet."
              : `Found ${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"}.`,
          artifacts,
          conversationContext: getConversationContext?.(),
        };
      },
    }),
  ];
}

export const buildFunctionDeclarations = (
  tools: AdkFunctionTool[],
): FunctionDeclaration[] => tools.map((tool) => tool.getDeclaration());

export const runAdkTool = async (
  tools: Map<string, AdkFunctionTool>,
  name: string,
  args: Record<string, unknown> = {},
) => {
  const tool = tools.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return tool.execute(args);
};
