# start_agent_build

Title: Build Agent from Prompt

## Annotations

```json
{
  "title": "Build Agent from Prompt",
  "readOnlyHint": false,
  "destructiveHint": false,
  "idempotentHint": false,
  "openWorldHint": true
}
```

## Description

Start an AI-powered build of a new agent from a natural language prompt. The call returns within about 45 seconds: as soon as the build has written its plan, at once if it finishes, otherwise when the 45 seconds pass. A build can take several minutes. The result text is a short status card: the stage, the plan and what it guessed without asking, the time so far, a link where the user can watch the build live, and the sessionId. structuredContent has the same facts (sessionId, status, stage, done, elapsedSeconds, watchUrl, agentUrl, nextCheckSeconds, agentId, agentName, plan, report, partial, summary). While done is false the build keeps running on Sequentum's servers whether or not anyone checks. Each card is meant to be relayed to the user as one short status line; the next update comes from get_agent_build_status with the sessionId and waitSeconds 45. There is nothing more to check once done is true or the user no longer wants updates: the build goes on either way, and an agent it saves appears in list_agents. A cancelled, timed-out or disconnected tool call does not stop the build; only stop_agent_build does. A build that failed or was stopped is an error result that still carries the sessionId. Set waitForCompletion=false to get only the sessionId at once. If spaceName is known, resolve it to a spaceId via search_space_by_name first. The result also carries `plan`: what the build set out to deliver, written after one look at the page. Each plan line has a provenance: 'user' (the request said it), 'site' (seen on the page), 'assumption' or 'default' (a choice the build made without asking). When the build finishes it carries `report`: each plan line graded met, partial or unmet with evidence, and up to 3 `questions` for the user, each with suggested `replies` whose first entry is the choice the build already made. The build never pauses for an answer. There is no call that applies an answer to a finished build: a different answer needs a new start_agent_build whose prompt includes it. `partial: true` means the build stopped early but delivered a working Agent; `summary` then says what is missing. ARGUMENT REQUIREMENTS: this tool's arguments are only sufficient when (1) the target URL or domain, (2) the data the user wants extracted, (3) any qualifiers that affect scope (section, filters, language, etc.) are each unambiguous. Arguments derived by analogy from a different site, or reused from a previous request for a different purpose, are not sufficient. When a required detail is absent, ask one consolidated clarifying question covering every gap instead of supplying an invented value. PROMPT-HANDLING POLICY: (1) Pass the user's wording (and any clarification answers from earlier in the conversation) through verbatim. (2) Trivial normalizations (adding 'https://', fixing an obvious URL typo) are fine. (3) Do NOT invent details the user did not state — extra fields, output formats, price-handling rules, lazy-load instructions, pagination strategies, etc. The upstream Sequentum Agent Builder pipeline will infer these on its own from the page; do not pre-empt it. If a detail feels essential to include, that is a sufficiency gap — ask one clarifying question instead of inventing.

