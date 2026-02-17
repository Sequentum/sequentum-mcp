/**
 * MCP Resource Definitions
 *
 * Exposes read-only, URI-addressable data that AI clients can browse and
 * pull into context without calling a tool. Resources complement tools by
 * providing a "discovery" layer for static or default-parameter data.
 */

import { Resource, ResourceTemplate } from "@modelcontextprotocol/sdk/types.js";
import { SequentumApiClient } from "../api/api-client.js";

// ==========================================
// Static Resources (no parameters)
// ==========================================

export const resources: Resource[] = [
  {
    uri: "sequentum://agents",
    name: "Agent List",
    description:
      "Overview of all web scraping agents (first page, up to 50 agents). " +
      "Shows id, name, status, configType, version, and lastActivity for each agent.",
    mimeType: "application/json",
  },
  {
    uri: "sequentum://spaces",
    name: "Spaces",
    description:
      "List of all accessible spaces (folders for organizing agents). " +
      "Shows id, name, and description for each space.",
    mimeType: "application/json",
  },
  {
    uri: "sequentum://billing/balance",
    name: "Credits Balance",
    description:
      "Current available credits balance for the organization. " +
      "Shows availableCredits, organizationId, and retrievedAt timestamp.",
    mimeType: "application/json",
  },
];

// ==========================================
// Resource Templates (parameterized URIs)
// ==========================================

export const resourceTemplates: ResourceTemplate[] = [
  {
    uriTemplate: "sequentum://agents/{agentId}",
    name: "Agent Detail",
    description:
      "Detailed information about a specific agent including configuration, " +
      "input parameters, and documentation.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "sequentum://agents/{agentId}/versions",
    name: "Agent Versions",
    description:
      "Version history of an agent's configuration. Shows version number, " +
      "who made the change, date, comments, and file size.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "sequentum://agents/{agentId}/schedules",
    name: "Agent Schedules",
    description:
      "Scheduled tasks configured for a specific agent. Shows schedule id, " +
      "name, cron expression, next run time, and enabled status.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "sequentum://spaces/{spaceId}",
    name: "Space Detail",
    description:
      "Details of a specific space including name, description, " +
      "organizationId, and created/updated dates.",
    mimeType: "application/json",
  },
  {
    uriTemplate: "sequentum://spaces/{spaceId}/agents",
    name: "Space Agents",
    description:
      "List of agents belonging to a specific space. Shows id, name, " +
      "status, configType, and lastActivity for each agent.",
    mimeType: "application/json",
  },
];

// ==========================================
// Resource Reader
// ==========================================

/**
 * Read a resource by URI. Matches static resources and parameterized templates,
 * dispatches the appropriate API call, and returns the JSON content.
 *
 * @param uri - The resource URI to read (e.g. "sequentum://agents" or "sequentum://agents/42")
 * @param apiClient - The API client instance for this session
 * @returns Object with uri, mimeType, and text (JSON string)
 * @throws Error if the URI does not match any known resource
 */
export async function readResource(
  uri: string,
  apiClient: SequentumApiClient
): Promise<{ uri: string; mimeType: string; text: string }> {
  // Static resources
  if (uri === "sequentum://agents") {
    const response = await apiClient.getAllAgents({ pageIndex: 1, recordsPerPage: 50 });
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(response, null, 2),
    };
  }

  if (uri === "sequentum://spaces") {
    const spaces = await apiClient.getAllSpaces();
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(spaces, null, 2),
    };
  }

  if (uri === "sequentum://billing/balance") {
    const balance = await apiClient.getCreditsBalance();
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(balance, null, 2),
    };
  }

  // Templated resources — match patterns and extract IDs
  let match: RegExpExecArray | null;

  // sequentum://agents/{agentId}/versions
  match = /^sequentum:\/\/agents\/(\d+)\/versions$/.exec(uri);
  if (match) {
    const agentId = parseInt(match[1], 10);
    const versions = await apiClient.getAgentVersions(agentId);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(versions, null, 2),
    };
  }

  // sequentum://agents/{agentId}/schedules
  match = /^sequentum:\/\/agents\/(\d+)\/schedules$/.exec(uri);
  if (match) {
    const agentId = parseInt(match[1], 10);
    const schedules = await apiClient.getAgentSchedules(agentId);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(schedules, null, 2),
    };
  }

  // sequentum://agents/{agentId}  (must come after /versions and /schedules)
  match = /^sequentum:\/\/agents\/(\d+)$/.exec(uri);
  if (match) {
    const agentId = parseInt(match[1], 10);
    const agent = await apiClient.getAgent(agentId);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(agent, null, 2),
    };
  }

  // sequentum://spaces/{spaceId}/agents
  match = /^sequentum:\/\/spaces\/(\d+)\/agents$/.exec(uri);
  if (match) {
    const spaceId = parseInt(match[1], 10);
    const agents = await apiClient.getSpaceAgents(spaceId);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(agents, null, 2),
    };
  }

  // sequentum://spaces/{spaceId}  (must come after /agents)
  match = /^sequentum:\/\/spaces\/(\d+)$/.exec(uri);
  if (match) {
    const spaceId = parseInt(match[1], 10);
    const space = await apiClient.getSpace(spaceId);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(space, null, 2),
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}
