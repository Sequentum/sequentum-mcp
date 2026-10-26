# get_latest_failure

Title: Get Latest Failure

## Annotations

```json
{
  "title": "Get Latest Failure",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get diagnostics for the most recent failed run of an agent. Includes error analysis and suggested fixes. Answers: 'Why did my agent fail?', 'What went wrong?', 'Debug agent X', 'Show the last error'. Returns: errorMessage, possibleCauses, suggestedActions, run timing and stats. USE THIS instead of get_run_diagnostics when user asks about failure without specifying a run ID. SHORTCUT: This is faster than calling get_agent_runs + filtering for Failed + get_run_diagnostics.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "number",
      "description": "The unique ID of the agent. Get this from list_agents, search_agents, or get_agent_build_status (when building a new agent)."
    }
  },
  "required": [
    "agentId"
  ]
}
```

## outputSchema

```json
{
  "type": "object",
  "properties": {
    "runId": {
      "type": "integer"
    },
    "agentId": {
      "type": "integer"
    },
    "agentName": {
      "type": "string"
    },
    "status": {
      "type": "integer",
      "description": "Run status code: 0 Invalid, 1 Running, 2 Exporting, 3 Starting, 4 Queuing, 5 Stopping, 6 Failure, 7 Failed, 8 Stopped, 9 Completed, 10 Success, 11 Skipped, 12 Waiting, 13 UpdatingDataSet."
    },
    "errorMessage": {
      "type": [
        "string",
        "null"
      ]
    },
    "startTime": {
      "type": [
        "string",
        "null"
      ]
    },
    "endTime": {
      "type": [
        "string",
        "null"
      ]
    },
    "runtimeSeconds": {
      "type": [
        "integer",
        "null"
      ]
    },
    "stats": {
      "type": "object",
      "properties": {
        "dataCount": {
          "type": "integer",
          "description": "Records extracted."
        },
        "inputCount": {
          "type": [
            "integer",
            "null"
          ]
        },
        "errorCount": {
          "type": "integer"
        },
        "pageCount": {
          "type": "integer"
        },
        "exportCount": {
          "type": [
            "integer",
            "null"
          ],
          "description": "Records exported."
        },
        "traffic": {
          "type": [
            "integer",
            "null"
          ]
        }
      },
      "required": [
        "dataCount",
        "inputCount",
        "errorCount",
        "pageCount",
        "exportCount",
        "traffic"
      ]
    },
    "possibleCauses": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "suggestedActions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "runId",
    "agentId",
    "agentName",
    "status",
    "errorMessage",
    "startTime",
    "endTime",
    "runtimeSeconds",
    "stats",
    "possibleCauses",
    "suggestedActions"
  ]
}
```
