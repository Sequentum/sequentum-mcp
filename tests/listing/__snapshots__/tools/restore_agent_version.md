# restore_agent_version

Title: Restore Agent Version

## Annotations

```json
{
  "title": "Restore Agent Version",
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": false,
  "openWorldHint": false
}
```

## Description

Restore an agent to a previous version. This creates a NEW version based on the restored configuration. Answers: 'Roll back agent to version X', 'Undo agent changes', 'Restore previous configuration'. WARNING: This modifies the agent. Use get_agent_versions first to find the correct version number. REQUIRED: Provide a reason in 'comments' explaining why the restore is needed.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "number",
      "description": "The unique ID of the agent."
    },
    "versionNumber": {
      "type": "number",
      "description": "The version number to restore to. Get this from get_agent_versions."
    },
    "comments": {
      "type": "string",
      "description": "Explanation for why this version is being restored. Will be recorded in version history."
    }
  },
  "required": [
    "agentId",
    "versionNumber",
    "comments"
  ]
}
```

## outputSchema

(none)
