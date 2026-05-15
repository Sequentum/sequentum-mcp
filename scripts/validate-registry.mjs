import { readFileSync } from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const SCHEMA_URL =
  "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";

const response = await fetch(SCHEMA_URL);
if (!response.ok) {
  throw new Error(`Failed to fetch MCP Registry schema: ${response.status} ${response.statusText}`);
}
const schema = await response.json();

const serverJson = JSON.parse(
  readFileSync(new URL("../server.json", import.meta.url), "utf8")
);

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
