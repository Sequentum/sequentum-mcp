import { vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../../src/server/handlers.js";
import type { SequentumApiClient } from "../../src/api/api-client.js";

/** Connects an SDK client to a fresh server whose API client resolves each method with `api[method]`. */
export async function connect(api: Record<string, unknown>): Promise<Client> {
  const mock = Object.fromEntries(Object.entries(api).map(([method, value]) => [method, vi.fn().mockResolvedValue(value)]));
  const server = createMcpServer(mock as unknown as SequentumApiClient, "test");
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "output-schema-test", version: "1.0" });
  await client.connect(clientTransport);
  return client;
}

export function textOf(result: { content?: unknown }): string {
  const blocks = (result.content ?? []) as Array<{ type: string; text?: string }>;
  return blocks.find((b) => b.type === "text")?.text ?? "";
}
