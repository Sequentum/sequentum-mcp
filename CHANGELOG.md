# Changelog

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

[Unreleased]: https://github.com/Sequentum/sequentum-mcp/compare/v1.1.3...HEAD
[1.1.3]: https://github.com/Sequentum/sequentum-mcp/compare/v1.0.2...v1.1.3
[1.0.2]: https://github.com/Sequentum/sequentum-mcp/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Sequentum/sequentum-mcp/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Sequentum/sequentum-mcp/releases/tag/v1.0.0
