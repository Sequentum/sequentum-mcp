# get_agent_schedule

Title: Get Agent Schedule

## Annotations

```json
{
  "title": "Get Agent Schedule",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get details of a specific schedule for an agent. Answers: 'Show me schedule X details', 'What are the settings for this schedule?'. Returns: Full schedule details including name, schedule (the CRON expression), scheduleType, nextRunTime, isEnabled, timezone, and run parameters.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "number",
      "description": "The unique ID of the agent."
    },
    "scheduleId": {
      "type": "number",
      "description": "The schedule ID. Get this from list_agent_schedules."
    }
  },
  "required": [
    "agentId",
    "scheduleId"
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
```
