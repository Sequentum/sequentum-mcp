# get_file_download_url

Title: Get File Download URL

## Annotations

```json
{
  "title": "Get File Download URL",
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

## Description

Get a temporary download URL for a specific output file. The URL expires after a short time. Answers: 'Download the CSV file', 'Get the output data', 'Give me the file link'. Returns: Temporary URL that can be used to download the file directly. REQUIRED: Get fileId first from get_run_files. TIP: Share the URL with the user so they can download the file.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "agentId": {
      "type": "number",
      "description": "The unique ID of the agent."
    },
    "runId": {
      "type": "number",
      "description": "The run ID."
    },
    "fileId": {
      "type": "number",
      "description": "The file ID from get_run_files response."
    }
  },
  "required": [
    "agentId",
    "runId",
    "fileId"
  ]
}
```

## outputSchema

```json
{
  "type": "object",
  "properties": {
    "downloadUrl": {
      "type": "string",
      "description": "Temporary signed URL; it expires."
    }
  },
  "required": [
    "downloadUrl"
  ]
}
```
