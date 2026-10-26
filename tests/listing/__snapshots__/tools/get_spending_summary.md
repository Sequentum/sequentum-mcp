# get_spending_summary

Title: Get Spending Summary

## Annotations

```json
{
  "title": "Get Spending Summary",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get a summary of credits spent in a date range. Answers: 'How much have I spent?', 'What's my usage this week?', 'Show spending for January'. Returns: totalSpent, startDate, endDate, currentBalance. TIP: If no dates provided, returns spending for the current period.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "startDate": {
      "type": "string",
      "description": "Start date in ISO 8601 format. Example: '2026-01-01'."
    },
    "endDate": {
      "type": "string",
      "description": "End date in ISO 8601 format. Example: '2026-01-31'."
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
    "totalSpent": {
      "type": "number"
    },
    "startDate": {
      "type": "string"
    },
    "endDate": {
      "type": "string"
    },
    "organizationId": {
      "type": "integer"
    },
    "currentBalance": {
      "type": "number"
    }
  },
  "required": [
    "totalSpent",
    "startDate",
    "endDate",
    "organizationId",
    "currentBalance"
  ]
}
```
