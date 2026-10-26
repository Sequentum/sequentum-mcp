# get_agent_runs

Title: Get Agent Runs

## Annotations

```json
{
  "title": "Get Agent Runs",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get execution history for an agent showing past runs with status, timing, and records extracted. Answers: 'When did agent X last run?', 'Show run history', 'How many records were extracted?', 'Did the agent fail?'. Returns: An object with runs (array of runs with id, status (numeric run status code), startTime, endTime, dataCount (records extracted), exportCount (records exported), message), plus returned, limit and truncated. TRUNCATION: Only the most recent runs are returned — 50 unless you raise maxRecords. When truncated is true, the page came back full, so more runs may exist than were returned. NEVER count this array to answer 'how many runs', 'how many failed' or 'how many succeeded' — use get_agent_run_summary, which returns exact server-computed totals. TIP: Check the most recent run's status to see if agent is currently running or recently completed. NEXT STEP: Use get_run_files to see output files from a completed run.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "number",
      "description": "The unique ID of the agent. Get this from list_agents, search_agents, or get_agent_build_status (when building a new agent)."
    },
    "maxRecords": {
      "type": "number",
      "description": "Maximum number of runs to return. Default: 50, Max: 1000. A smaller value silently returns fewer runs, so never use it when totals matter — use get_agent_run_summary instead."
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
    "runs": {
      "type": "array",
      "items": {
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
    },
    "returned": {
      "type": "integer"
    },
    "limit": {
      "type": "integer"
    },
    "truncated": {
      "type": "boolean"
    },
    "note": {
      "type": "string",
      "description": "Present only when truncated is true."
    }
  },
  "required": [
    "runs",
    "returned",
    "limit",
    "truncated"
  ]
}
```
