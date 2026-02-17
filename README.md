# Sequentum MCP

[![npm version](https://img.shields.io/npm/v/sequentum-mcp.svg)](https://www.npmjs.com/package/sequentum-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The [Sequentum MCP Server](https://mcp.sequentum.com) connects your AI coding assistant to Sequentum using the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction), giving your AI tools direct access to web scraping agents, run management, scheduling, analytics, and more. Sequentum hosts and manages a remote MCP server with OAuth authentication, so there's nothing to install.

## [Tool Reference](./docs/tool-reference.md) | [Troubleshooting](./docs/troubleshooting.md) | [Changelog](./CHANGELOG.md)

## Key Features

- **Agent management**: List, search, and get detailed information about your web scraping agents.
- **Run automation**: Start, stop, and monitor agent executions with real-time status tracking.
- **Schedule management**: Create and manage automated schedules using cron expressions.
- **Analytics & diagnostics**: Get run statistics, error analysis, and suggested fixes for failures.
- **Space organization**: Manage agent workspaces and run batch operations across spaces.

## Disclaimers

`sequentum-mcp` exposes your Sequentum account data to MCP clients, allowing them to
view, run, and manage your web scraping agents. Keep your credentials secure and avoid
sharing sensitive information that you don't want accessible to MCP clients.

## Getting Started

Add the Sequentum MCP server to your client with this configuration:

```json
{
  "mcpServers": {
    "sequentum": {
      "url": "https://mcp.sequentum.com/mcp"
    }
  }
}
```

**Most clients support the OAuth configuration.** When you first connect, you'll be prompted to:

1. Log in with your Sequentum account
2. Accept the OAuth authorization
3. Grant access to the necessary permissions

Once authenticated, all tools become available in your client. See the [full tool list](#available-tools) below.

## Set Up Your Client

Select your client below for specific setup instructions. All clients use the remote OAuth server at `https://mcp.sequentum.com/mcp` unless noted otherwise.

### Cursor

Go to `Cursor` > `Settings` > `Cursor Settings` > `MCP` and follow the prompts to add the Sequentum MCP server. Cursor 1.0+ includes native OAuth and Streamable HTTP support.

You can also add the server manually by editing your `mcp.json` file using the [configuration above](#getting-started).

### Claude Desktop

Open developer tools via `Settings` > `Developer` > `Edit Config`, then add the [configuration above](#getting-started) to your config file. Restart Claude Desktop to pick up the changes.

| Platform | Config File Location |
|----------|---------------------|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

### Claude Code

Run the following command in your terminal:

```bash
claude mcp add --transport http sequentum https://mcp.sequentum.com/mcp
```

Then launch Claude Code with `claude`. You'll be prompted to authenticate with OAuth to Sequentum.

### VS Code / GitHub Copilot

Open the Command Palette with `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) and select `MCP: Add Server`. Enter the Sequentum MCP server URL:

```
https://mcp.sequentum.com/mcp
```

### Windsurf

Configure via the `Configure MCP` option in Cascade (`Cmd+L` or `Ctrl+L`). Add the Sequentum MCP server URL:

```
https://mcp.sequentum.com/mcp
```

### Other Clients

The Sequentum MCP Server follows standard MCP protocols and works with any client that supports:

- **OAuth authentication** (recommended)
- **Streamable HTTP** with automatic SSE fallback

Use the server URL `https://mcp.sequentum.com/mcp` in your client's MCP configuration.

The server supports [Client ID Metadata Documents (CIMD)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00) as the preferred client identification method, with [Dynamic Client Registration (RFC 7591)](https://datatracker.ietf.org/doc/html/rfc7591) as a fallback. MCP clients that support CIMD (such as Cursor) can use their own URL as a `client_id` without any prior registration.

## Alternative: Local Setup (API Key)

If you prefer to run the MCP server locally (e.g., for custom deployments, offline use, or CI/CD pipelines), you can use `npx` with an API key instead of the hosted OAuth server.

**Requirements for local setup:**

- [Node.js](https://nodejs.org/) v18 or higher
- [npm](https://www.npmjs.com/)
- Sequentum API key

Add the following config to your MCP client:

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

### Get Your API Key

1. Log in to the [Sequentum Control Center](https://dashboard.sequentum.com)
2. Go to **Settings** > **API Keys**
3. Click **Create API Key** and copy the generated key (starts with `sk-`)

### Custom Sequentum Instance

To connect to a custom Sequentum deployment, add the `SEQUENTUM_API_URL` environment variable:

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

### Local Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SEQUENTUM_API_KEY` | Yes | -- | Your Sequentum API key (format: `sk-...`). Get this from the Sequentum Control Center under Settings > API Keys. |
| `SEQUENTUM_API_URL` | No | `https://dashboard.sequentum.com` | The base URL of your Sequentum instance. Override if using a custom deployment. |

## Example Usage

Once connected, try these prompts to start using Sequentum context in your AI assistant:

```
What agents ran yesterday?
Run agent <agent name> now.
Is agent <agent name> still running?
What agents are scheduled to run today?
Download the extracted data from agent <agent name>.
How many records were found the last time <agent name> was run?
What is my current balance?
Schedule agent <agent name> to run every Monday at 9am.
Look at the run log for <agent name> run at 9:22am. What caused the agent to fail?
```

## Available Tools

The Sequentum MCP Server provides tools across 8 categories for interacting with the Sequentum platform. See the [Tool Reference](./docs/tool-reference.md) for detailed documentation.

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

## Troubleshooting

| Error | Solution |
|-------|----------|
| OAuth login not opening | Ensure your client supports OAuth and Streamable HTTP. Try restarting the client. |
| Connection refused | Verify the URL is `https://mcp.sequentum.com/mcp` and check your network connection. |
| `SEQUENTUM_API_KEY required` | Local mode only. Add your API key to the `env` section of the MCP config. |
| `API Error 401: Unauthorized` | Your API key or OAuth token is invalid or expired. Re-authenticate or generate a new key. |
| `API Error 404: Not Found` | The agent, run, or file doesn't exist, or you don't have access to it. |
| `API Error 429: Too Many Requests` | Rate limit exceeded. Wait a moment and try again. |

For more troubleshooting help, see the [Troubleshooting Guide](./docs/troubleshooting.md).

## Links

- [Sequentum MCP Server](https://mcp.sequentum.com)
- [Sequentum Dashboard](https://dashboard.sequentum.com)
- [Sequentum API Documentation](https://dashboard.sequentum.com/api-docs/index.html)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## License

MIT © [Sequentum](https://sequentum.com)
