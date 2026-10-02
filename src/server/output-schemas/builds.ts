import { bool, int, nullable, num, obj, str, type JsonSchema } from "./helpers.js";

export const buildOutputSchemas: Record<string, JsonSchema> = {
  // Three success shapes share one loose object: { sessionId } when waitForCompletion is false;
  // { status: completed|ready, agentId, agentName, sessionId } when the build finished;
  // { status: timeout, sessionId, message } when polling gave up. Cancellation and failures are
  // isError results, which the SDK does not validate.
  start_agent_build: obj(
    {
      sessionId: str(),
      status: str("completed, ready or timeout. Absent when waitForCompletion is false."),
      agentId: nullable(int()),
      agentName: nullable(str()),
      message: str("Present only on timeout."),
    },
    { optional: ["status", "agentId", "agentName", "message"] }
  ),
  get_agent_build_status: obj(
    {
      status: str("processing, ready, completed, error or cancelled."),
      agentId: nullable(int()),
      agentName: nullable(str()),
      agentElapsedSeconds: nullable(num()),
      browserIoSeconds: nullable(num()),
      error: str("Present only when status is error."),
    },
    { optional: ["agentId", "agentName", "agentElapsedSeconds", "browserIoSeconds", "error"] }
  ),
  stop_agent_build: obj({ stopped: bool(), sessionId: str() }),
};
