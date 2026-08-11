import type { SequentumApiClient } from "../../api/api-client.js";

export type CallToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: true;
};

export type ProgressFn = (progress: number, total?: number, message?: string) => Promise<void>;

export interface ToolDeps {
  apiClient: SequentumApiClient;
  sendProgress: ProgressFn;
  /**
   * Abort signal for the in-flight tool call, sourced from the request handler's
   * `ctx.mcpReq.signal`. Only `start_agent_build` uses this today (to stop polling
   * and call `stopAgentBuild` when the MCP client cancels the request mid-poll).
   */
  signal: AbortSignal;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  deps: ToolDeps
) => Promise<CallToolResult>;

/** Every handler returns text content; this keeps the JSON shape identical across tools. */
export function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}
