import { readFileSync } from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const schema = JSON.parse(
  readFileSync(new URL("../schemas/server.schema.2025-12-11.json", import.meta.url), "utf8")
);

const serverJson = JSON.parse(
  readFileSync(new URL("../server.json", import.meta.url), "utf8")
);

// strict: false because the upstream schema uses keywords/formats AJV's strict mode
// flags as unknown. We don't author the schema, so we accept whatever the registry publishes.
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);
const valid = validate(serverJson);

if (!valid) {
  console.error("server.json validation failed against MCP Registry schema:");
  for (const error of validate.errors ?? []) {
    console.error(`  ${error.instancePath || "/"}: ${error.message}`);
  }
  process.exit(1);
}

console.log("server.json is valid against MCP Registry schema.");
