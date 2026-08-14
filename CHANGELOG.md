# Changelog

## [2.0.0] - TBD

### BREAKING CHANGES

- **Node 20 is now the minimum supported runtime** (`engines.node: ">=20"`), required by
  the MCP TypeScript SDK v2 dependency. The Docker image was already `node:20-alpine`.
- **Migrated to MCP TypeScript SDK v2.** The server now speaks protocol revision
  `2026-07-28` and negotiates legacy revisions for clients that request them, so
  existing MCP clients continue to work unmodified.
- **HTTP transport is now stateless.** `Mcp-Session-Id` is ignored entirely; there is no
  per-client session state on the server. `GET /mcp` no longer opens an SSE stream — it
  returns `405 Method Not Allowed` (or `401` first, with the RFC 9728
  `WWW-Authenticate` challenge, if the request is unauthenticated). `DELETE /mcp` is a
  no-op that always answers `200`, since there is no session left to terminate.
- **`MAX_SESSIONS` is no longer read.** It has no effect in a stateless server; remove
  it from any deployment configuration.
- **Rate-limit error code changed from `-32029` to `-32010`.** MCP `2026-07-28`
  reserves `-32020`..`-32099` for the specification itself; `-32029` fell inside that
  range and had to move.
- **Requests carrying the `2026-07-28` `_meta` envelope now require the `Mcp-Method`
  header, and `Mcp-Name` on name-carrying requests** (`tools/call`, `prompts/get`, and
  `resources/read` where the value is `params.uri`). This applies only to modern-envelope
  requests. Clients still on `2025-11-25` or earlier — including every existing connector
  that has not opted into the envelope — are unaffected and need not send either header.
- **Unknown or invalid resource URIs now return `-32602` (Invalid params)** instead of
  `-32603` (Internal error), correctly signaling a caller mistake rather than a server
  fault.
- **Unknown tool name now returns a JSON-RPC protocol error instead of a tool result.**
  Previously an unknown tool name in `tools/call` produced HTTP 200 with a tool result:
  `{result:{content:[{text:"Error: Unknown tool: X"}],isError:true}}`. It now produces
  `{error:{code:-32602,message:"Tool X not found"}}`. Confirmed identical in both the
  modern and legacy eras. Any client that branched on `isError` to detect an unknown tool
  now needs to handle the JSON-RPC error instead.
- **Schema-invalid tool arguments now fail before the handler runs, with a different
  error message.** The SDK validates `tools/call` arguments against the tool's
  `inputSchema` up front. For example, a missing required parameter previously produced
  `"Error: Invalid parameter 'agentId': ..."`; it now produces `"Input validation error:
  Invalid arguments for tool get_agent: data must have required property 'agentId'"`.
- **`/.well-known/oauth-authorization-server` no longer returns a metadata document.**
  It now answers `302` with a `Location` pointing at the authorization server's own
  document. This server is a protected resource, not an authorization server: RFC 8414
  §3.3 requires the `issuer` in that document to equal the origin it was fetched from,
  which a copy served here can never satisfy. Clients that follow redirects are
  unaffected; a client that read the body without following the redirect must now follow
  it, or read `authorization_servers` from `/.well-known/oauth-protected-resource`.

### Added

- **`SEQUENTUM_OAUTH_ISSUER`** — optional HTTP-mode variable naming this deployment's
  OAuth issuer identifier, defaulting to `SEQUENTUM_API_URL`. Set it when the API base
  URL and the public OAuth issuer differ. A malformed value refuses to start.
- Cache hints (`ttlMs` / `cacheScope`) on all four list-shaped results (`tools/list`,
  `prompts/list`, `resources/list`, `resources/templates/list`) and on
  `server/discover`, so conformant clients can cache them; `resources/read` is
  explicitly marked `private` with `ttlMs: 0`, since every resource is scoped to the
  caller's own OAuth token and must never be cached publicly.
- Argument-sufficiency requirements added to the `start_agent`, `run_space_agents`, and
  `start_agent_build` tool descriptions, so the requirement to have an unambiguous
  target, extracted data, and scope travels in `tools/list` itself (which every client
  reads) rather than only in the server's `instructions` (which clients MAY skip under
  `2026-07-28`, since there is no `initialize` handshake).
