/**
 * MCP Server Factory and Tool Handlers
 *
 * Contains input validation helpers, response helpers, and the
 * createMcpServer factory that wires tool definitions to their handlers.
 */

import {
  McpServer,
  ResourceNotFoundError,
  ResourceTemplate,
  fromJsonSchema,
  type JsonSchemaType,
} from "@modelcontextprotocol/server";
import { SUFFICIENCY_POLICY } from "./policies.js";
import { AGENT_BUILD_ERROR_MESSAGE, LIST_CACHE_TTL_MS } from "./constants.js";
import { SequentumApiClient } from "../api/api-client.js";
import { ApiRequestError, RateLimitError, AuthenticationError } from "../api/types.js";
import { tools } from "./tools.js";
import { resources, resourceTemplates, readResource } from "./resources.js";
import { prompts, getPromptMessages } from "./prompts.js";
import { toolDispatch, type ProgressFn } from "./tools/index.js";
import { DEBUG, isPaginatedResponse, parseScheduleParams, validateScheduleStartTime } from "./tools/shared.js";

// ==========================================
// Response Helpers
// ==========================================

// getRunStatusLabel, summarizeAgents, isPaginatedResponse, parseScheduleParams,
// and validateScheduleStartTime moved to ./tools/shared.js so the tool handler
// modules (agents.ts, schedules.ts, ...) can use them without importing from
// this file (which would create a circular import — this file imports
// toolDispatch from ./tools/index.js, which imports those modules).
// Re-exported here for backwards compatibility with existing test imports.
export { isPaginatedResponse, parseScheduleParams, validateScheduleStartTime };

export function formatToolError(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  let errorMessage: string;
  let errorPrefix = "Error";

  if (error instanceof RateLimitError) {
    errorPrefix = "Rate Limited";
    const retryHint = error.retryAfterSeconds
      ? ` Try again in ${error.retryAfterSeconds} seconds.`
      : " Please wait a moment before retrying.";
    errorMessage = `The Sequentum API rate limit has been reached.${retryHint}`;
  } else if (error instanceof AuthenticationError) {
    errorPrefix = "Authentication Error";
    errorMessage = error.message;
  } else if (error instanceof ApiRequestError) {
    if (error.isUnauthorized) {
      errorPrefix = "Authentication Failed";
      errorMessage = "Your API key or OAuth token is invalid or has expired. Please check your credentials.";
    } else if (error.isInsufficientScope) {
      // SE4-3929: distinguished from the generic 403 below so the caller learns this is a
      // scope problem, not a permissions problem, and is told what to do about it.
      errorPrefix = "Insufficient Scope";
      // The scope name comes from the upstream WWW-Authenticate header, which is not
      // guaranteed to carry one -- hence the two phrasings rather than an empty slot.
      const need = error.requiredScope
        ? `the "${error.requiredScope}" scope, which this Sequentum MCP connection was not granted`
        : "an OAuth scope that this Sequentum MCP connection was not granted";
      errorMessage = `This action requires ${need}. Disconnect and reconnect the Sequentum MCP server, then approve the requested permissions, to re-authorize.`;
    } else if (error.isForbidden) {
      errorPrefix = "Access Denied";
      errorMessage = "You don't have permission to perform this action. Check your API key permissions.";
    } else if (error.isNotFound) {
      errorPrefix = "Not Found";
      errorMessage = error.message;
    } else if (error.isServerError) {
      errorPrefix = "Server Error";
      errorMessage = `The Sequentum API encountered an internal error (${error.statusCode}). This is a server-side issue — please try again later.`;
    } else {
      errorPrefix = `API Error (${error.statusCode})`;
      errorMessage = error.message;
    }
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else {
    errorMessage = "An unknown error occurred";
  }

  return {
    content: [
      {
        type: "text",
        text: `${errorPrefix}: ${errorMessage}`,
      },
    ],
    isError: true,
  };
}

// ==========================================
// Server Factory
// ==========================================

// DEBUG is defined once in ./tools/shared.js (imported above) and re-exported
// there for the tool handler modules; handlers.ts just imports it, to avoid a
// second env read and to keep the two DEBUG flags from ever drifting apart.

// Re-exported (imported above for internal use) for backwards compatibility:
// handlers.test.ts still imports AGENT_BUILD_ERROR_MESSAGE from here. It must
// NOT be defined here: handlers.ts imports tools.ts/prompts.ts, which read
// constants from constants.js at module-evaluation time, so defining
// build-related constants here creates an import-cycle temporal dead zone
// that crashes on startup. See constants.ts.
export { AGENT_BUILD_ERROR_MESSAGE };

function redactDebugArgs(args: unknown): unknown {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return args;
  }

  const safeArgs: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  const sensitiveFields = [
    "inputParameters",
    "prompt",
    "comments",
    "apiKey",
    "token",
    "accessToken",
    "refreshToken",
    "password",
    "secret",
    "clientSecret",
  ];

  for (const field of sensitiveFields) {
    if (field in safeArgs) {
      safeArgs[field] = "[REDACTED]";
    }
  }

  return safeArgs;
}

