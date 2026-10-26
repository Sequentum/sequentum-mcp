# get_records_summary

Title: Get Records Summary

## Annotations

```json
{
  "title": "Get Records Summary",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get a summary of how many records were extracted and exported by agents in a date range. Answers: 'How many records were scraped?', 'What was the output yesterday?', 'Show extraction statistics'. Returns: totalRecordsExtracted, totalRecordsExported, totalErrors, totalPageLoads, runCount. TIP: Use agentId filter to see statistics for a specific agent only.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "startDate": {
      "type": "string",
      "description": "Start date in ISO 8601 format. Example: '2026-01-15'."
    },
    "endDate": {
      "type": "string",
      "description": "End date in ISO 8601 format. Example: '2026-01-16'."
    },
    "agentId": {
      "type": "number",
      "description": "Optional: Filter to show records for a specific agent only."
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
    "totalRecordsExtracted": {
      "type": "integer"
    },
    "totalRecordsExported": {
      "type": "integer"
    },
    "totalErrors": {
      "type": "integer"
    },
    "totalPageLoads": {
      "type": "integer"
    },
    "runCount": {
      "type": "integer"
    },
    "agentId": {
      "type": [
        "integer",
        "null"
      ],
      "description": "Null when no agentId was given."
    }
  },
  "required": [
    "startDate",
    "endDate",
    "totalRecordsExtracted",
    "totalRecordsExported",
    "totalErrors",
    "totalPageLoads",
    "runCount",
    "agentId"
  ]
}
```