- Per-request logging of the negotiated protocol era, requested method/name, client
  identity, and auth presence, with OpenTelemetry trace-context (`traceparent` /
  `tracestate`) read from the request headers and recorded in the log line, so a
  request can be correlated across pods. These values are logged only — not
  propagated to the outbound Sequentum API calls.
- Configurable rate limiting via `MCP_RATE_LIMIT_WINDOW_MS` and `MCP_RATE_LIMIT_MAX`,
  and configurable list-cache freshness via `LIST_CACHE_TTL_MS` — all three parsed
  strictly, failing fast at startup on a malformed value instead of silently truncating
  it.
- `TRUST_PROXY` widened to accept a hop count or a comma-separated CIDR/IP allowlist,
  in addition to `true`/`false`.
- A JSON-RPC error middleware on `/mcp` that returns a sanitized JSON-RPC error object
  instead of falling through to Express's default HTML error page.

### Changed

- Tool handlers split out of a single monolithic switch statement into six per-domain
  modules (`agents`, `billing`, `builds`, `runs`, `schedules`, `spaces`) under
  `src/server/tools/`, dispatched via a lookup map.

## [1.3.0] - TBD

### Added

- **ChatGPT Apps support:**
  - CORS allowlist extended in `src/server/cors.ts` to permit `https://chatgpt.com`, `https://platform.openai.com`, and any subdomain depth under `chatgpt.com` (e.g. `connector.chatgpt.com`). `https://chat.openai.com` is intentionally omitted — OpenAI retired that origin in mid-2024 and redirects it to `chatgpt.com`; no live ChatGPT surface issues that Origin header. Same multi-level subdomain pattern and trust rationale as the Claude entries.
  - `openWorldHint` added to all 13 write tools per the MCP spec. Tools that scrape arbitrary external websites on behalf of the caller (`start_agent`, `run_space_agents`, `start_agent_build`) are `true`. Tools that only mutate Sequentum's internal state (`stop_agent`, `kill_agent`, `delete_run`, `restore_agent_version`, schedule CRUD, `stop_agent_build`) are `false`. Required by OpenAI's ChatGPT App submission review.
  - ChatGPT setup instructions added to `README.md` under "Set Up Your Client".
- **Claude Connectors Directory support:**
  - Origin-header allowlist (`src/server/cors.ts`) replaces the previous wildcard `Access-Control-Allow-Origin: *`. Permits Claude domains (`claude.ai`, `claude.com`, and all subdomain depths), Sequentum domains, and (when `DEBUG=1`) localhost / `127.0.0.1` / `[::1]`. Additional exact-match origins can be appended at startup via `ALLOWED_ORIGINS` (comma-separated; defaults are always preserved — see README). Requests from non-allowlisted browser origins to `/mcp` receive 403; requests without an `Origin` header (native MCP clients such as Cursor, Claude Desktop, Claude Code) pass through unaffected. `Vary: Origin` is set unconditionally so intermediate caches cannot conflate responses across origins.
  - Privacy Policy section added to `README.md` with a plain-language data-handling summary and a link to `https://www.sequentum.com/privacy-policy`.
- **Agent Builder tools** (3 new tools):
  - `start_agent_build` — Start an AI-powered agent build session from a natural language prompt. The agent is saved to the workspace automatically once the AI creates it.
  - `get_agent_build_status` — Poll the status of an agent build session. Stop polling on any terminal status: `completed`, `ready`, `error`, or `cancelled`. The session tears down automatically.
  - `stop_agent_build` — Abort an in-progress build session early (optional). Has no effect once a terminal status is reached. Any agent already saved to the workspace persists.
- **Agent Building prompts** (2 new prompts):
  - `build-agent-from-prompt` — End-to-end workflow: resolve space, start session, poll until complete, fetch and show the resulting agent
  - `inspect-agent-draft` — Check the status of an existing build session and show the resulting agent once available
