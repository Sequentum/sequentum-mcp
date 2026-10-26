# list_agent_schedules

Title: List Agent Schedules

## Annotations

```json
{
  "title": "List Agent Schedules",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

List all scheduled tasks for a specific agent. Shows when the agent is configured to run automatically. Answers: 'When does this agent run?', 'Show schedules for agent X', 'Is this agent scheduled?'. Returns: Array of schedules with id, name, schedule (the CRON expression), scheduleType, nextRunTime, isEnabled, timezone. TIP: Check isEnabled to see if the schedule is active.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "number",
      "description": "The unique ID of the agent."
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
    "result": {
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
            "description": "The scheduleId."
          },
          "configId": {
            "type": "integer",
            "description": "The agentId."
          },
          "name": {
            "type": [
              "string",
              "null"
            ]
          },
          "schedule": {
            "type": [
              "string",
              "null"
            ],
            "description": "CRON expression, for CRON schedules."
          },
          "localSchedule": {
            "type": [
              "string",
              "null"
            ]
          },
          "timezone": {
            "type": [
              "string",
              "null"
            ]
          },
          "nextRunTime": {
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
          "scheduleType": {
            "type": [
              "integer",
              "null"
            ],
            "description": "0 None, 1 RunOnce, 2 RunEvery, 3 CRON."
          },
          "isEnabled": {
            "type": "boolean"
          },
          "runEveryCount": {
            "type": [
              "integer",
              "null"
            ]
          },
          "runEveryPeriod": {
            "type": [
              "integer",
              "null"
            ],
            "description": "1 minute, 2 hour, 3 day, 4 week, 5 month."
          },
          "inputParameters": {
            "type": [
              "string",
              "null"
            ],
            "description": "JSON string of input parameters."
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
          "proxyPoolId": {
            "type": [
              "integer",
              "null"
            ]
          },
          "serverGroupId": {
            "type": [
              "integer",
              "null"
            ]
          },
          "logLevel": {
            "type": [
              "string",
              "null"
            ]
          },
          "logMode": {
            "type": [
              "string",
              "null"
            ]
          },
          "isExclusive": {
            "type": "boolean"
          },
          "isWaitOnFailure": {
            "type": "boolean"
          },
          "startedBy": {
            "type": [
              "string",
              "null"
            ]
          },
          "serverId": {
            "type": [
              "integer",
              "null"
            ]
          },
          "httpVersion": {
            "type": [
              "string",
              "null"
            ]
          },
          "saveContentCache": {
            "type": "boolean"
          },
          "configName": {
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
          }
        },
        "required": [
          "tag",
          "id",
          "configId",
          "name",
          "schedule",
          "localSchedule",
          "timezone",
          "nextRunTime",
          "startTime",
          "scheduleType",
          "isEnabled",
          "runEveryCount",
          "runEveryPeriod",
          "inputParameters",
          "parallelism",
          "parallelMaxConcurrency",
          "parallelExport",
          "proxyPoolId",
          "serverGroupId",
          "logLevel",
          "logMode",
          "isExclusive",
          "isWaitOnFailure",
          "created"
        ]
      }
    }
  },
  "required": [
    "result"
  ]
}
```
