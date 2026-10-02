# get_run_status

Title: Get Run Status

## Annotations

```json
{
  "title": "Get Run Status",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get the current status of a specific run. FASTER than get_agent_runs when you only need one run's status. Answers: 'Is run 123 still running?', 'Did that run complete?', 'Check run status'. Returns: Single run with status, timing, and dataCount (records extracted). USE AFTER start_agent to monitor a run you just started. status is a numeric run status code: 1 Running, 2 Exporting, 3 Starting, 4 Queuing, 5 Stopping, 6 Failure, 7 Failed, 8 Stopped, 9 Completed, 10 Success, 11 Skipped, 12 Waiting, 13 UpdatingDataSet (0 Invalid).

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
      "description": "The run ID returned by start_agent or found in get_agent_runs."
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
    "tag": {
      "type": [
        "string",
        "null"
      ]
    },
    "id": {
      "type": "integer",
      "description": "The runId."
    },
    "configId": {
      "type": "integer",
      "description": "The agentId."
    },
    "configName": {
      "type": [
        "string",
        "null"
      ]
    },
    "spaceId": {
      "type": "integer"
    },
    "organizationId": {
      "type": "integer"
    },
    "organizationName": {
      "type": [
        "string",
        "null"
      ]
    },
    "sequence": {
      "type": "integer"
    },
    "parallelism": {
      "type": [
        "integer",
        "null"
      ]
    },
    "parallelMaxConcurrency": {
      "type": [
        "integer",
        "null"
      ]
    },
    "parallelExport": {
      "type": [
        "string",
        "null"
      ],
      "description": "Combined or Separated."
    },
    "parallelSet": {
      "type": [
        "integer",
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
    "created": {
      "type": [
        "string",
        "null"
      ]
    },
    "status": {
      "type": "integer",
      "description": "Run status code: 0 Invalid, 1 Running, 2 Exporting, 3 Starting, 4 Queuing, 5 Stopping, 6 Failure, 7 Failed, 8 Stopped, 9 Completed, 10 Success, 11 Skipped, 12 Waiting, 13 UpdatingDataSet."
    },
    "message": {
      "type": [
        "string",
        "null"
      ],
      "description": "Error or status message."
    },
    "configVersion": {
      "type": [
        "integer",
        "null"
      ]
    },
    "actionCount": {
      "type": "integer"
    },
    "pageCount": {
      "type": "integer"
    },
    "dynamicPageCount": {
      "type": "integer"
    },
    "requestCount": {
      "type": "integer"
    },
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
    },
    "runTimeSec": {
      "type": [
        "integer",
        "null"
      ]
    },
    "serverName": {
      "type": [
        "string",
        "null"
      ]
    },
    "tableType": {
      "type": [
        "string",
        "null"
      ],
      "description": "run for an active run, history for a finished one."
    }
  },
  "required": [
    "tag",
    "id",
    "configId",
    "configName",
    "spaceId",
    "organizationId",
    "organizationName",
    "sequence",
    "parallelism",
    "parallelMaxConcurrency",
    "parallelExport",
    "parallelSet",
    "startTime",
    "endTime",
    "created",
    "status",
    "message",
    "configVersion",
    "actionCount",
    "pageCount",
    "dynamicPageCount",
    "requestCount",
    "dataCount",
    "inputCount",
    "errorCount",
    "exportCount",
    "traffic",
    "runTimeSec",
    "serverName",
    "tableType"
  ]
}
```