## inputSchema

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "The user's automation request, passed through as closely as possible to their original wording. Do not add fields, formatting rules, or scraping techniques the user did not mention. Must be between 10 and 5000 characters (trimmed). Example: user says 'get product names and prices from example.com/shop/shoes' → send 'get product names and prices from https://example.com/shop/shoes'.",
      "minLength": 10,
      "maxLength": 5000
    },
    "spaceId": {
      "type": "number",
      "description": "Optional space ID to associate the agent with. Use search_space_by_name to get the ID from a name. If omitted, the default space is used."
    },
    "waitForCompletion": {
      "type": "boolean",
      "description": "If true (default), wait up to 45 seconds for the plan or the end of the build and return a status card. If false, return only the sessionId at once."
    }
  },
  "required": [
    "prompt"
  ]
}
```

## outputSchema

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "description": "processing, completed, ready, error or cancelled. Absent when waitForCompletion is false."
    },
    "agentId": {
      "type": [
        "integer",
        "null"
      ]
    },
    "agentName": {
      "type": [
        "string",
        "null"
      ]
    },
    "agentElapsedSeconds": {
      "type": [
        "number",
        "null"
      ]
    },
    "browserIoSeconds": {
      "type": [
        "number",
        "null"
      ]
    },
    "partial": {
      "type": "boolean",
      "description": "True when the build stopped early but delivered a working Agent."
    },
    "summary": {
      "type": "string",
      "description": "What the Agent collects and what is missing. Present only when partial is true."
    },
    "schemaCheck": {
      "type": "object",
      "properties": {},
      "required": [],
      "description": "How far the Agent's columns match a requested schema."
    },
    "plan": {
      "type": [
        "object",
        "null"
      ],
      "properties": {
        "version": {
          "type": "integer"
        },
        "target": {
          "type": "object",
          "properties": {
            "url": {
              "type": "string"
            },
            "text": {
              "type": "string"
            },
            "provenance": {
              "type": "string"
            }
          },
          "required": []
        },
        "item": {
          "type": "object",
          "properties": {
            "text": {
              "type": "string"
            },
            "provenance": {
              "type": "string",
              "description": "user, site, assumption or default."
            }
          },
          "required": [],
          "description": "What one row of the result is."
        },
        "fields": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string"
              },
              "required": {
                "type": "boolean",
                "description": "True only for a field the user named."
              },
              "source": {
                "type": "string",
                "description": "list (on the listing page) or detail (on each item's own page)."
              },
              "example": {
                "type": [
                  "string",
                  "null"
                ],
                "description": "A value seen on the page."
              },
              "provenance": {
                "type": "string",
                "description": "user, site, assumption or default."
              }
            },
            "required": []
          }
        },
        "scope": {
          "type": "object",
          "properties": {
            "count": {
              "type": [
                "integer",
                "null"
              ]
            },
            "text": {
              "type": "string"
            },
            "provenance": {
              "type": "string"
            }
          },
          "required": []
        },
        "exclusions": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "text": {
                "type": "string"
              },
              "provenance": {
                "type": "string",
                "description": "user, site, assumption or default."
              }
            },
            "required": []
          }
        },
        "navigation": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "text": {
                "type": "string"
              },
              "provenance": {
                "type": "string",
                "description": "user, site, assumption or default."
              }
            },
            "required": []
          }
        },
        "output": {
          "type": "object",
          "properties": {
            "text": {
              "type": "string"
            },
            "provenance": {
              "type": "string",
              "description": "user, site, assumption or default."
            }
          },
          "required": []
        }
      },
      "required": [],
      "description": "What the build set out to deliver, written after one look at the target page. Lines with provenance 'assumption' or 'default' are guesses the build made without asking. Null until the builder has seen the page."
    },
    "report": {
      "type": [
        "object",
        "null"
      ],
      "properties": {
        "lines": {
          "type": "object",
          "properties": {},
          "required": [],
          "description": "Plan line key (target, item, scope, output, field:{name}, ...) to { status: met|partial|unmet, evidence }."
        },
        "met": {
          "type": "integer"
        },
        "partial": {
          "type": "integer"
        },
        "unmet": {
          "type": "integer"
        },
        "total": {
          "type": "integer"
        },
        "questions": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "text": {
                "type": "string"
              },
              "replies": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "2 or 3 replies; the first is the default the build already used."
              }
            },
            "required": [
              "text"
            ]
          },
          "description": "Up to 3 open questions for the user."
        },
        "reportedAt": {
          "type": "string"
        }
      },
      "required": [],
      "description": "The Plan checked against the finished Agent. Null until a build that wrote a Plan has finished."
    },
    "stage": {
      "type": "string",
      "description": "Starting, Looking at the page, Building the Agent, Checking (this status read failed; the build is not affected), Task completed, Partially completed, Failed or Stopped."
    },
    "done": {
      "type": "boolean",
      "description": "True once the build has finished, failed or stopped. While false the build keeps running."
    },
    "elapsedSeconds": {
      "type": "integer",
      "description": "Time since the build started, in seconds."
    },
    "nextCheckSeconds": {
      "type": "integer",
      "description": "Present while done is false: the waitSeconds to pass to get_agent_build_status."
    },
    "watchUrl": {
      "type": "string",
      "description": "Present while done is false: the live build in the Control Center."
    },
    "agentUrl": {
      "type": "string",
      "description": "Present once the build has saved an Agent: the Agent in the Control Center."
    },
    "message": {
      "type": "string",
      "description": "Why the call returned early, when that is not a status change."
    },
    "error": {
      "type": "string",
      "description": "Present only when status is error: a fixed message."
    }
  },
  "required": [
    "sessionId"
  ]
}
```
