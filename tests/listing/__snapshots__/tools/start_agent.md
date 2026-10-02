# start_agent

Title: Start Agent

## Annotations

```json
{
  "title": "Start Agent",
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": false,
  "openWorldHint": true
}
```

## Description

Start a web scraping agent execution. Two modes available: (1) ASYNC (default): Returns immediately with runId - use get_run_status to monitor progress. (2) SYNC: Set isRunSynchronously=true to wait and get scraped data directly (best for quick agents <60s). Answers: 'Run agent X', 'Start the scraper', 'Execute the Amazon agent', 'Scrape this website'. Returns: In async mode: the run record (its id is the runId; status is a numeric run status code). In sync mode: Scraped data directly as JSON/text. REQUIRED: Get agentId first using list_agents, search_agents, or get_agent_build_status (when building a new agent). TIP: Use get_agent first to check what inputParameters the agent accepts before running. ARGUMENT REQUIREMENTS: this tool's arguments are only sufficient when (1) the target URL or domain, (2) the data the user wants extracted, (3) any qualifiers that affect scope (section, filters, language, etc.) are each unambiguous. Arguments derived by analogy from a different site, or reused from a previous request for a different purpose, are not sufficient. When a required detail is absent, ask one consolidated clarifying question covering every gap instead of supplying an invented value.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "number",
      "description": "The unique ID of the agent to run. Get this from list_agents, search_agents, or get_agent_build_status (when building a new agent)."
    },
    "inputParameters": {
      "type": "string",
      "description": "JSON string of input parameters. Check agent's inputParameters with get_agent to see what's accepted. Example: '{\"url\": \"https://example.com\"}'"
    },
    "isRunSynchronously": {
      "type": "boolean",
      "description": "If true, wait for completion and return scraped data. If false (default), return immediately with runId. Use true only for quick agents."
    },
    "timeout": {
      "type": "number",
      "description": "Timeout in seconds for synchronous runs. Only used when isRunSynchronously=true. Default: 60."
    },
    "parallelism": {
      "type": "number",
      "description": "Number of parallel instances. Default: 1. Cannot be >1 when isRunSynchronously=true."
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
    "run": {
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
    },
    "data": {
      "description": "The data the agent extracted, as the API returned it."
    }
  },
  "required": [],
  "description": "Async mode returns run; sync mode returns data."
}
```
