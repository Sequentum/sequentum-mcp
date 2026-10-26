# search_space_by_name

Title: Search Space by Name

## Annotations

```json
{
  "title": "Search Space by Name",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Find a space by its name. Use when user mentions a space by name instead of ID. Answers: 'Find the Production space', 'Get the Bot Blocking folder'. Returns: Matching space with id, name, created and, where available, scope and access. NEXT STEP: Use the returned spaceId with get_space_agents or run_space_agents.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "The space name to search for. Case-insensitive."
    }
  },
  "required": [
    "name"
  ]
}
```

## outputSchema

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "integer"
    },
    "name": {
      "type": "string"
    },
    "organizationId": {
      "type": "integer"
    },
    "created": {
      "type": [
        "string",
        "null"
      ]
    },
    "isDefaultAccess": {
      "type": "boolean"
    },
    "scope": {
      "type": [
        "string",
        "null"
      ],
      "description": "Private, Public or Global."
    },
    "runRetentionHours": {
      "type": [
        "integer",
        "null"
      ]
    },
    "initiatedBy": {
      "type": [
        "string",
        "null"
      ]
    },
    "access": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "id",
    "name",
    "organizationId",
    "created",
    "isDefaultAccess"
  ]
}
```
