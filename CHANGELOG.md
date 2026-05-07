# Changelog

## [Unreleased]

---

## [1.3.0] - TBD

### Added

- **Claude Connectors Directory support:**
  - Origin-header allowlist (`src/server/cors.ts`) replaces the previous wildcard `Access-Control-Allow-Origin: *`. Permits Claude domains (`claude.ai`, `claude.com`, and all subdomain depths), Sequentum domains, and (when `DEBUG=1`) localhost. Additional exact-match origins can be appended at startup via `ALLOWED_ORIGINS` (comma-separated; defaults are always preserved — see README). Requests from non-allowlisted browser origins to `/mcp` receive 403; requests without an `Origin` header (native MCP clients such as Cursor, Claude Desktop, Claude Code) pass through unaffected. `Vary: Origin` is set unconditionally so intermediate caches cannot conflate responses across origins.
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

### Tests

- Annotation regression tests added to `src/server/handlers.test.ts`: every tool must have a non-empty `title`, every tool must have `readOnlyHint` defined, and every write tool must have `destructiveHint` explicitly defined.
- Handler-dispatch tests added for the three agent-builder tools via `InMemoryTransport` + `Client`: `start_agent_build` rejects prompts below `minLength: 10`; `get_agent_build_status` sanitizes the `error` field; `stop_agent_build` returns the expected JSON shape.

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