- **`validateString` extended** with `minLength`, `maxLength`, and `trim` options (via new `StringValidationOptions` interface). Fully backward-compatible — existing callers that pass a boolean are unaffected.
- New types in `src/api/types.ts`: `AgentBuilderSessionStatus`, `ExternalStartAgentBuildRequest`, `ExternalStartAgentBuildResponse`, `ExternalSessionStatusResponse`
- **User-controlled polling cadence for Agent Builder:**
  - Added optional `pollingPreference` argument to both `build-agent-from-prompt` and `inspect-agent-draft` prompts. Accepts `"fast"` / `"normal"` / `"slow"` or any free-form instruction (e.g. `"poll every 5 seconds"`, `"be patient, this is a big site"`). When provided, the directive is templated into the prompt as a high-priority instruction the model honors when polling `get_agent_build_status`.
  - Added a `POLLING CADENCE` paragraph to the `get_agent_build_status` tool description so user-expressed cadence preferences are also respected when the tool is invoked outside the prompts (e.g. via plain-chat usage). Default is a moderate cadence with backoff (~5s start, ~15–30s ceiling).
- `title` annotation added to all 39 tools — human-readable label used by Anthropic's Connectors Directory and OpenAI's ChatGPT App submission.
- `destructiveHint: false` explicitly set on `start_agent_build` and `stop_agent_build` (previously defaulted to `true` because `readOnlyHint: false` was set without `destructiveHint`).
- **Sufficiency and prompt-handling policies.** New `src/server/policies.ts` is the single source of truth for two LLM-facing policy strings:
  - `SUFFICIENCY_POLICY` is sent to every MCP client as the server `instructions` (on `initialize`). Directs the model to ask one consolidated clarifying question when a build/run request lacks an unambiguous URL, target data, or scope qualifier, and explicitly forbids silent extrapolation by analogy across sites or schemas.
  - `PROMPT_HANDLING_POLICY` is appended to the `start_agent_build` tool description and inlined into the `build-agent-from-prompt` prompt template (rendered as a `**GUARDRAIL:**` preamble before the numbered steps). Directs the model to pass the user's wording through verbatim, allow only trivial normalizations (e.g. adding `https://`), and never invent fields, output formats, lazy-load instructions, pagination strategies, etc.
  - Net behavior change: the model asks for missing details instead of silently expanding sparse user input into verbose `start_agent_build` prompts.

### Documentation

- `docs/tool-reference.md` — Updated count to 39 tools, new Agent Builder category in Quick Reference and full section
- `docs/prompts-reference.md` — Updated count to 9 prompts, new Agent Building category in Quick Reference and full sections for both prompts
- `docs/resources-reference.md` — Added cross-reference note explaining that saved agents become accessible via existing `sequentum://agents/{agentId}` resource

### Security

- Prompt arguments (`prompt`, `spaceName`, `sessionId`, `pollingPreference`) in `src/server/prompts.ts` are now sanitized before interpolation: newlines stripped, trimmed, and enforced per-argument length limits. Reduces prompt-injection surface via user-controlled strings.
- `pollingPreference` de-elevated from an `IMPORTANT DIRECTIVE` banner to an advisory instruction, reducing its authority in the model's context.
- `get_agent_build_status` handler now wraps raw backend `error` messages with a generic user-facing string (`"Build failed. Please review your prompt and try again."`). Raw error is still logged at `DEBUG=1` for operators. Prevents leakage of backend stack traces or internal endpoint paths to clients.
- `sessionId` parameter validated with `maxLength: 256` at both agent-builder handler call sites.
- `stop_agent_build` handler now returns structured JSON (`{ stopped: true, sessionId }`) instead of free-form English prose, consistent with all other tool handlers.
- `redactDebugArgs` in `src/server/handlers.ts` extended to mask `prompt` and `comments` fields in addition to existing sensitive keys.
- The new sufficiency and prompt-handling policies (see **Added**) reduce the surface for the model to silently extrapolate user requests across sites or schemas — defense in depth against accidental leakage of inferred-but-wrong details into a build.

### Tests

