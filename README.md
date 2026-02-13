# Sequentum MCP

[![npm version](https://img.shields.io/npm/v/sequentum-mcp.svg)](https://www.npmjs.com/package/sequentum-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`sequentum-mcp` lets your AI coding assistant (such as Claude, Cursor, or Copilot)
control and manage your Sequentum web scraping agents. It acts as a Model Context Protocol
(MCP) server, giving your AI assistant access to the full power of the Sequentum platform
for agent automation, monitoring, and data extraction.

## [Tool Reference](./docs/tool-reference.md) | [Troubleshooting](./docs/troubleshooting.md) | [Changelog](./CHANGELOG.md)

## Key Features

- **Agent management**: List, search, and get detailed information about your web scraping agents.
- **Run automation**: Start, stop, and monitor agent executions with real-time status tracking.
- **Schedule management**: Create and manage automated schedules using cron expressions.
- **Analytics & diagnostics**: Get run statistics, error analysis, and suggested fixes for failures.
- **Space organization**: Manage agent workspaces and run batch operations across spaces.

## Disclaimers

`sequentum-mcp` exposes your Sequentum account data to MCP clients, allowing them to
view, run, and manage your web scraping agents. Keep your API key secure and avoid
sharing sensitive information that you don't want accessible to MCP clients.

## Requirements

- [Node.js](https://nodejs.org/) v18 or higher
- [npm](https://www.npmjs.com/)
- Sequentum account with API access

## Getting Started

There are two ways to connect to the Sequentum MCP: running locally with an API key, or connecting to a remote server with OAuth authentication.

### Option 1: Local (API Key)

Run the MCP server locally using `npx`. Add the following config to your MCP client:

```json
{
  "mcpServers": {
    "sequentum": {
      "command": "npx",
      "args": ["-y", "sequentum-mcp"],
      "env": {
        "SEQUENTUM_API_KEY": "sk-your-api-key-here"
      }
    }
  }
}
```

#### Get Your API Key

1. Log in to the [Sequentum Control Center](https://dashboard.sequentum.com)
2. Go to **Settings** → **API Keys**
3. Click **Create API Key** and copy the generated key (starts with `sk-`)

### Option 2: Remote Server (OAuth)

Connect to a hosted Sequentum MCP server using OAuth 2.0 authentication. Add the following config to your MCP client:

```json
{
  "mcpServers": {
    "sequentum": {
      "url": "https://mcp.sequentum.com/mcp"
    }
  }
}
```

> **QA environment:** Use `https://mcp-qa.sequentum.com/mcp` instead for testing against the QA server.

When you connect for the first time, your MCP client will open a browser window for you to log in with your Sequentum account.

The server supports [Client ID Metadata Documents (CIMD)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00) as the preferred client identification method, with [Dynamic Client Registration (RFC 7591)](https://datatracker.ietf.org/doc/html/rfc7591) as a fallback. MCP clients that support CIMD (such as Cursor) can use their own URL as a `client_id` without any prior registration.

### MCP Client Configuration Files

| Client | Config File Location |
|--------|---------------------|
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Cursor | `Cursor Settings` → `MCP` → `New MCP Server` |

## Your First Prompt

Enter the following prompt in your MCP client to check if everything is working:

```
What agents ran yesterday?
```

Your MCP client should return a list of your Sequentum agents with their IDs, names, and status.

### Other Useful Prompts

```
Run agent <agent name> now.
Is agent <agent name> still running?
What agents are scheduled to run today?
Download the extracted data from agent <agent name>.
How many records were found the last time <agent name> was run?
What is my current balance?
Schedule agent <agent name> to run every Monday at 9am.
Look at the run log for <agent name> run at 9:22am. What caused the agent to fail?
```

## Tools

<!-- BEGIN AUTO GENERATED TOOLS -->

- **Agent Management** (3 tools)
  - [`list_agents`](docs/tool-reference.md#list_agents)
  - [`get_agent`](docs/tool-reference.md#get_agent)
  - [`search_agents`](docs/tool-reference.md#search_agents)
- **Run Management** (5 tools)
  - [`get_agent_runs`](docs/tool-reference.md#get_agent_runs)
  - [`get_run_status`](docs/tool-reference.md#get_run_status)
  - [`start_agent`](docs/tool-reference.md#start_agent)
  - [`stop_agent`](docs/tool-reference.md#stop_agent)
  - [`kill_agent`](docs/tool-reference.md#kill_agent)
- **File Management** (2 tools)
  - [`get_run_files`](docs/tool-reference.md#get_run_files)
  - [`get_file_download_url`](docs/tool-reference.md#get_file_download_url)
- **Version Management** (2 tools)
  - [`get_agent_versions`](docs/tool-reference.md#get_agent_versions)
  - [`restore_agent_version`](docs/tool-reference.md#restore_agent_version)
- **Schedule Management** (4 tools)
  - [`list_agent_schedules`](docs/tool-reference.md#list_agent_schedules)
  - [`create_agent_schedule`](docs/tool-reference.md#create_agent_schedule)
  - [`delete_agent_schedule`](docs/tool-reference.md#delete_agent_schedule)
  - [`get_scheduled_runs`](docs/tool-reference.md#get_scheduled_runs)
- **Billing & Credits** (3 tools)
  - [`get_credits_balance`](docs/tool-reference.md#get_credits_balance)
  - [`get_spending_summary`](docs/tool-reference.md#get_spending_summary)
  - [`get_credit_history`](docs/tool-reference.md#get_credit_history)
- **Space Management** (5 tools)
  - [`list_spaces`](docs/tool-reference.md#list_spaces)
  - [`get_space`](docs/tool-reference.md#get_space)
  - [`get_space_agents`](docs/tool-reference.md#get_space_agents)
  - [`search_space_by_name`](docs/tool-reference.md#search_space_by_name)
  - [`run_space_agents`](docs/tool-reference.md#run_space_agents)
- **Analytics & Diagnostics** (4 tools)
  - [`get_runs_summary`](docs/tool-reference.md#get_runs_summary)
  - [`get_records_summary`](docs/tool-reference.md#get_records_summary)
  - [`get_run_diagnostics`](docs/tool-reference.md#get_run_diagnostics)
  - [`get_latest_failure`](docs/tool-reference.md#get_latest_failure)

<!-- END AUTO GENERATED TOOLS -->

## Configuration

The Sequentum MCP server supports the following environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SEQUENTUM_API_KEY` | Yes | — | Your Sequentum API key (format: `sk-...`). Get this from the Sequentum Control Center under Settings → API Keys. |
| `SEQUENTUM_API_URL` | No | `https://dashboard.sequentum.com` | The base URL of your Sequentum instance. Override if using a custom deployment. |

Pass them via the `env` property in the JSON configuration:

```json
{
  "mcpServers": {
    "sequentum": {
      "command": "npx",
      "args": ["-y", "sequentum-mcp"],
      "env": {
        "SEQUENTUM_API_KEY": "sk-your-api-key-here"
      }
    }
  }
}
```

To use a custom Sequentum instance, add the `SEQUENTUM_API_URL`:

```json
{
  "mcpServers": {
    "sequentum": {
      "command": "npx",
      "args": ["-y", "sequentum-mcp"],
      "env": {
        "SEQUENTUM_API_KEY": "sk-your-api-key-here",
        "SEQUENTUM_API_URL": "https://your-custom-instance.sequentum.com"
      }
    }
  }
}
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| `SEQUENTUM_API_KEY required` | Add your API key to the `env` section of the MCP config |
| `API Error 401: Unauthorized` | Your API key is invalid or expired. Generate a new one from the Control Center. |
| `API Error 404: Not Found` | The agent, run, or file doesn't exist, or you don't have access to it. |
| `API Error 429: Too Many Requests` | Rate limit exceeded. Wait a moment and try again. |

For more troubleshooting help, see the [Troubleshooting Guide](./docs/troubleshooting.md).

## Links

- [Sequentum Dashboard](https://dashboard.sequentum.com)
- [Sequentum API Documentation](https://dashboard.sequentum.com/api-docs/index.html)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## License

MIT © [Sequentum](https://sequentum.com)
