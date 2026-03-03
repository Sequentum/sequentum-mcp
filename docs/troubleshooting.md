# Troubleshooting Guide

This guide covers common issues and their solutions when using the Sequentum MCP server. The recommended setup is the remote server at `https://mcp.sequentum.com/mcp` using OAuth authentication. A local setup via `npx` is also available as an alternative.

## Table of Contents

- [Remote Connection Issues (OAuth)](#remote-connection-issues-oauth)
- [Local Connection Issues (API Key)](#local-connection-issues-api-key)
- [Authentication Errors](#authentication-errors)
- [API Errors](#api-errors)
- [Agent Execution Issues](#agent-execution-issues)
- [MCP Client Issues](#mcp-client-issues)
- [Getting Help](#getting-help)

---

## Remote Connection Issues (OAuth)

These issues apply when connecting to the hosted Sequentum MCP server at `https://mcp.sequentum.com/mcp`.

### OAuth login not opening

**Cause:** Your MCP client may not support OAuth authentication or Streamable HTTP transport.

**Solutions:**

1. **Ensure your client supports OAuth** -- Cursor 1.0+, Claude Desktop, Claude Code, and VS Code with Copilot all support OAuth natively
2. **Restart the MCP client** after adding the server configuration
3. **Check for browser pop-up blockers** that may prevent the OAuth window from opening
4. **Try a different browser** as your default if the OAuth page fails to load

---

### OAuth authentication failed or token expired

**Error:**
```
Error: OAuth authentication failed
```

**Cause:** Your OAuth session has expired or the authorization was denied.

**Solutions:**

1. **Re-authenticate:** Log out of the MCP integration in your client and log back in
2. **Check your Sequentum account** is active and has the necessary permissions
3. **If you've joined a new Sequentum organization**, log out and log back in to refresh access

---

### Connection refused to mcp.sequentum.com

**Error:**
```
Error: ECONNREFUSED or ETIMEDOUT connecting to mcp.sequentum.com
```

**Cause:** Unable to reach the hosted Sequentum MCP server.

**Solutions:**

1. **Check your internet connection**
2. **Verify the MCP server URL** is correct: `https://mcp.sequentum.com/mcp`
3. **Test the health endpoint** -- visit `https://mcp.sequentum.com/health` in your browser. A healthy server returns an `OK` response. If this fails, the server may be temporarily unavailable.
4. **Check firewall/proxy settings** that might be blocking outbound HTTPS connections

---

## Local Connection Issues (API Key)

These issues apply when running the MCP server locally via `npx sequentum-mcp`.

### SEQUENTUM_API_KEY required

**Error:**
```
Error: SEQUENTUM_API_KEY environment variable is required
```

**Cause:** The API key is not configured in your MCP client settings. This error only occurs in local mode (npx).

**Solution:**

1. Log in to the [Sequentum Control Center](https://dashboard.sequentum.com)
2. Go to **Settings** > **API Keys**
3. Click **Create API Key** and copy the generated key
4. Add it to your MCP client configuration in the `env` section:

```json
{
  "mcpServers": {
    "sequentum": {
      "command": "npx",
      "args": ["-y", "sequentum-mcp"],
      "env": {
        "SEQUENTUM_API_KEY": "sk-your-api-key"
      }
    }
  }
}
```

> **Tip:** If you don't need to run locally, consider using the [remote OAuth setup](../README.md#getting-started) instead -- it doesn't require an API key.

---

### Using a custom Sequentum instance

By default, the local MCP server connects to `https://dashboard.sequentum.com`. If you're using a custom Sequentum deployment, set the `SEQUENTUM_API_URL` environment variable:

```json
{
  "mcpServers": {
    "sequentum": {
      "command": "npx",
      "args": ["-y", "sequentum-mcp"],
      "env": {
        "SEQUENTUM_API_KEY": "sk-your-api-key",
        "SEQUENTUM_API_URL": "https://your-custom-instance.sequentum.com"
      }
    }
  }
}
```

---

### Connection timeout or network errors

**Error:**
```
Error: ECONNREFUSED or ETIMEDOUT
```

**Cause:** Unable to reach the Sequentum API server.

**Solutions:**

1. **Check your internet connection**
2. **Verify the API URL** is correct (default: `https://dashboard.sequentum.com`)
3. **Check if Sequentum is down** by visiting the dashboard directly
4. **Check firewall/proxy settings** that might be blocking the connection

---

## Authentication Errors

These errors apply to both remote (OAuth) and local (API key) setups.

### API Error 401: Unauthorized

**Error:**
```
Error: API Error 401: Unauthorized
```

**Cause:** Your credentials are invalid, expired, or have been revoked.

**Solutions:**

**For remote (OAuth) users:**
1. **Re-authenticate** by logging out of the MCP integration and logging back in
2. **Check your Sequentum account** is still active

**For local (API key) users:**
1. **Generate a new API key:**
   - Log in to the [Sequentum Control Center](https://dashboard.sequentum.com)
   - Go to **Settings** > **API Keys**
   - Create a new API key and update your configuration
2. **Check for typos** in your API key (it should start with `sk-`)
3. **Verify the key has not been revoked** in the Control Center

---

### API Error 403: Forbidden

**Error:**
```
Error: API Error 403: Forbidden
```

**Cause:** Your account doesn't have permission to perform the requested action.

**Solutions:**

1. **Check your account permissions** in the Sequentum Control Center
2. **Verify you have access** to the specific agent, space, or resource
3. **Contact your organization admin** to request additional permissions

---

## API Errors

### API Error 404: Not Found

**Error:**
```
Error: API Error 404: Not Found
```

**Cause:** The requested resource (agent, run, file, etc.) doesn't exist or you don't have access.

**Solutions:**

1. **Verify the ID is correct** -- use `list_agents` to find valid agent IDs
2. **Check if the resource was deleted**
3. **Verify you have access** to the resource in the Control Center

---

### API Error 429: Too Many Requests

**Error:**
```
Error: API Error 429: Too Many Requests
```

**Cause:** You've exceeded the API rate limit (100 requests/minute).

**Solutions:**

1. **Wait a moment** and try again
2. **Reduce request frequency** if running automated scripts
3. **Use pagination** with `pageIndex` and `recordsPerPage` to reduce data per request

---

### API Error 500: Internal Server Error

**Error:**
```
Error: API Error 500: Internal Server Error
```

**Cause:** An error occurred on the Sequentum server.

**Solutions:**

1. **Wait and retry** -- the issue may be temporary
2. **Check Sequentum status** for any ongoing incidents
3. **Try a simpler request** to isolate the issue
4. **Contact Sequentum support** if the issue persists

---

## Agent Execution Issues

### Agent fails to start

**Error:**
```
Error: Failed to start agent
```

**Possible Causes:**

1. **No available execution slots** -- too many agents running
2. **Agent is disabled** or archived
3. **Invalid input parameters**

**Solutions:**

1. **Check running agents** with `get_runs_summary` to see current activity
2. **Verify agent status** with `get_agent`
3. **Validate input parameters** match what the agent expects

---

### Run stuck in "Starting" or "Queuing"

**Cause:** Agent is waiting for resources or execution slot.

**Solutions:**

1. **Wait** -- high-traffic periods may cause delays
2. **Check credits balance** with `get_credits_balance`
3. **Stop other running agents** if you've hit your concurrency limit

---

### Agent completes but no files generated

**Cause:** Agent didn't extract any data, or export is misconfigured.

**Solutions:**

1. **Check run details** with `get_run_status` for `recordsExtracted` count
2. **Review agent configuration** in the Control Center
3. **Check for errors** with `get_run_diagnostics`

---

### Synchronous run times out

**Error:**
```
Error: Timeout waiting for agent to complete
```

**Cause:** Agent took longer than the specified timeout (default: 60 seconds).

**Solutions:**

1. **Increase the timeout** value (up to 3600 seconds max)
2. **Use async mode** instead and poll with `get_run_status`
3. **Optimize the agent** to run faster

Example with increased timeout:
```
Run agent 123 synchronously with a 5 minute timeout
```

---

## MCP Client Issues

### Tools not appearing in MCP client

**Cause:** Server failed to connect or configuration is incorrect.

**Solutions for remote (OAuth) setup:**

1. **Verify the server URL** is `https://mcp.sequentum.com/mcp`
2. **Check that OAuth authentication completed** -- you should have been prompted to log in
3. **Restart the MCP client** after adding or changing the server configuration
4. **Check the MCP client logs** for error messages

**Solutions for local (API key) setup:**

1. **Check the MCP client logs** for error messages
2. **Verify your JSON configuration** is valid (no trailing commas, proper quotes)
3. **Restart the MCP client** after changing configuration
4. **Test manually:** Run `npx sequentum-mcp` in terminal to see if it starts

---

### MCP server not starting (local mode)

**Cause:** Node.js not installed or version too old. This only applies to the local npx setup.

**Solutions:**

1. **Install Node.js 18+** from [nodejs.org](https://nodejs.org/)
2. **Verify installation:** `node --version`
3. **Check npm is working:** `npm --version`

> **Tip:** The remote OAuth setup at `https://mcp.sequentum.com/mcp` does not require Node.js.

---

### "Unknown tool" error

**Error:**
```
Error: Unknown tool: tool_name
```

**Cause:** You're trying to call a tool that doesn't exist.

**Solution:** Check the [Tool Reference](./tool-reference.md) for the correct tool names.

---

## Getting Help

If you're still experiencing issues:

1. **Test the health endpoint** -- visit `https://mcp.sequentum.com/health` to verify the remote server is up
2. **Check the logs** -- for local mode, the MCP server outputs debug information to stderr; for remote mode, check your MCP client's logs
3. **Review the documentation:**
   - [Tool Reference](./tool-reference.md)
   - [Sequentum API Documentation](https://dashboard.sequentum.com/api-docs/index.html)
4. **Contact Sequentum Support:**
   - [Sequentum Dashboard](https://dashboard.sequentum.com) -- use the Help button
   - Email: support@sequentum.com

### Reporting Bugs

When reporting issues, please include:

1. **Error message** (full text)
2. **Connection method** -- remote (OAuth) or local (API key)
3. **MCP client** you're using (Cursor, Claude Desktop, VS Code, etc.)
4. **Operating system** and version
5. **Node.js version** (`node --version`) -- if using local mode
6. **Steps to reproduce** the issue