- Annotation regression tests strengthened in `src/server/handlers.test.ts`: every tool must have a non-empty `title` and `readOnlyHint` defined. Write-tool annotations are now validated against per-tool expectation tables — `openWorldHint` and `destructiveHint` must match an explicit expected value, not just be defined. Adding a new write tool without classifying both hints fails the build; changing an existing value without updating the table also fails.
- Handler-dispatch tests added for the three agent-builder tools via `InMemoryTransport` + `Client`: `start_agent_build` rejects prompts below `minLength: 10`; `get_agent_build_status` sanitizes the `error` field; `stop_agent_build` returns the expected JSON shape.
- CORS regression tests added in `src/server/cors.test.ts` covering exact-origin matches, claude/chatgpt subdomain depth (single and multi-level), `ALLOWED_ORIGINS` env-var append semantics, debug-mode localhost / IPv6 loopback, and adversarial rejections (e.g. `https://claude.ai.evil.com`, `https://notclaude.ai`, wrong scheme, uppercase).
- Policy-wiring regression tests added in `src/server/handlers.test.ts`: `client.getInstructions()` equals `SUFFICIENCY_POLICY`; the `start_agent_build` tool description contains `PROMPT_HANDLING_POLICY`; the `build-agent-from-prompt` template embeds `PROMPT_HANDLING_POLICY`. Ensures the constants reach all three injection surfaces and prevents silent drift.

---

## [1.2.0] - 2026-03-12

### Added

- **MCP Prompts** (9 reusable workflow templates):
  - `debug-agent` -- Diagnose why an agent is failing
  - `agent-health-check` -- Comprehensive health overview for an agent
  - `spending-report` -- Spending and credits report
  - `cost-analysis` -- Analyze costs across agents
  - `run-and-monitor` -- Start an agent and monitor until completion
  - `space-overview` -- Overview of all agents in a space
  - `daily-operations-report` -- Daily operations report across all agents
  - `schedule-agent` -- Walk through creating or reviewing schedules
  - `compare-runs` -- Compare last successful vs failed run
- **MCP Resources** (18 read-only, URI-addressable data endpoints):
  - 7 static resources: agent list, spaces, credits balance, monthly spending, agent costs, recent runs summary, upcoming schedules
  - 11 resource templates: agent detail, agent versions, agent schedules, agent cost breakdown, agent runs, run status, run files, run diagnostics, latest failure, space detail, space agents
- **Schedule Management** tools:
  - `get_agent_schedule` -- Get details of a specific schedule
  - `update_agent_schedule` -- Update an existing schedule's timing, parameters, or settings
  - `enable_agent_schedule` -- Enable a previously disabled schedule
  - `disable_agent_schedule` -- Disable a schedule without deleting it
- New `src/server/handlers.test.ts` with handler unit tests
- Expanded test coverage for API client and index module
- Documentation: `docs/prompts-reference.md` and `docs/resources-reference.md`

### Changed

- **Major architecture refactoring**: Split monolithic `src/index.ts` (~2000 lines) into a modular structure:
  - `src/server/tools.ts` -- Tool definitions and schemas
  - `src/server/handlers.ts` -- MCP server factory and tool handler dispatch
  - `src/server/http-server.ts` -- HTTP/Streamable transport, session management, OAuth discovery
  - `src/server/prompts.ts` -- Prompt definitions and message builders
  - `src/server/resources.ts` -- Resource and resource template definitions with URI dispatcher
  - `src/api/api-client.ts` -- API client (moved from `src/`)
  - `src/api/types.ts` -- TypeScript interfaces and enums (moved from `src/`)
  - `src/utils/validation.ts` -- Input validation helpers (moved from `src/`)
  - `src/utils/oauth-metadata.ts` -- OAuth metadata builder (moved from `src/`)
- Extracted shared validation logic into `src/utils/validation.ts` to eliminate duplicate code
- Added URI validation for resource endpoints
- Improved atomic session control in HTTP server
- Updated `docs/tool-reference.md` with the 4 new schedule tools (36 total)
- Updated `README.md` with prompts, resources sections and references to new documentation

## [1.1.4] - 2026-03-04

### Added

