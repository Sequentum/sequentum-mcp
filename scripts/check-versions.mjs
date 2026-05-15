import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const server = JSON.parse(readFileSync(new URL("../server.json", import.meta.url), "utf8"));

const errors = [];

if (server.version !== pkg.version) {
  errors.push(`server.json.version (${server.version}) !== package.json.version (${pkg.version})`);
}

if (pkg.mcpName !== server.name) {
  errors.push(`package.json.mcpName (${pkg.mcpName}) !== server.json.name (${server.name})`);
}

if (!server.packages?.length) {
  errors.push("server.json.packages is empty or missing");
} else {
  const pkgEntryVersion = server.packages[0].version;
  if (pkgEntryVersion !== pkg.version) {
    errors.push(`server.json.packages[0].version (${pkgEntryVersion}) !== package.json.version (${pkg.version})`);
  }

  const pkgIdentifier = server.packages[0].identifier;
  if (pkgIdentifier !== pkg.name) {
    errors.push(`server.json.packages[0].identifier (${pkgIdentifier}) !== package.json.name (${pkg.name})`);
  }
}

if (errors.length) {
  console.error("Sync check failed:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

console.log(`Versions match: ${pkg.version} -- mcpName matches: ${pkg.mcpName}`);
