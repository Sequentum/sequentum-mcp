# get_run_diagnostics

Title: Get Run Diagnostics

## Annotations

```json
{
  "title": "Get Run Diagnostics",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get detailed diagnostics for a specific run, including error messages, possible causes, and suggested fixes. Answers: 'Why did run X fail?', 'Show error details for this run', 'Debug run 123'. Returns: errorMessage, possibleCauses (array), suggestedActions (array), run timing and stats. USE THIS when you have a specific runId. Use get_latest_failure if you just want the most recent failure.

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
      "description": "The run ID to diagnose. Get this from get_agent_runs."
    }
  },
  "required": [
    "agentId",
    "runId"
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
