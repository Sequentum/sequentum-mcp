# get_credits_balance

Title: Get Credits Balance

## Annotations

```json
{
  "title": "Get Credits Balance",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get the current available credits balance for the organization. Answers: 'How many credits do I have?', 'What's my balance?', 'Check credits'. Returns: availableCredits, organizationId, retrievedAt timestamp.

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
    "availableCredits": {
      "type": "number"
    },
    "organizationId": {
      "type": "integer"
    },
    "retrievedAt": {
      "type": "string"
    }
  },
  "required": [
    "availableCredits",
    "organizationId",
    "retrievedAt"
  ]
}
```
