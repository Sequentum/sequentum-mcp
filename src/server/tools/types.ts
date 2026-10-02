import type { SequentumApiClient } from "../../api/api-client.js";

export type CallToolResult = {
  content: Array<{ type: "text"; text: string }>;
  /** Present on tools that declare an outputSchema. The SDK validates it. */
  structuredContent?: unknown;
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

/**
 * jsonResult plus structuredContent. The structured value is parsed back from the
 * exact text written, so the two can never disagree: keys whose value is undefined are dropped
 * from both, as JSON.stringify drops them.
 */
export function structuredResult(value: unknown): CallToolResult {
  const result = jsonResult(value);
  return { ...result, structuredContent: JSON.parse(result.content[0].text) };
}

/**
 * Attaches structuredContent to a result whose text is built by hand (a prose prefix, a URL
 * line). The text is reused as is, so it cannot change; the value goes through a JSON round
 * trip for the same reason as in structuredResult.
 */
export function withStructured(result: CallToolResult, value: unknown): CallToolResult {
  return { ...result, structuredContent: value === undefined ? undefined : JSON.parse(JSON.stringify(value)) };
}
