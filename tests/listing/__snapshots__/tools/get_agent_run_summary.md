# get_agent_run_summary

Title: Get Agent Run Summary

## Annotations

```json
{
  "title": "Get Agent Run Summary",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get exact run totals for an agent: the overall count plus a breakdown by run status. USE THIS for any question about how many times an agent ran, failed, succeeded or was stopped — do NOT call get_agent_runs and count the results, which returns only the most recent 50 by default. Answers: 'How many times did agent X run?', 'How many runs failed?', 'Total, failed and successful runs for this agent'. Returns: An object with totalCount, and statusCounts — one entry per status with status, statusName and count. Counted across both current runs and run history, and never capped. NOTE: Statuses with no runs are omitted. 'Failure' and 'Failed' are distinct statuses, as are 'Completed' and 'Success' — add the pairs together for a single failed or succeeded figure.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "number",
      "description": "The unique ID of the agent. Get this from list_agents or search_agents."
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
    "totalCount": {
      "type": "integer"
    },
    "statusCounts": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "status": {
            "type": "integer",
            "description": "Run status code: 0 Invalid, 1 Running, 2 Exporting, 3 Starting, 4 Queuing, 5 Stopping, 6 Failure, 7 Failed, 8 Stopped, 9 Completed, 10 Success, 11 Skipped, 12 Waiting, 13 UpdatingDataSet."
          },
          "statusName": {
            "type": "string"
          },
          "count": {
            "type": "integer"
          }
        },
        "required": [
          "status",
          "statusName",
          "count"
        ]
      }
    }
  },
  "required": [
    "totalCount",
    "statusCounts"
  ]
}
```
