# get_scheduled_runs

Title: Get Scheduled Runs

## Annotations

```json
{
  "title": "Get Scheduled Runs",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get all upcoming scheduled runs across all agents in a date range. Shows what will run and when. Answers: 'What runs this week?', 'Show upcoming schedules', 'What agents are scheduled tomorrow?'. Returns: Array of upcoming runs with scheduleId, agentId, agentName, scheduleName, nextRunTime, isEnabled. TIP: If no dates provided, defaults to the next 7 days.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "startDate": {
      "type": "string",
      "description": "Start date in ISO 8601 format. Example: '2026-01-16'. Defaults to today."
    },
    "endDate": {
      "type": "string",
      "description": "End date in ISO 8601 format. Example: '2026-01-23'. Defaults to 7 days from start."
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
    "result": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "scheduleId": {
            "type": "integer"
          },
          "agentId": {
            "type": "integer"
          },
          "agentName": {
            "type": [
              "string",
              "null"
            ]
          },
          "scheduleName": {
            "type": [
              "string",
              "null"
            ]
          },
          "schedule": {
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
          "nextRunTime": {
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
          "isEnabled": {
            "type": "boolean"
          },
          "spaceId": {
            "type": "integer",
            "description": "0 for the personal space."
          },
          "spaceName": {
            "type": [
              "string",
              "null"
            ]
          },
          "approvalStatus": {
            "type": [
              "integer",
              "null"
            ],
            "description": "0 NotApproved, 1 PendingApproval, 2 Approved."
          },
          "lastRunId": {
            "type": [
              "integer",
              "null"
            ]
          },
          "lastRunTime": {
            "type": [
              "string",
              "null"
            ]
          },
          "lastRunStatus": {
            "type": [
              "integer",
              "null"
            ],
            "description": "Run status code: 0 Invalid, 1 Running, 2 Exporting, 3 Starting, 4 Queuing, 5 Stopping, 6 Failure, 7 Failed, 8 Stopped, 9 Completed, 10 Success, 11 Skipped, 12 Waiting, 13 UpdatingDataSet."
          },
          "lastRunMessage": {
            "type": [
              "string",
              "null"
            ]
          }
        },
        "required": [
          "scheduleId",
          "agentId",
          "agentName",
          "scheduleName",
          "nextRunTime",
          "timezone",
          "isEnabled"
        ]
      }
    }
  },
  "required": [
    "result"
  ]
}
```