- `delete_run` tool for deleting runs and associated data (PII compliance)
- **Billing & Cost Analysis** tools for detailed agent cost tracking:
  - `get_agents_usage` - Get all agents with their costs for a date range, with filtering and sorting options
  - `get_agent_cost_breakdown` - Get cost breakdown by usage type for a specific agent over time (for charting)
  - `get_agent_runs_cost` - Get individual run costs for a specific agent with detailed run information

### Changed

- Replaced Claude Desktop setup instructions with Custom Connectors approach (config file method caused Claude Desktop to break). Added plan-specific steps for Free/Pro/Max and Team/Enterprise accounts, with a link to [Claude's custom connectors documentation](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## [1.1.3] - 2026-02-17

### Added


- `kill_agent` tool for forceful agent termination (as a last resort when `stop_agent` fails)
- OAuth 2.1 support with HTTP Streamable transport and RFC 8707 resource parameters
- OAuth2 Protected Resource Metadata endpoint for MCP client authentication
- Support for Dynamic Client Registration (DCR) and Client Instance Metadata Discovery (CIMD)
- New `oauth-metadata.ts` module for OAuth metadata handling
- Dockerfile for containerized deployment

### Changed

- Enhanced `kill_agent` tool with improved functionality
- Improved 401 authentication error handling on the `/mcp` endpoint
- Refactored OAuth-related logic out of `index.ts` into dedicated `oauth-metadata.ts` module
- Shortened MCP tool descriptions to save tokens
- Removed unnecessary logging from authentication flow
- Updated README with OAuth server setup instructions and improved readability
- Improved `docs/tool-reference.md` and `docs/troubleshooting.md` documentation

## [1.0.2] - 2026-01-20

### Fixed

- Fixed executable permissions on `dist/index.js` causing "Permission denied" errors when running via npx
- Added `postbuild` script to automatically set executable permissions after build

## [1.0.1] - 2026-01-17

### Changed

- Minor documentation updates

## [1.0.0] - 2026-01-16

### Added

- Initial release of Sequentum MCP 
- **Agent Management** tools:
  - `list_agents` - List all web scraping agents with filtering and pagination
  - `get_agent` - Get detailed agent information and input parameters
  - `search_agents` - Search agents by name or description
- **Run Management** tools:
  - `get_agent_runs` - Get execution history for an agent
  - `get_run_status` - Get current status of a specific run
  - `start_agent` - Start agent execution (async or sync mode)
  - `stop_agent` - Stop a running agent
- **File Management** tools:
  - `get_run_files` - List output files from a completed run
  - `get_file_download_url` - Get temporary download URL for files
- **Version Management** tools:
  - `get_agent_versions` - List all saved versions of an agent
  - `restore_agent_version` - Restore agent to a previous version
- **Schedule Management** tools:
  - `list_agent_schedules` - List all schedules for an agent
  - `create_agent_schedule` - Create new schedules (RunOnce, RunEvery, CRON)
  - `delete_agent_schedule` - Remove a schedule from an agent
  - `get_scheduled_runs` - Get upcoming scheduled runs across all agents
- **Billing & Credits** tools:
  - `get_credits_balance` - Get current credits balance
  - `get_spending_summary` - Get spending summary for date range
  - `get_credit_history` - Get credit transaction history
- **Space Management** tools:
  - `list_spaces` - List all accessible spaces
  - `get_space` - Get space details
  - `get_space_agents` - List agents in a space
  - `search_space_by_name` - Find space by name
  - `run_space_agents` - Start all agents in a space
- **Analytics & Diagnostics** tools:
  - `get_runs_summary` - Get aggregate run statistics
  - `get_records_summary` - Get extraction/export statistics
  - `get_run_diagnostics` - Get detailed diagnostics for a run
  - `get_latest_failure` - Get diagnostics for most recent failure

---

[1.2.0]: https://github.com/Sequentum/sequentum-mcp/compare/v1.1.4...v1.2.0
[1.1.4]: https://github.com/Sequentum/sequentum-mcp/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/Sequentum/sequentum-mcp/compare/v1.0.2...v1.1.3
[1.0.2]: https://github.com/Sequentum/sequentum-mcp/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Sequentum/sequentum-mcp/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Sequentum/sequentum-mcp/releases/tag/v1.0.0
