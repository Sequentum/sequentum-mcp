# Sequentum MCP

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The [Sequentum MCP Server](https://mcp.sequentum.com) connects your AI coding assistant to Sequentum using the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction), giving your AI tools the ability to create web scraping agents, run management, scheduling, analytics, and more. Sequentum hosts and manages a remote MCP server with OAuth authentication, so there's nothing to install.

## [Tool Reference](./docs/tool-reference.md) | [Prompts Reference](./docs/prompts-reference.md) | [Resources Reference](./docs/resources-reference.md) | [Troubleshooting](./docs/troubleshooting.md) | [Changelog](./CHANGELOG.md)

## Key Features

- **Agent management**: Build, list, search, and get detailed information about your web scraping agents.
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

**Most clients support the OAuth configuration.** Claude Desktop uses a different setup via Custom Connectors — see [Claude Desktop](#claude-desktop) below. For other clients, when you first connect, you'll be prompted to:

1. Log in with your Sequentum account
2. Accept the OAuth authorization
3. Grant access to the necessary permissions

Once authenticated, all tools become available in your client. For client-specific setup details, see [Set Up Your Client](#set-up-your-client) below.

## Set Up Your Client

Select your client below for specific setup instructions. All clients use the remote OAuth server at `https://mcp.sequentum.com/mcp` unless noted otherwise.

### Cursor

Go to `Cursor` > `Settings` > `Cursor Settings` > `MCP` and follow the prompts to add the Sequentum MCP server. Cursor 1.0+ includes native OAuth and Streamable HTTP support.

You can also add the server manually by editing your `mcp.json` file using the [configuration above](#getting-started).

### Claude Desktop

> **Note:** Custom connectors are currently in beta. Free plan users are limited to one custom connector.

Claude Desktop connects to remote MCP servers using **Custom Connectors** rather than the config file. The setup differs based on your plan type. For full details, see [Claude's custom connectors documentation](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

**Free, Pro, and Max plans:**

1. Navigate to **Settings** > **Connectors**.
2. Click **"Add custom connector"** at the bottom of the section.
3. Enter the Sequentum MCP server URL: `https://mcp.sequentum.com/mcp`
4. Click **"Add"** to finish.

**Team and Enterprise plans:**

An Owner or Primary Owner must first add the connector to the organization:

1. Navigate to **Organization settings** > **Connectors**.
2. Click **"Add custom connector"** at the bottom of the section.
3. Enter the Sequentum MCP server URL: `https://mcp.sequentum.com/mcp`
4. Click **"Add"** to finish.

Then, each team member connects individually:

1. Navigate to **Settings** > **Connectors**.
2. Find the Sequentum connector in the list (it will have a "Custom" label).
3. Click **"Connect"** to authenticate.

**Enabling per conversation:**

Once configured, enable the Sequentum connector in individual conversations via the **"+"** button on the lower left of the chat interface, then select **"Connectors"**.

### ChatGPT

> **Note:** While the Sequentum app is pending directory approval, you can connect via Developer Mode. Apps & Connectors → Developer Mode is currently available on **Plus, Pro, Business, Enterprise, and Education** plans (Education is web-only). On Business / Enterprise / Education accounts, only **workspace owners and admins** can access Advanced settings — regular members will not see the option. See [OpenAI's Developer Mode documentation](https://platform.openai.com/docs/developer-mode) for current eligibility.

1. In ChatGPT, go to **Settings** > **Apps & Connectors** > **Advanced settings** and enable **Developer mode**.
2. Navigate to **Settings** > **Apps & Connectors** and click **Create app** (it appears once Developer mode is enabled).
3. Enter the connector name `Sequentum` and URL: `https://mcp.sequentum.com/mcp`
4. Click **Create**. You'll be prompted to sign in with your Sequentum account via OAuth.

Once connected, enable Sequentum in a conversation via the **+** button near the message composer, then select your connector from the list.

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

## Deprecated: stdio and API-key auth

> **Deprecated:** Running the MCP server locally over the **stdio** transport,
> authenticated with `SEQUENTUM_API_KEY`, is deprecated and will be removed in a future
> release. The `sequentum-mcp` npm package is deprecated along with it. Connect to
> `https://mcp.sequentum.com/mcp` over HTTP with OAuth 2.1 instead — see
> [Set Up Your Client](#set-up-your-client).
>
> This does not affect Sequentum API keys themselves, which remain fully supported for
> the [REST API](https://docs.sequentum.com/api-reference/authentication).

The MCP [authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
directs stdio implementations not to use OAuth, and to take credentials from the
environment instead. Moving the server to OAuth 2.1 therefore retires the stdio path
along with it — the two deprecations are one decision, not two.

If you are running this configuration today, it keeps working — on Node 20 or later:

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

The API key is created in the [Sequentum Control Center](https://dashboard.sequentum.com)
under **Settings** > **API Keys**, and `SEQUENTUM_API_URL` overrides the Sequentum
instance it connects to (default `https://dashboard.sequentum.com`).

To migrate, delete that block and follow the setup instructions for your client above.
If you need Sequentum MCP somewhere that cannot reach `mcp.sequentum.com`, contact
support — there is no supported self-hosted deployment.

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
Which agents cost the most this month?
Schedule agent <agent name> to run every Monday at 9am.
Look at the run log for <agent name> run at 9:22am. What caused the agent to fail?
Show me the cost breakdown for agent <agent name> in January.
What were the most expensive runs for agent <agent name>?
How much did I spend on server time vs exports last week?
```

## Available Tools

The Sequentum MCP Server provides 39 tools across 9 categories for interacting with the Sequentum platform. See the [Tool Reference](./docs/tool-reference.md) for detailed documentation.

<!-- BEGIN AUTO GENERATED TOOLS -->

- **Agent Management** (3 tools)
  - [`list_agents`](docs/tool-reference.md#list_agents)
  - [`get_agent`](docs/tool-reference.md#get_agent)
  - [`search_agents`](docs/tool-reference.md#search_agents)
- **Run Management** (6 tools)
  - [`get_agent_runs`](docs/tool-reference.md#get_agent_runs)
  - [`get_run_status`](docs/tool-reference.md#get_run_status)
  - [`start_agent`](docs/tool-reference.md#start_agent)
  - [`stop_agent`](docs/tool-reference.md#stop_agent)
  - [`kill_agent`](docs/tool-reference.md#kill_agent)
  - [`delete_run`](docs/tool-reference.md#delete_run)
- **File Management** (2 tools)
  - [`get_run_files`](docs/tool-reference.md#get_run_files)
  - [`get_file_download_url`](docs/tool-reference.md#get_file_download_url)
- **Version Management** (2 tools)
  - [`get_agent_versions`](docs/tool-reference.md#get_agent_versions)
  - [`restore_agent_version`](docs/tool-reference.md#restore_agent_version)
- **Schedule Management** (8 tools)
  - [`list_agent_schedules`](docs/tool-reference.md#list_agent_schedules)
  - [`get_agent_schedule`](docs/tool-reference.md#get_agent_schedule)
  - [`create_agent_schedule`](docs/tool-reference.md#create_agent_schedule)
  - [`update_agent_schedule`](docs/tool-reference.md#update_agent_schedule)
  - [`enable_agent_schedule`](docs/tool-reference.md#enable_agent_schedule)
  - [`disable_agent_schedule`](docs/tool-reference.md#disable_agent_schedule)
  - [`delete_agent_schedule`](docs/tool-reference.md#delete_agent_schedule)
  - [`get_scheduled_runs`](docs/tool-reference.md#get_scheduled_runs)
- **Billing & Credits** (6 tools)
  - [`get_credits_balance`](docs/tool-reference.md#get_credits_balance)
  - [`get_spending_summary`](docs/tool-reference.md#get_spending_summary)
  - [`get_credit_history`](docs/tool-reference.md#get_credit_history)
  - [`get_agents_usage`](docs/tool-reference.md#get_agents_usage)
  - [`get_agent_cost_breakdown`](docs/tool-reference.md#get_agent_cost_breakdown)
  - [`get_agent_runs_cost`](docs/tool-reference.md#get_agent_runs_cost)
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
- **Agent Builder** (3 tools)
  - [`start_agent_build`](docs/tool-reference.md#start_agent_build)
  - [`get_agent_build_status`](docs/tool-reference.md#get_agent_build_status)
  - [`stop_agent_build`](docs/tool-reference.md#stop_agent_build)

<!-- END AUTO GENERATED TOOLS -->

## Available Prompts

The server includes 9 reusable prompt templates that guide the AI through common multi-step workflows. See the [Prompts Reference](./docs/prompts-reference.md) for detailed documentation.

<!-- BEGIN AUTO GENERATED PROMPTS -->

- **Debugging & Diagnostics**
  - [`debug-agent`](docs/prompts-reference.md#debug-agent) -- Diagnose why an agent is failing
  - [`compare-runs`](docs/prompts-reference.md#compare-runs) -- Compare last successful vs failed run
- **Health & Monitoring**
  - [`agent-health-check`](docs/prompts-reference.md#agent-health-check) -- Comprehensive health overview for an agent
  - [`daily-operations-report`](docs/prompts-reference.md#daily-operations-report) -- Daily ops report across all agents
  - [`space-overview`](docs/prompts-reference.md#space-overview) -- Overview of all agents in a space
- **Execution**
  - [`run-and-monitor`](docs/prompts-reference.md#run-and-monitor) -- Start an agent and monitor until completion
  - [`schedule-agent`](docs/prompts-reference.md#schedule-agent) -- Walk through creating a schedule
- **Billing & Costs**
  - [`spending-report`](docs/prompts-reference.md#spending-report) -- Spending and credits report
  - [`cost-analysis`](docs/prompts-reference.md#cost-analysis) -- Analyze costs across agents
- **Agent Building**
  - [`build-agent-from-prompt`](docs/prompts-reference.md#build-agent-from-prompt) -- Build a new agent from a natural language description
  - [`inspect-agent-draft`](docs/prompts-reference.md#inspect-agent-draft) -- Inspect a build session and decide whether to save or discard

<!-- END AUTO GENERATED PROMPTS -->

## Available Resources

The server exposes 18 read-only resources (7 static + 11 templates) that AI clients can browse and pull into context. See the [Resources Reference](./docs/resources-reference.md) for detailed documentation.

<!-- BEGIN AUTO GENERATED RESOURCES -->

- **Static Resources** (7)
  - [`sequentum://agents`](docs/resources-reference.md#agent-list) -- First page of all agents
  - [`sequentum://spaces`](docs/resources-reference.md#spaces) -- All accessible spaces
  - [`sequentum://billing/balance`](docs/resources-reference.md#credits-balance) -- Current credits balance
  - [`sequentum://billing/spending`](docs/resources-reference.md#monthly-spending) -- Monthly spending summary
  - [`sequentum://billing/agents-usage`](docs/resources-reference.md#agent-costs-current-month) -- Top agents by cost
  - [`sequentum://analytics/runs`](docs/resources-reference.md#recent-runs-summary) -- Runs in the last 24 hours
  - [`sequentum://analytics/upcoming-schedules`](docs/resources-reference.md#upcoming-schedules) -- Scheduled runs for next 7 days
- **Resource Templates** (11)
  - [`sequentum://agents/{agentId}`](docs/resources-reference.md#agent-detail) -- Agent detail with configuration
  - [`sequentum://agents/{agentId}/versions`](docs/resources-reference.md#agent-versions) -- Agent version history
  - [`sequentum://agents/{agentId}/schedules`](docs/resources-reference.md#agent-schedules) -- Agent scheduled tasks
  - [`sequentum://agents/{agentId}/cost-breakdown`](docs/resources-reference.md#agent-cost-breakdown) -- Agent cost by usage type
  - [`sequentum://agents/{agentId}/runs`](docs/resources-reference.md#agent-runs) -- Agent run history
  - [`sequentum://agents/{agentId}/runs/{runId}`](docs/resources-reference.md#run-status) -- Specific run status
  - [`sequentum://agents/{agentId}/runs/{runId}/files`](docs/resources-reference.md#run-files) -- Run output files
  - [`sequentum://agents/{agentId}/runs/{runId}/diagnostics`](docs/resources-reference.md#run-diagnostics) -- Run error diagnostics
  - [`sequentum://agents/{agentId}/latest-failure`](docs/resources-reference.md#latest-failure) -- Most recent failure diagnostics
  - [`sequentum://spaces/{spaceId}`](docs/resources-reference.md#space-detail) -- Space details
  - [`sequentum://spaces/{spaceId}/agents`](docs/resources-reference.md#space-agents) -- Agents in a space

<!-- END AUTO GENERATED RESOURCES -->

## Troubleshooting

| Error | Solution |
|-------|----------|
| OAuth login not opening | Ensure your client supports OAuth and Streamable HTTP. Try restarting the client. For Claude Desktop, use [Custom Connectors](#claude-desktop) instead of the config file. |
| Connection refused | Verify the URL is `https://mcp.sequentum.com/mcp` and check your network connection. |
| `SEQUENTUM_API_KEY required` | [Deprecated](#deprecated-stdio-and-api-key-auth) local stdio mode only. Add your API key to the `env` section of the MCP config, or migrate to the hosted server. |
| `API Error 401: Unauthorized` | Your API key or OAuth token is invalid or expired. Re-authenticate or generate a new key. |
| `API Error 404: Not Found` | The agent, run, or file doesn't exist, or you don't have access to it. |
| `API Error 429: Too Many Requests` | Rate limit exceeded. Wait a moment and try again. |

For more troubleshooting help, see the [Troubleshooting Guide](./docs/troubleshooting.md).

## HTTP Mode Configuration

The hosted server at `mcp.sequentum.com` runs the Streamable HTTP transport
(`TRANSPORT_MODE=http`) behind its own deployment configuration. The following
environment variables tune caching, rate limiting, and proxy trust for that transport;
they have no effect in the deprecated stdio mode. They are documented for readers of
this source — there is no supported self-hosted deployment, and no container image is
published.

**HTTP mode is stateless as of 2.0.0.** There is no `Mcp-Session-Id` header and no
per-client session state on the server: every request is handled independently by a
fresh MCP server instance. `GET /mcp` no longer opens an SSE stream — it now returns
`405 Method Not Allowed` (or `401` first if the request is unauthenticated). `DELETE
/mcp` is a no-op that always answers `200`, since there is no session left to tear
down. `MAX_SESSIONS` is no longer read.

| Variable | Default | Description |
|----------|---------|-------------|
| `TRANSPORT_MODE` | `stdio` | Set to `http` to run the Streamable HTTP transport. The `stdio` default is [deprecated](#deprecated-stdio-and-api-key-auth) and will be removed in a future release; the hosted server sets `http`. |
| `PORT` | `3000` | HTTP server port. |
| `SEQUENTUM_API_URL` | `https://dashboard.sequentum.com` | Base URL of the Sequentum API this server proxies to. |
| `SEQUENTUM_OAUTH_ISSUER` | Value of `SEQUENTUM_API_URL` | This deployment's OAuth issuer identifier, advertised in `/.well-known/oauth-protected-resource`. Must be an absolute `https` URL with no query, fragment or userinfo, and must match the authorization server's `issuer` exactly. Set it only when the API base URL and the public OAuth issuer differ; a malformed value refuses to start. |
| `HOST` | `0.0.0.0` | HTTP server bind address. |
| `LIST_CACHE_TTL_MS` | `3600000` (1 hour) | Freshness hint (`ttlMs`) attached to cacheable list-shaped results (`tools/list`, `prompts/list`, `resources/list`, `resources/templates/list`, `server/discover`). Must be a non-negative integer string; a malformed value fails fast at startup instead of being silently truncated. |
| `MCP_RATE_LIMIT_WINDOW_MS` | `60000` (1 minute) | Rate-limit window applied to the `/mcp` endpoint. |
| `MCP_RATE_LIMIT_MAX` | `100` | Maximum `/mcp` requests per window, per process, per IP. See "Rate limiting across replicas" below before scaling horizontally. |
| `TRUST_PROXY` | `true` | Passed to Express's `trust proxy` setting. Accepts `true`, `false`, a hop count (e.g. `1`), or a comma-separated CIDR/IP allowlist. See "TRUST_PROXY and rate-limit evasion" below — the default has a known weakness. |
| `REQUIRE_AUTH` | `true` | Set to `false` to bypass the OAuth Bearer-token requirement on `/mcp`. For local testing only: the connection succeeds, but tools still fail without a valid backend token. |

### Rate limiting across replicas

The rate limiter is per-process and keyed on `req.ip`; it holds no state shared across
replicas. With the stateless transport there is no session affinity, so a given
client's requests are not pinned to one replica — in a horizontally scaled deployment
of N replicas behind a load balancer, the effective cluster-wide ceiling becomes `N ×
MCP_RATE_LIMIT_MAX` per window, not `MCP_RATE_LIMIT_MAX`. To hold a specific global
rate, divide `MCP_RATE_LIMIT_MAX` by your replica count.

### TRUST_PROXY and rate-limit evasion

With the default `TRUST_PROXY=true`, Express trusts every proxy hop and resolves
`req.ip` from the client-supplied, leftmost entry of the `X-Forwarded-For` header.
Because the rate limiter keys on `req.ip`, a client that simply rotates that header
value can evade rate limiting entirely. Running behind a reverse proxy does not fix
this by itself: tunnels such as cloudflared and ngrok **append** to `X-Forwarded-For`
rather than overwrite it, so the attacker-controlled leftmost entry survives unless
`TRUST_PROXY` is configured correctly.

The remediation is to set `TRUST_PROXY` to the exact number of trusted reverse-proxy
hops in front of the server (e.g. `1`), or to a comma-separated CIDR/IP allowlist of
your trusted proxies, so Express derives `req.ip` from the correct hop instead of
trusting a client-supplied header. This repository does not know your deployment
topology, so it deliberately does not choose a safer default for you.

**Severity:** this is an abuse/DoS-protection bypass, not an authentication or data
exposure issue — no account data is exposed, and no tool call succeeds that would
otherwise be rejected. It only lets a client avoid being rate-limited.

## CORS Origin Allowlist

When the MCP server is accessed from a browser (e.g. the Claude web app or the ChatGPT connector), it checks the `Origin` header against an allowlist.  By default the following origins are permitted:

- `https://claude.ai`, `https://claude.com`, and all subdomains (e.g. `team.claude.ai`)
- `https://chatgpt.com`, `https://platform.openai.com`, and all subdomains under `chatgpt.com` (e.g. `connector.chatgpt.com`)
- `https://dashboard.sequentum.com`
- `https://mcp.sequentum.com`
- `http://localhost:<port>`, `http://127.0.0.1:<port>`, and `http://[::1]:<port>` when `DEBUG=1`

To add your own origins (e.g. an internal dashboard), set the `ALLOWED_ORIGINS` environment variable to a comma-separated list of exact origins:

```
ALLOWED_ORIGINS="https://my-dashboard.example.com,https://other.example.com"
```

These origins are **appended** to the defaults — Claude, ChatGPT, and Sequentum access is preserved.  Wildcards and regular expressions are not supported via the env var; if you need a subdomain wildcard, add a `RegExp` entry directly in `src/server/cors.ts`.

> **Note:** `Origin` matching is case-sensitive and does not include a path or query string.  Native MCP clients (Cursor, Claude Desktop, Claude Code) send no `Origin` header and are not affected by this allowlist.

## Privacy Policy

The Sequentum MCP Server accesses your Sequentum account data — including agent metadata, run history, scheduled tasks, billing information, and output files — solely to fulfill the requests you make through your AI assistant. By default, the MCP server acts as an authenticated proxy between your MCP client and the Sequentum API: request data is forwarded to the API and responses are returned to your client without being persisted or shared with third parties.

Operators may enable verbose request logging via the `DEBUG=1` environment variable for troubleshooting. In that mode the server redacts `Authorization`, `Cookie`, and `x-api-key` headers, but writes request bodies (which may include tool arguments) to stderr. The hosted server at `mcp.sequentum.com` does not run with `DEBUG=1`.

For the full Sequentum privacy policy, see [https://www.sequentum.com/privacy-policy](https://www.sequentum.com/privacy-policy).

## Links

- [Sequentum MCP Server](https://mcp.sequentum.com)
- [Sequentum Dashboard](https://dashboard.sequentum.com)
- [Sequentum API Documentation](https://dashboard.sequentum.com/api-docs/index.html)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## License

MIT © [Sequentum](https://sequentum.com)
