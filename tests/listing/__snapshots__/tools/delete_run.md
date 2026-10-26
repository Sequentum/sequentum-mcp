# delete_run

Title: Delete Run

## Annotations

```json
{
  "title": "Delete Run",
  "readOnlyHint": false,
  "destructiveHint": true,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Delete a run and its associated data (files, storage). Used for PII compliance. Checks both active Runs and RunHistory tables automatically. Answers: 'Delete run X', 'Remove run files', 'Clean up PII data from a run'. WARNING: Destructive and irreversible. REQUIRED: agentId and runId. Get runId from get_agent_runs.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "number",
      "description": "The ID of the agent that contains the run."
    },
    "runId": {
      "type": "number",
      "description": "The ID of the run to delete. Get from get_agent_runs."
    },
    "removeMethod": {
      "type": "string",
      "enum": [
        "RemoveEntireRun",
        "RemoveAllFiles",
        "RemoveAllFilesAndAgentInput"
      ],
      "description": "What to delete. RemoveEntireRun (default): Completely removes the run record and all associated files. RemoveAllFiles: Removes files but keeps the run record. RemoveAllFilesAndAgentInput: Removes files and clears agent input parameters."
    }
  },
  "required": [
    "agentId",
    "runId"
  ]
}
```

## outputSchema

(none)
