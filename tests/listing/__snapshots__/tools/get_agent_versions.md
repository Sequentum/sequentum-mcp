# get_agent_versions

Title: Get Agent Versions

## Annotations

```json
{
  "title": "Get Agent Versions",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

List all saved versions of an agent's configuration. Use for reviewing change history or finding a version to restore. Answers: 'Show agent version history', 'What changes were made?', 'List previous versions'. Returns: Array of versions with version number, userName (who made the change), created date, comments, fileSize. NEXT STEP: Use restore_agent_version to roll back to a previous version if needed.

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
          "userName": {
            "type": [
              "string",
              "null"
            ]
          },
          "version": {
            "type": "integer"
          },
          "created": {
            "type": "string"
          },
          "comments": {
            "type": [
              "string",
              "null"
            ]
          },
          "fileSize": {
            "type": "integer"
          }
        },
        "required": [
          "userName",
          "version",
          "created",
          "comments",
          "fileSize"
        ]
      }
    }
  },
  "required": [
    "result"
  ]
}
```
