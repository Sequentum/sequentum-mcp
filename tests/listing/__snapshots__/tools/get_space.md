# get_space

Title: Get Space

## Annotations

```json
{
  "title": "Get Space",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get details of a specific space, including its settings. Answers: 'Tell me about space X', 'Show space details'. Returns: Space details with id, name, organizationId, created and, where available, scope and access.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "spaceId": {
      "type": "number",
      "description": "The unique ID of the space. Get this from list_spaces."
    }
  },
  "required": [
    "spaceId"
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
