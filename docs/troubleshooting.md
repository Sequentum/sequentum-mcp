# Troubleshooting Guide

This guide covers common issues and their solutions when using the Sequentum MCP server.

## Table of Contents

- [Connection Issues](#connection-issues)
- [Authentication Errors](#authentication-errors)
- [API Errors](#api-errors)
- [Agent Execution Issues](#agent-execution-issues)
- [MCP Client Issues](#mcp-client-issues)
- [Getting Help](#getting-help)

---

## Connection Issues

### SEQUENTUM_API_KEY required

**Error:**
```
Error: SEQUENTUM_API_KEY environment variable is required
```

**Cause:** The API key is not configured in your MCP client settings.

**Solution:**

1. Log in to the [Sequentum Control Center](https://dashboard.sequentum.com)
2. Go to **Settings** → **API Keys**
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

---

### Using a custom Sequentum instance

By default, the MCP server connects to `https://dashboard.sequentum.com`. If you're using a custom Sequentum deployment, set the `SEQUENTUM_API_URL` environment variable:

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
2. **Verify the API URL** is correct (e.g., `https://dashboard.sequentum.com`)
3. **Check if Sequentum is down** by visiting the dashboard directly
4. **Check firewall/proxy settings** that might be blocking the connection

---

## Authentication Errors

### API Error 401: Unauthorized

**Error:**
```
Error: API Error 401: Unauthorized
```

**Cause:** Your API key is invalid, expired, or has been revoked.

**Solutions:**

1. **Generate a new API key:**
   - Log in to the [Sequentum Control Center](https://dashboard.sequentum.com)
   - Go to **Settings** → **API Keys**
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

1. **Verify the ID is correct** - use `list_agents` to find valid agent IDs
2. **Check if the resource was deleted** 
3. **Verify you have access** to the resource in the Control Center

---

### API Error 429: Too Many Requests

**Error:**
```
Error: API Error 429: Too Many Requests
```

**Cause:** You've exceeded the API rate limit (100 requests/minute per API key).

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

1. **Wait and retry** - the issue may be temporary
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

1. **No available execution slots** - too many agents running
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

1. **Wait** - high-traffic periods may cause delays
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

### MCP server not starting

**Cause:** Node.js not installed or version too old.

**Solutions:**

1. **Install Node.js 18+** from [nodejs.org](https://nodejs.org/)
2. **Verify installation:** `node --version`
3. **Check npm is working:** `npm --version`

---

### Tools not appearing in MCP client

**Cause:** Server failed to start or configuration is incorrect.

**Solutions:**

1. **Check the MCP client logs** for error messages
2. **Verify your JSON configuration** is valid (no trailing commas, proper quotes)
3. **Restart the MCP client** after changing configuration
4. **Test manually:** Run `npx sequentum-mcp` in terminal to see if it starts

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

1. **Check the logs** - the MCP server outputs debug information to stderr
2. **Review the documentation:**
   - [Tool Reference](./tool-reference.md)
   - [Sequentum API Documentation](https://dashboard.sequentum.com/api-docs/index.html)
3. **Contact Sequentum Support:**
   - [Sequentum Dashboard](https://dashboard.sequentum.com) - use the Help button
   - Email: support@sequentum.com

### Reporting Bugs

When reporting issues, please include:

1. **Error message** (full text)
2. **MCP client** you're using (Claude Desktop, Cursor, etc.)
3. **Operating system** and version
4. **Node.js version** (`node --version`)
5. **Steps to reproduce** the issue
