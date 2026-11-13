import { arrayOf, bool, int, nullable, num, obj, str, type JsonSchema } from "./helpers.js";

// Every Plan property is optional and every nullable one says so: the Control Center mirrors the
// editor server's Plan by hand, and a property it drops must not turn a finished build into an error.
const planLine = (description?: string): JsonSchema =>
  obj({ text: str(), provenance: str("user, site, assumption or default.") }, { optional: ["text", "provenance"], description });

const plan = nullable(
  obj(
    {
      version: int(),
      target: obj({ url: str(), text: str(), provenance: str() }, { optional: ["url", "text", "provenance"] }),
      item: planLine("What one row of the result is."),
      fields: arrayOf(
        obj(
          {
            name: str(),
            required: bool("True only for a field the user named."),
            source: str("list (on the listing page) or detail (on each item's own page)."),
            example: nullable(str("A value seen on the page.")),
            provenance: str("user, site, assumption or default."),
          },
          { optional: ["name", "required", "source", "example", "provenance"] }
        )
      ),
      scope: obj({ count: nullable(int()), text: str(), provenance: str() }, { optional: ["count", "text", "provenance"] }),
      exclusions: arrayOf(planLine()),
      navigation: arrayOf(planLine()),
      output: planLine(),
    },
    {
      optional: ["version", "target", "item", "fields", "scope", "exclusions", "navigation", "output"],
      description:
        "What the build set out to deliver, written after one look at the target page. Lines with provenance " +
        "'assumption' or 'default' are guesses the build made without asking. Null until the builder has seen the page.",
    }
  )
);

const report = nullable(
  obj(
    {
      lines: obj({}, { description: "Plan line key (target, item, scope, output, field:{name}, ...) to { status: met|partial|unmet, evidence }." }),
      met: int(),
      partial: int(),
      unmet: int(),
      total: int(),
      questions: arrayOf(
        obj(
          { text: str(), replies: arrayOf(str(), "2 or 3 replies; the first is the default the build already used.") },
          { optional: ["replies"] }
        ),
        "Up to 3 open questions for the user."
      ),
      reportedAt: str(),
    },
    {
      optional: ["lines", "met", "partial", "unmet", "total", "questions", "reportedAt"],
      description: "The Plan checked against the finished Agent. Null until a build that wrote a Plan has finished.",
    }
  )
);

// The build result fields shared by get_agent_build_status and a finished start_agent_build.
const buildResult: Record<string, JsonSchema> = {
  agentId: nullable(int()),
  agentName: nullable(str()),
  agentElapsedSeconds: nullable(num()),
  browserIoSeconds: nullable(num()),
  partial: bool("True when the build stopped early but delivered a working Agent."),
  summary: str("What the Agent collects and what is missing. Present only when partial is true."),
  schemaCheck: obj({}, { description: "How far the Agent's columns match a requested schema." }),
  plan,
  report,
};
const buildResultKeys = Object.keys(buildResult);

// The status card fields both build tools add (see tools/builds.ts).
const statusCard: Record<string, JsonSchema> = {
  stage: str(
    "Starting, Looking at the page, Building the Agent, Checking (this status read failed; the build is not affected), " +
      "Task completed, Partially completed, Failed or Stopped."
  ),
  done: bool("True once the build has finished, failed or stopped. While false the build keeps running."),
  elapsedSeconds: int("Time since the build started, in seconds."),
  nextCheckSeconds: int("Present while done is false: the waitSeconds to pass to get_agent_build_status."),
  watchUrl: str("Present while done is false: the live build in the Control Center."),
  agentUrl: str("Present once the build has saved an Agent: the Agent in the Control Center."),
  message: str("Why the call returned early, when that is not a status change."),
  error: str("Present only when status is error: a fixed message."),
};
const statusCardKeys = Object.keys(statusCard);

export const buildOutputSchemas: Record<string, JsonSchema> = {
  // { sessionId } alone when waitForCompletion is false; otherwise the status card. A build that
  // failed or was stopped is an isError result, which the SDK does not validate.
  start_agent_build: obj(
    {
      sessionId: str(),
      status: str("processing, completed, ready, error or cancelled. Absent when waitForCompletion is false."),
      ...buildResult,
      ...statusCard,
    },
    { optional: ["status", ...buildResultKeys, ...statusCardKeys] }
  ),
  get_agent_build_status: obj(
    {
      sessionId: str(),
      status: str("processing, ready, completed, error or cancelled. Absent when this status read failed (stage Checking)."),
      ...buildResult,
      ...statusCard,
    },
    { optional: ["status", ...buildResultKeys, ...statusCardKeys.filter((k) => k !== "stage" && k !== "done")] }
  ),
  stop_agent_build: obj({ stopped: bool(), sessionId: str() }),
};
