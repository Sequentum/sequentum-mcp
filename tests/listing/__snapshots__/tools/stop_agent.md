# stop_agent

Title: Stop Agent

## Annotations

```json
{
  "title": "Stop Agent",
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Stop a running agent execution immediately. Use to cancel runs that are taking too long or no longer needed. Answers: 'Stop that run', 'Cancel the scraper', 'Abort agent X', 'Kill the running job'. REQUIRED: You need both agentId and runId. Get runId from start_agent response or get_agent_runs.

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
      "description": "The run ID to stop. Get this from start_agent response or get_agent_runs."
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