/**
 * Read a resource and wrap it in the `resources/read` result shape, converting
 * genuine upstream failures into a descriptive error the SDK turns into a
 * JSON-RPC internal error. Shared by the static-URI and templated
 * registrations below.
 */
async function readResourceResult(uri: URL, apiClient: SequentumApiClient) {
  const uriString = uri.toString();

  if (DEBUG) {
    console.error(`[DEBUG] Resource read: ${uriString}`);
  }

  try {
    return { contents: [await readResource(uriString, apiClient)] };
  } catch (error) {
    // An unknown URI is a caller mistake, not a server fault: readResource()
    // throws the typed ResourceNotFoundError (wire code -32602) for that case.
    // Let it propagate as-is — rewrapping it in a generic Error below would
    // strip the type/brand the SDK relies on and it would surface as -32603
    // Internal error instead. Genuine upstream API failures are NOT typed
    // this way and still get wrapped into a descriptive internal error.
    if (error instanceof ResourceNotFoundError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    throw new Error(`Failed to read resource ${uriString}: ${errorMessage}`);
  }
}

/**
 * Create a new MCP Server instance with all tools, resources, and prompts registered.
 * Each session in HTTP mode needs its own McpServer instance.
 *
 * @param apiClient - The API client to use for this server instance
 * @param version - The server version string from package.json
 * @returns Configured MCP Server instance
 */
export function createMcpServer(apiClient: SequentumApiClient, version: string): McpServer {
  // Capabilities are intentionally NOT declared: McpServer derives them from the
  // registrations below. (It advertises `listChanged: true` for each even though
  // this server never emits those notifications — a known, accepted SDK behaviour
  // that cannot be suppressed through the constructor options.)
  const PUBLIC_LIST_HINT = { ttlMs: LIST_CACHE_TTL_MS, cacheScope: "public" as const };

  const server = new McpServer(
    {
      name: "sequentum-mcp-server",
      version,
    },
    {
      // Delivered to clients in the `server/discover` result (protocol revision
      // 2026-07-28 has no `initialize` handshake) and also in the legacy
      // `initialize` result the SDK still answers for 2025-era clients — so
      // this text reaches both eras, and clients on either MAY skip it, making
      // it advisory, not guaranteed to be read. The same requirements are
      // restated per-tool via PRE_CALL_CHECK on start_agent, run_space_agents,
      // and start_agent_build, which travel in tools/list and cannot be skipped.
      // Canonical text + JSDoc live in policies.ts; keep these in sync if the
      // policy's name or scope changes.
      instructions: SUFFICIENCY_POLICY,
      // Cache hints for the 2026-07-28 cacheable result types (`ttlMs`/`cacheScope`).
      // List-shaped results (and server/discover) are safe to cache publicly: they
      // carry no per-caller data and are only invalidated by a deploy.
      cacheHints: {
        "tools/list": PUBLIC_LIST_HINT,
        "prompts/list": PUBLIC_LIST_HINT,
        "resources/list": PUBLIC_LIST_HINT,
        "resources/templates/list": PUBLIC_LIST_HINT,
        "server/discover": PUBLIC_LIST_HINT,
        // NOT public and NOT tunable: every resource is API-backed and scoped to the
        // caller's OAuth token (agents, credit balances, spending). A shared
        // intermediary caching this publicly would serve one tenant's data to another.
        "resources/read": { ttlMs: 0, cacheScope: "private" as const },
      },
    }
  );

  // ==========================================
  // Tools
  // ==========================================

  // Registration is driven by iterating tools.ts so it remains the single source
  // of tool metadata (description, raw JSON Schema, annotations).
  for (const tool of tools) {
    const handler = toolDispatch[tool.name];
    if (!handler) {
      throw new Error(`No dispatch handler registered for tool "${tool.name}"`);
    }

    server.registerTool(
      tool.name,
      {
        // Under 2026-07-28, top-level `title` is the modern display-name location;
        // `annotations.title` (below) is the legacy one. Set both: the connectors
        // directory requires a top-level title, while legacy-era clients still
        // read only annotations.title.
        title: tool.annotations?.title,
        description: tool.description,
        // `Tool.inputSchema` is the permissive wire type (any JSON object), while
        // `fromJsonSchema` wants the structural `JSONSchema` interface. The cast is
        // the only bridge; the schemas in tools.ts are hand-written JSON Schema and
        // are what `tools/list` emits verbatim either way.
        inputSchema: fromJsonSchema(tool.inputSchema as JsonSchemaType),
        annotations: tool.annotations,
      },
      async (args, ctx) => {
        if (DEBUG) {
          console.error(`[DEBUG] Tool called: ${tool.name}`);
          console.error(`[DEBUG] Args: ${JSON.stringify(redactDebugArgs(args))}`);
        }

        const progressToken = ctx.mcpReq._meta?.progressToken;
        const sendProgress: ProgressFn = async (progress, total, message) => {
          if (progressToken === undefined) return;
          try {
            await ctx.mcpReq.notify({
              method: "notifications/progress",
              params: { progressToken, progress, total, message },
            });
          } catch { /* client disconnected — ignore */ }
        };

        try {
          return await handler((args ?? {}) as Record<string, unknown>, {
            apiClient,
            sendProgress,
            // start_agent_build stops the backend build when the client cancels
            // mid-poll; ToolDeps.signal is required so this cannot be dropped.
            signal: ctx.mcpReq.signal,
          });
        } catch (error) {
          return formatToolError(error);
        }
      }
    );
  }

  // ==========================================
  // Resources
  // ==========================================

  for (const resource of resources) {
    server.registerResource(
      resource.name,
      resource.uri,
      // registerResource requires a metadata argument; forward the descriptive
      // fields declared in resources.ts so resources/list output is unchanged.
      { description: resource.description, mimeType: resource.mimeType },
      (uri) => readResourceResult(uri, apiClient)
    );
  }

  for (const template of resourceTemplates) {
    server.registerResource(
      template.name,
      // `list: undefined` is required (not optional) so forgetting resource
      // enumeration has to be a deliberate choice — these templates are only
      // readable by URI, never enumerable.
      new ResourceTemplate(template.uriTemplate, { list: undefined }),
      { description: template.description, mimeType: template.mimeType },
      (uri) => readResourceResult(uri, apiClient)
    );
  }

  // ==========================================
  // Prompts
  // ==========================================

  for (const prompt of prompts) {
    // Most prompts declare arguments (debug-agent takes agentName, space-overview
    // takes spaceName, and so on), so argsSchema must be built rather than omitted.
    // MCP prompt arguments are always strings.
    const promptArgs = prompt.arguments ?? [];
    server.registerPrompt(
      prompt.name,
      {
        description: prompt.description,
        argsSchema: fromJsonSchema<Record<string, string>>({
          type: "object",
          properties: Object.fromEntries(
            promptArgs.map((a) => [a.name, { type: "string", description: a.description }])
          ),
          required: promptArgs.filter((a) => a.required).map((a) => a.name),
        }),
      },
      (args) => {
        if (DEBUG) {
          console.error(`[DEBUG] Prompt requested: ${prompt.name}`);
          console.error(`[DEBUG] Args: ${JSON.stringify(redactDebugArgs(args))}`);
        }
        return { messages: getPromptMessages(prompt.name, args) };
      }
    );
  }

  return server;
}
