# kill_agent

Title: Kill Agent

## Annotations

```json
{
  "title": "Kill Agent",
  "readOnlyHint": false,
  "destructiveHint": true,
  "idempotentHint": false,
  "openWorldHint": false
}
```

## Description

Force-terminate an agent when stop_agent is not working. BEHAVIOR: First call initiates graceful stop (same as stop_agent). Second call forces immediate process termination if still stopping. USE WHEN: stop_agent was called but agent is still running/stopping and not responding. Answers: 'Force kill stuck agent', 'Agent won't stop', 'Terminate unresponsive run'. REQUIRED: agentId and runId. Get runId from start_agent or get_agent_runs. WARNING: This is a destructive operation that can forcefully terminate server processes.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "number",
      "description": "The unique ID of the agent."
    },
    "runId": {
      "type": "number",
      "description": "The run ID to kill. Get from start_agent or get_agent_runs."
    }
  },
  "required": [
    "agentId",
    "runId"
  ]
}
```

## outputSchema

(none)
