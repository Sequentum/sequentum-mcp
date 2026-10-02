# get_credit_history

Title: Get Credit History

## Annotations

```json
{
  "title": "Get Credit History",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get the transaction history of credits (additions from purchases, deductions from usage). Answers: 'Show credit history', 'What were my credit transactions?', 'When were credits added?'. Returns: An object with transactions (each with transactionType, amount, balance, created date, expiresAt, message), plus totalCount, pageIndex and recordsPerPage.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "pageIndex": {
      "type": "number",
      "description": "Page number (1-based). Default: 1."
    },
    "recordsPerPage": {
      "type": "number",
      "description": "Records per page. Default: 50, Max: 100."
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
    "transactions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "integer"
          },
          "transactionType": {
            "type": "string",
            "description": "e.g. Initial, Credit, Debit, Refund, Expiration, Adjustment, WriteOff."
          },
          "amount": {
            "type": "number"
          },
          "balance": {
            "type": "number"
          },
          "created": {
            "type": "string"
          },
          "expiresAt": {
            "type": [
              "string",
              "null"
            ]
          },
          "message": {
            "type": [
              "string",
              "null"
            ]
          }
        },
        "required": [
          "id",
          "transactionType",
          "amount",
          "balance",
          "created",
          "expiresAt",
          "message"
        ]
      }
    },
    "totalCount": {
      "type": "integer"
    },
    "pageIndex": {
      "type": "integer"
    },
    "recordsPerPage": {
      "type": "integer"
    }
  },
  "required": [
    "transactions",
    "totalCount",
    "pageIndex",
    "recordsPerPage"
  ]
}
```
