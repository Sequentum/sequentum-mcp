# Changelog

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

[Unreleased]: https://github.com/sequentum/se4-mcp-server/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/sequentum/se4-mcp-server/releases/tag/v1.0.0
