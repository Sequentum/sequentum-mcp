/**
 * Sequentum API Client
 * Handles all HTTP communication with the Sequentum Control Center API
 */

import {
  AgentApiModel,
  AgentRunApiModel,
  AgentRunFileApiModel,
  AgentVersionModel,
  StartAgentRequest,
  ApiError,
  AgentScheduleApiModel,
  CreateScheduleRequest,
  UpcomingScheduleApiModel,
  CreditsBalanceApiModel,
  SpendingSummaryApiModel,
  CreditHistoryApiModel,
  AgentsUsageApiResponse,
  AgentCostBreakdownApiModel,
  AgentRunsApiResponse,
  SpaceApiModel,
  SpaceAgentApiModel,
  RunSpaceAgentsResultApiModel,
  RunsSummaryApiModel,
  RecordsSummaryApiModel,
  RunDiagnosticsApiModel,
  ListAgentsRequest,
  PaginatedAgentsResponse,
  AuthenticationError,
} from "./types.js";

export class SequentumApiClient {
  private baseUrl: string;
  private apiKey: string | null;
  private accessToken: string | null = null;
  private requestTimeoutMs: number;

  /**
   * Create a new Sequentum API client
   * @param baseUrl - The base URL of the Sequentum API (e.g., https://dashboard.sequentum.com)
   * @param apiKey - The API key (sk-...) for authentication (optional if using OAuth2)
   * @param requestTimeoutMs - Request timeout in milliseconds (default: 30000)
   */
  constructor(baseUrl: string, apiKey: string | null = null, requestTimeoutMs: number = 30000) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  /**
   * Set the OAuth2 access token for Bearer authentication
   * @param token - The access token
   */
  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  /**
   * Get the current access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Build the Authorization header based on available credentials
   */
  private getAuthorizationHeader(): string {
    if (this.accessToken) {
      return `Bearer ${this.accessToken}`;
    }
    if (this.apiKey) {
      return `ApiKey ${this.apiKey}`;
    }
    throw new AuthenticationError("No authentication configured. Set either an API key or OAuth2 access token.");
  }

  /**
   * Make an authenticated request to the API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: this.getAuthorizationHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers as Record<string, string>),
    };

    // Setup timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMessage = `API Error ${response.status}: ${response.statusText}`;
        
        try {
          const errorText = await response.text();
          if (errorText) {
            try {
              const errorJson = JSON.parse(errorText) as ApiError;
              if (errorJson.message) {
                errorMessage = errorJson.message;
              }
            } catch {
              errorMessage = errorText;
            }
          }
        } catch {
          // Use default error message
        }

        throw new Error(errorMessage);
      }

      // Handle redirect for file downloads
      if (response.redirected) {
        return { redirectUrl: response.url } as T;
      }

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        return response.json() as Promise<T>;
      }

      return response.text() as unknown as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${this.requestTimeoutMs}ms: ${endpoint}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Make an authenticated request that doesn't expect a response body
   */
  private async requestVoid(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<void> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: this.getAuthorizationHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers as Record<string, string>),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMessage = `API Error ${response.status}: ${response.statusText}`;

        try {
          const errorText = await response.text();
          if (errorText) {
            try {
              const errorJson = JSON.parse(errorText) as ApiError;
              if (errorJson.message) {
                errorMessage = errorJson.message;
              }
            } catch {
              errorMessage = errorText;
            }
          }
        } catch {
          // Use default error message
        }

