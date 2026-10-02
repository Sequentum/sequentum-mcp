# get_runs_summary

Title: Get Runs Summary

## Annotations

```json
{
  "title": "Get Runs Summary",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get aggregate statistics about agent runs in a date range: counts of completed, failed, running, etc. Answers: 'How many agents ran yesterday?', 'What failed last week?', 'Show run statistics', 'Give me a summary of runs'. Returns: totalRuns, completedRuns, failedRuns, completedWithErrorsRuns, runningRuns, queuedRuns, stoppedRuns. TIP: Set includeDetails=true to get details of which specific agents failed and why. TIP: Use status filter to focus on specific outcomes (e.g., 'Failed' to see only failures).

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "startDate": {
      "type": "string",
      "description": "Start date in ISO 8601 format. Example: '2026-01-15'. Defaults to today if not specified."
    },
    "endDate": {
      "type": "string",
      "description": "End date in ISO 8601 format. Example: '2026-01-16'. Defaults to today if not specified."
    },
    "status": {
      "type": "string",
      "description": "Filter by run status: 'Failed', 'Completed', 'CompletedWithErrors', 'Running'. Only shows runs with this status."
    },
    "includeDetails": {
      "type": "boolean",
      "description": "If true, includes failedRunDetails array with specific agent names and error messages. Default: true."
    }
  },
  "required": []
}
```

## outputSchema

```json
{
  "type": "object",
  "properties": {
    "startDate": {
      "type": "string"
    },
    "endDate": {
      "type": "string"
    },
    "totalRuns": {
      "type": "integer"
    },
    "completedRuns": {
      "type": "integer"
    },
    "failedRuns": {
      "type": "integer"
    },
    "completedWithErrorsRuns": {
      "type": "integer"
    },
    "runningRuns": {
      "type": "integer"
    },
    "queuedRuns": {
      "type": "integer"
    },
    "stoppedRuns": {
      "type": "integer"
    },
    "failedRunDetails": {
      "type": [
        "array",
        "null"
      ],
      "items": {
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
          "spaceId": {
            "type": [
              "integer",
              "null"
            ]
          },
          "spaceName": {
            "type": [
              "string",
              "null"
            ]
          }
        },
        "required": [
          "runId",
          "agentId",
          "agentName",
          "startTime",
          "endTime",
          "status",
          "errorMessage",
          "spaceId",
          "spaceName"
        ]
      },
      "description": "Null unless includeDetails is true and there are failures."
    }
  },
  "required": [
    "startDate",
    "endDate",
    "totalRuns",
    "completedRuns",
    "failedRuns",
    "completedWithErrorsRuns",
    "runningRuns",
    "queuedRuns",
    "stoppedRuns",
    "failedRunDetails"
  ]
}
```
