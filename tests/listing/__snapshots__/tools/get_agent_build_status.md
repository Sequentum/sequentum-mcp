# get_agent_build_status

Title: Get Agent Build Status

## Annotations

```json
{
  "title": "Get Agent Build Status",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Poll the status of an agent building session. Returns { status, agentId?, agentName?, error? }. status: 'processing' (keep polling) | 'ready' | 'completed' | 'error' | 'cancelled'. STOP POLLING on: completed, ready, error, or cancelled — the session tears down automatically. The returned agentId is the permanent workspace ID usable with get_agent, run_agent, schedule tools, and every other endpoint that takes an agentId. POLLING CADENCE: honor any user-expressed preference (e.g., 'poll quickly', 'every N seconds'); otherwise use moderate backoff (~5s start, max ~30s between polls).

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "The session ID returned by start_agent_build."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

## outputSchema

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "description": "processing, ready, completed, error or cancelled."
    },
    "agentId": {
      "type": [
        "integer",
        "null"
      ]
    },
    "agentName": {
      "type": [
        "string",
        "null"
      ]
    },
    "agentElapsedSeconds": {
      "type": [
        "number",
        "null"
      ]
    },
    "browserIoSeconds": {
      "type": [
        "number",
        "null"
      ]
    },
    "error": {
      "type": "string",
      "description": "Present only when status is error."
    }
  },
  "required": [
    "status"
  ]
}
```
