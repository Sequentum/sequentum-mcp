# stop_agent_build

Title: Stop Agent Build

## Annotations

```json
{
  "title": "Stop Agent Build",
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Abort an in-progress agent building session early. Optional — only needed if you want to cancel before the build completes. Has no effect once the session has already reached a terminal status (completed, ready, error, or cancelled). Any agent already saved to your workspace before the abort remains there — use the standard agents API to delete it if unwanted. Returns { stopped: true, sessionId }. This is the only way to stop a build: a cancelled or timed-out start_agent_build or get_agent_build_status call leaves it running.

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
    "stopped": {
      "type": "boolean"
    },
    "sessionId": {
      "type": "string"
    }
  },
  "required": [
    "stopped",
    "sessionId"
  ]
}
```