        throw new Error(errorMessage);
      }
      // 204 No Content or any success status - just return
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${this.requestTimeoutMs}ms: ${endpoint}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ==========================================
  // Agent Operations
  // ==========================================

  /**
   * Get all agents accessible to the authenticated user
   * @param filters - Optional filters for the agent list
   * @returns Array of agents, or paginated response if pagination params are provided
   */
  async getAllAgents(filters?: ListAgentsRequest): Promise<AgentApiModel[] | PaginatedAgentsResponse> {
    const params = new URLSearchParams();
    if (filters?.status !== undefined) {
      params.append("status", String(filters.status));
    }
    if (filters?.spaceId !== undefined) {
      params.append("spaceId", String(filters.spaceId));
    }
    if (filters?.search) {
      params.append("name", filters.search);
    }
    if (filters?.configType) {
      params.append("configType", filters.configType);
    }
    if (filters?.sortColumn) {
      params.append("sortColumn", filters.sortColumn);
    }
    if (filters?.sortOrder !== undefined) {
      params.append("sortOrder", String(filters.sortOrder));
    }
    if (filters?.pageIndex !== undefined) {
      params.append("pageIndex", String(filters.pageIndex));
    }
    if (filters?.recordsPerPage !== undefined) {
      params.append("recordsPerPage", String(filters.recordsPerPage));
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<AgentApiModel[] | PaginatedAgentsResponse>(`/api/v1/agent/all${query}`);
  }

  /**
   * Get detailed information about a specific agent
   * @param agentId - The ID of the agent
   */
  async getAgent(agentId: number): Promise<AgentApiModel> {
    return this.request<AgentApiModel>(`/api/v1/agent/${agentId}`);
  }

  /**
   * Search for agents by name or description
   * @param query - The search term to match against agent names and descriptions
   * @param maxRecords - Maximum number of results to return (default: 50, max: 1000)
   */
  async searchAgents(
    query: string,
    maxRecords?: number
  ): Promise<AgentApiModel[]> {
    const params = new URLSearchParams();
    params.append("query", query);
    if (maxRecords !== undefined) params.append("maxRecords", String(maxRecords));
    const queryString = params.toString() ? `?${params.toString()}` : "";
    return this.request<AgentApiModel[]>(
      `/api/v1/agent/search${queryString}`
    );
  }

  // ==========================================
  // Run Operations
  // ==========================================

  /**
   * Get run history for an agent
   * @param agentId - The ID of the agent
   * @param maxRecords - Maximum number of records to return (default: 50)
   */
  async getAgentRuns(
    agentId: number,
    maxRecords?: number
  ): Promise<AgentRunApiModel[]> {
    const query = maxRecords ? `?maxRecords=${maxRecords}` : "";
    return this.request<AgentRunApiModel[]>(
      `/api/v1/agent/${agentId}/runs${query}`
    );
  }

  /**
   * Get the status of a specific run
   * @param agentId - The ID of the agent
   * @param runId - The ID of the run to check
   */
  async getRunStatus(agentId: number, runId: number): Promise<AgentRunApiModel> {
    return this.request<AgentRunApiModel>(
      `/api/v1/agent/${agentId}/run/${runId}/status`
    );
  }

  /**
   * Start an agent execution
   * @param agentId - The ID of the agent to run
   * @param request - The run configuration
   * @returns Run details or direct results if running synchronously
   */
  async startAgent(
    agentId: number,
    request: StartAgentRequest
  ): Promise<AgentRunApiModel | string> {
    return this.request<AgentRunApiModel | string>(
      `/api/v1/agent/${agentId}/start`,
      {
        method: "POST",
        body: JSON.stringify({
          Parallelism: request.parallelism ?? 1,
          ParallelMaxConcurrency: request.parallelMaxConcurrency ?? 1,
          ParallelExport: request.parallelExport ?? "Combined",
          ProxyPoolId: request.proxyPoolId,
          InputParameters: request.inputParameters,
          Timeout: request.timeout ?? 60,
          IsExclusive: request.isExclusive ?? true,
          IsWaitOnFailure: request.isWaitOnFailure ?? false,
          IsRunSynchronously: request.isRunSynchronously ?? false,
          LogLevel: request.logLevel ?? "Info",
          LogMode: request.logMode ?? "Text",
        }),
      }
    );
  }

  /**
   * Stop a running agent
   * @param agentId - The ID of the agent
   * @param runId - The ID of the run to stop
   */
  async stopAgent(agentId: number, runId: number): Promise<void> {
    await this.requestVoid(`/api/v1/agent/${agentId}/run/${runId}/stop`, {
      method: "POST",
    });
  }

  /**
   * Forcefully kill a running agent instance
   * First call: Initiates graceful stop (same as Stop)
   * Second call: Forces immediate termination if still stopping
   * @param agentId - The ID of the agent
   * @param runId - The ID of the run to kill
   */
  async killAgent(agentId: number, runId: number): Promise<void> {
    await this.requestVoid(`/api/v1/agent/${agentId}/run/${runId}/kill`, {
      method: "POST",
    });
  }

  // ==========================================
  // File Operations
  // ==========================================

  /**
   * Get all output files from a run
   * @param agentId - The ID of the agent
   * @param runId - The ID of the run
   */
  async getRunFiles(
    agentId: number,
    runId: number
  ): Promise<AgentRunFileApiModel[]> {
    return this.request<AgentRunFileApiModel[]>(
      `/api/v1/agent/${agentId}/run/${runId}/files`
    );
  }

  /**
   * Get a download URL for a run file
   * @param agentId - The ID of the agent
   * @param runId - The ID of the run
   * @param fileId - The ID of the file
   */
  async downloadRunFile(
    agentId: number,
    runId: number,
    fileId: number
  ): Promise<{ redirectUrl: string }> {
    return this.request<{ redirectUrl: string }>(
      `/api/v1/agent/${agentId}/run/${runId}/file/${fileId}/download`
    );
  }

  // ==========================================
  // Version Operations
  // ==========================================

  /**
   * Get all versions of an agent
   * @param agentId - The ID of the agent
   */
  async getAgentVersions(agentId: number): Promise<AgentVersionModel[]> {
    return this.request<AgentVersionModel[]>(
      `/api/v1/agent/${agentId}/versions`
    );
  }

  /**
   * Restore an agent to a previous version
   * @param agentId - The ID of the agent
   * @param versionNumber - The version number to restore
   * @param comments - Comments explaining the restoration
   */
  async restoreAgentVersion(
    agentId: number,
    versionNumber: number,
    comments: string
  ): Promise<void> {
    await this.requestVoid(
      `/api/v1/agent/${agentId}/version/${versionNumber}/restore`,
      {
        method: "POST",
        body: JSON.stringify({ content: comments }),
      }
    );
  }

  // ==========================================
  // Schedule Operations
  // ==========================================

  /**
   * Get all schedules for an agent
   * @param agentId - The ID of the agent
   */
  async getAgentSchedules(agentId: number): Promise<AgentScheduleApiModel[]> {
    return this.request<AgentScheduleApiModel[]>(
      `/api/v1/agent/${agentId}/schedules`
    );
  }

  /**
   * Create a new schedule for an agent
   * @param agentId - The ID of the agent
   * @param request - The schedule configuration
   * @returns The created schedule
   */
  async createAgentSchedule(
    agentId: number,
    request: CreateScheduleRequest
  ): Promise<AgentScheduleApiModel> {
    return this.request<AgentScheduleApiModel>(
      `/api/v1/agent/${agentId}/schedules`,
      {
        method: "POST",
        body: JSON.stringify({
          Name: request.name,
          ScheduleType: request.scheduleType,
          CronExpression: request.cronExpression,
          StartTime: request.startTime,
          RunEveryCount: request.runEveryCount,
          RunEveryPeriod: request.runEveryPeriod,
          Timezone: request.timezone,
          InputParameters: request.inputParameters,
          IsEnabled: request.isEnabled ?? true,
          Parallelism: request.parallelism ?? 1,
        }),
      }
    );
  }

  /**
   * Delete a schedule from an agent
   * @param agentId - The ID of the agent
   * @param scheduleId - The ID of the schedule to delete
   */
  async deleteAgentSchedule(agentId: number, scheduleId: number): Promise<void> {
    await this.requestVoid(
      `/api/v1/agent/${agentId}/schedules/${scheduleId}`,
      { method: "DELETE" }
    );
  }

  /**
   * Get upcoming scheduled runs
   * @param startDate - Optional start date (ISO format)
   * @param endDate - Optional end date (ISO format)
   */
  async getUpcomingSchedules(
    startDate?: string,
    endDate?: string
  ): Promise<UpcomingScheduleApiModel[]> {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<UpcomingScheduleApiModel[]>(
      `/api/v1/analytics/schedules/upcoming${query}`
    );
  }

  // ==========================================
  // Billing/Credits Operations
  // ==========================================

  /**
   * Get the current credits balance
   */
  async getCreditsBalance(): Promise<CreditsBalanceApiModel> {
    return this.request<CreditsBalanceApiModel>("/api/v1/billing/credits");
  }

  /**
   * Get spending summary for a date range
   * @param startDate - Optional start date (ISO format)
   * @param endDate - Optional end date (ISO format)
   */
  async getSpendingSummary(
    startDate?: string,
    endDate?: string
  ): Promise<SpendingSummaryApiModel> {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<SpendingSummaryApiModel>(
      `/api/v1/billing/spending${query}`
    );
  }

  /**
   * Get credit transaction history
   * @param pageIndex - Page number (1-based, default: 1)
   * @param recordsPerPage - Records per page (default: 50, max: 100)
   */
  async getCreditHistory(
    pageIndex?: number,
    recordsPerPage?: number
  ): Promise<CreditHistoryApiModel> {
    const params = new URLSearchParams();
    if (pageIndex !== undefined) params.append("pageIndex", String(pageIndex));
    if (recordsPerPage !== undefined) params.append("recordsPerPage", String(recordsPerPage));
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<CreditHistoryApiModel>(
      `/api/v1/billing/history${query}`
    );
  }

  /**
   * Get all agents with their costs for a date range
   * @param startDate - Start date (ISO format, required)
   * @param endDate - End date (ISO format, required)
   * @param pageIndex - Page number (1-based, default: 1)
   * @param recordsPerPage - Records per page (default: 50, max: 1000)
   * @param sortColumn - Column to sort by (name, cost)
   * @param sortOrder - Sort order (0 = ascending, 1 = descending)
   * @param name - Filter by agent name (contains match)
   * @param usageTypes - Filter by usage types (comma-separated)
   */
  async getAgentsUsage(
    startDate: string,
    endDate: string,
    pageIndex?: number,
    recordsPerPage?: number,
    sortColumn?: string,
    sortOrder?: number,
    name?: string,
    usageTypes?: string
  ): Promise<AgentsUsageApiResponse> {
    const params = new URLSearchParams();
    params.append("startDate", startDate);
    params.append("endDate", endDate);
    if (pageIndex !== undefined) params.append("pageIndex", String(pageIndex));
    if (recordsPerPage !== undefined)
      params.append("recordsPerPage", String(recordsPerPage));
    if (sortColumn) params.append("sortColumn", sortColumn);
    if (sortOrder !== undefined) params.append("sortOrder", String(sortOrder));
    if (name) params.append("name", name);
    if (usageTypes) params.append("usageTypes", usageTypes);

    return this.request<AgentsUsageApiResponse>(
      `/api/v1/billing/agents?${params.toString()}`
    );
  }

  /**
   * Get cost breakdown for a specific agent over time
   * @param agentId - The agent ID
   * @param startDate - Start date (ISO format, required)
   * @param endDate - End date (ISO format, required)
   * @param timeUnit - Time unit for grouping (day, month)
   * @param usageTypes - Filter by usage types (comma-separated)
   */
  async getAgentCostBreakdown(
    agentId: number,
    startDate: string,
    endDate: string,
    timeUnit?: string,
    usageTypes?: string
  ): Promise<AgentCostBreakdownApiModel> {
    const params = new URLSearchParams();
    params.append("startDate", startDate);
    params.append("endDate", endDate);
    if (timeUnit) params.append("timeUnit", timeUnit);
    if (usageTypes) params.append("usageTypes", usageTypes);

    return this.request<AgentCostBreakdownApiModel>(
      `/api/v1/billing/agents/${agentId}?${params.toString()}`
    );
  }

  /**
   * Get individual run costs for a specific agent
   * @param agentId - The agent ID
   * @param startDate - Start date (ISO format, required)
   * @param endDate - End date (ISO format, required)
   * @param pageIndex - Page number (1-based, default: 1)
   * @param recordsPerPage - Records per page (default: 50, max: 1000)
   * @param sortColumn - Column to sort by (date, cost, duration)
   * @param sortOrder - Sort order (0 = ascending, 1 = descending)
   * @param usageTypes - Filter by usage types (comma-separated)
   */
  async getAgentRunsCost(
    agentId: number,
    startDate: string,
    endDate: string,
    pageIndex?: number,
    recordsPerPage?: number,
    sortColumn?: string,
    sortOrder?: number,
    usageTypes?: string
  ): Promise<AgentRunsApiResponse> {
    const params = new URLSearchParams();
    params.append("startDate", startDate);
    params.append("endDate", endDate);
    if (pageIndex !== undefined) params.append("pageIndex", String(pageIndex));
    if (recordsPerPage !== undefined)
      params.append("recordsPerPage", String(recordsPerPage));
    if (sortColumn) params.append("sortColumn", sortColumn);
    if (sortOrder !== undefined) params.append("sortOrder", String(sortOrder));
    if (usageTypes) params.append("usageTypes", usageTypes);

    return this.request<AgentRunsApiResponse>(
      `/api/v1/billing/agents/${agentId}/runs?${params.toString()}`
    );
  }

  // ==========================================
  // Space Operations
  // ==========================================

  /**
   * Get all spaces accessible to the user
   */
  async getAllSpaces(): Promise<SpaceApiModel[]> {
    return this.request<SpaceApiModel[]>("/api/v1/spaces");
  }

  /**
   * Get a specific space by ID
   * @param spaceId - The ID of the space
   */
  async getSpace(spaceId: number): Promise<SpaceApiModel> {
    return this.request<SpaceApiModel>(`/api/v1/spaces/${spaceId}`);
  }

  /**
   * Get all agents in a space
   * @param spaceId - The ID of the space
   */
  async getSpaceAgents(spaceId: number): Promise<SpaceAgentApiModel[]> {
    return this.request<SpaceAgentApiModel[]>(
      `/api/v1/spaces/${spaceId}/agents`
    );
  }

  /**
   * Search for a space by name
   * @param name - The name of the space to search for
   */
  async searchSpaceByName(name: string): Promise<SpaceApiModel> {
    return this.request<SpaceApiModel>(
      `/api/v1/spaces/search?name=${encodeURIComponent(name)}`
    );
  }

  /**
   * Run all agents in a space
   * @param spaceId - The ID of the space
   * @param inputParameters - Optional JSON input parameters
   */
  async runSpaceAgents(
    spaceId: number,
    inputParameters?: string
  ): Promise<RunSpaceAgentsResultApiModel> {
    return this.request<RunSpaceAgentsResultApiModel>(
      `/api/v1/spaces/${spaceId}/run-all`,
      {
        method: "POST",
        body: JSON.stringify({
          InputParameters: inputParameters,
        }),
      }
    );
  }

  // ==========================================
  // Analytics Operations
  // ==========================================

  /**
   * Get runs summary for a date range
   * @param startDate - Optional start date (ISO format)
   * @param endDate - Optional end date (ISO format)
   * @param status - Optional status filter
   * @param includeDetails - Whether to include failed run details
   */
  async getRunsSummary(
    startDate?: string,
    endDate?: string,
    status?: string,
    includeDetails?: boolean
  ): Promise<RunsSummaryApiModel> {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (status) params.append("status", status);
    if (includeDetails !== undefined)
      params.append("includeDetails", String(includeDetails));
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<RunsSummaryApiModel>(
      `/api/v1/analytics/runs/summary${query}`
    );
  }

  /**
   * Get records summary for a date range
   * @param startDate - Optional start date (ISO format)
   * @param endDate - Optional end date (ISO format)
   * @param agentId - Optional agent ID filter
   */
  async getRecordsSummary(
    startDate?: string,
    endDate?: string,
    agentId?: number
  ): Promise<RecordsSummaryApiModel> {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (agentId) params.append("agentId", String(agentId));
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<RecordsSummaryApiModel>(
      `/api/v1/analytics/records/summary${query}`
    );
  }

  /**
   * Get diagnostics for a specific run
   * @param agentId - The ID of the agent
   * @param runId - The ID of the run
   */
  async getRunDiagnostics(
    agentId: number,
    runId: number
  ): Promise<RunDiagnosticsApiModel> {
    return this.request<RunDiagnosticsApiModel>(
      `/api/v1/analytics/agents/${agentId}/runs/${runId}/diagnostics`
    );
  }

  /**
   * Get the latest failure for an agent
   * @param agentId - The ID of the agent
   */
  async getLatestFailure(agentId: number): Promise<RunDiagnosticsApiModel> {
    return this.request<RunDiagnosticsApiModel>(
      `/api/v1/analytics/agents/${agentId}/latest-failure`
    );
  }
}



