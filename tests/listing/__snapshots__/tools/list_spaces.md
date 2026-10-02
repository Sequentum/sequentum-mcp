# list_spaces

Title: List Spaces

## Annotations

```json
{
  "title": "List Spaces",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

List all accessible spaces (folders for organizing agents into groups). Answers: 'What spaces do I have?', 'Show my folders', 'List agent groups'. Returns: Array of spaces with id, name, created and, where available, scope and access. USE THIS to find spaceId before using get_space_agents or filtering list_agents by space.

## inputSchema

```json
{
  "type": "object",
  "properties": {},
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
    }
  },
  "required": [
    "result"
  ]
}
```
