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
  ApiErrorBody,
  AgentScheduleApiModel,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  UpcomingScheduleApiModel,
  CreditsBalanceApiModel,
  SpendingSummaryApiModel,
  CreditHistoryApiModel,
  SpaceApiModel,
  SpaceAgentApiModel,
  RunSpaceAgentsResultApiModel,
  RunsSummaryApiModel,
  RecordsSummaryApiModel,
  RunDiagnosticsApiModel,
  ListAgentsRequest,
  PaginatedAgentsResponse,
  AuthenticationError,
  ApiRequestError,
  RateLimitError,
} from "./types.js";

/** Default retry configuration for transient failures */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

/** HTTP status codes that are safe to retry on idempotent requests */
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

export class SequentumApiClient {
  private baseUrl: string;
  private apiKey: string | null;
  private accessToken: string | null = null;
  private requestTimeoutMs: number;
  private maxRetries: number;
  private baseDelayMs: number;
  private maxDelayMs: number;

  /**
   * Create a new Sequentum API client
   * @param baseUrl - The base URL of the Sequentum API (e.g., https://dashboard.sequentum.com)
   * @param apiKey - The API key (sk-...) for authentication (optional if using OAuth2)
   * @param requestTimeoutMs - Request timeout in milliseconds (default: 30000)
   * @param maxRetries - Maximum number of retries for transient failures (default: 3)
   */
  constructor(
    baseUrl: string,
    apiKey: string | null = null,
    requestTimeoutMs: number = 30000,
    maxRetries: number = DEFAULT_MAX_RETRIES
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.requestTimeoutMs = requestTimeoutMs;
    this.maxRetries = maxRetries;
    this.baseDelayMs = DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = DEFAULT_MAX_DELAY_MS;
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

  // ==========================================
  // Error Parsing
  // ==========================================

  /**
   * Parse an error response body from the Sequentum API.
   *
   * The API returns errors in two formats:
   *   - BadRequestError / InternalServerError: { statusCode, statusDescription, message, severity }
   *   - ProblemDetails (RFC 7807):             { type, title, status, detail, instance }
   *
   * This method tries both formats and returns a human-readable message.
   */
  private parseErrorBody(body: ApiErrorBody): string {
    // Try BadRequestError / InternalServerError format first (has 'message')
    if (body.message) {
      return body.message;
    }
    // Try ProblemDetails (RFC 7807) format (has 'detail' or 'title')
    if (body.detail) {
      return body.title ? `${body.title}: ${body.detail}` : body.detail;
    }
    if (body.title) {
      return body.title;
    }
    // Try statusDescription as last resort
    if (body.statusDescription) {
      return body.statusDescription;
    }
    return "";
  }

  /**
   * Parse the Retry-After header value into seconds.
   * Supports both delta-seconds (e.g. "120") and HTTP-date formats.
   * @returns seconds to wait, or null if header is missing/unparseable
   */
  private parseRetryAfter(response: Response): number | null {
    const header = response.headers.get("retry-after");
    if (!header) return null;

    // Try numeric (delta-seconds)
    const seconds = Number(header);
    if (!isNaN(seconds) && seconds >= 0) {
      return seconds;
    }

    // Try HTTP-date
    const date = new Date(header);
    if (!isNaN(date.getTime())) {
      const delayMs = date.getTime() - Date.now();
      return Math.max(0, Math.ceil(delayMs / 1000));
    }

    return null;
  }

  /**
   * Build a typed error from an HTTP error response.
   * Reads the response body, parses it as JSON (handling both API error formats),
   * and returns the appropriate error class.
   */
  private async buildErrorFromResponse(response: Response, endpoint: string): Promise<ApiRequestError> {
    let errorMessage = `API Error ${response.status}: ${response.statusText}`;

    try {
      const errorText = await response.text();
      if (errorText) {
        try {
          const errorJson = JSON.parse(errorText) as ApiErrorBody;
          const parsed = this.parseErrorBody(errorJson);
          if (parsed) {
            errorMessage = parsed;
          }
        } catch {
          // Not JSON — use raw text (but cap length to avoid huge HTML error pages)
          errorMessage = errorText.length > 500 ? errorText.substring(0, 500) + "..." : errorText;
        }
      }
    } catch {
      // Could not read body at all — use default message
    }

    // Return specialised subclass for 429
    if (response.status === 429) {
      const retryAfter = this.parseRetryAfter(response);
      return new RateLimitError(errorMessage, endpoint, retryAfter);
    }

    return new ApiRequestError(response.status, response.statusText, errorMessage, endpoint);
  }

  // ==========================================
  // Core HTTP Methods
  // ==========================================

  /**
   * Calculate delay for exponential backoff with jitter.
   * @param attempt - 0-based attempt number
   * @param retryAfterSeconds - Optional Retry-After hint from the server
   */
  private getRetryDelay(attempt: number, retryAfterSeconds: number | null): number {
    if (retryAfterSeconds !== null && retryAfterSeconds > 0) {
      // Respect Retry-After from server, capped at maxDelayMs
      return Math.min(retryAfterSeconds * 1000, this.maxDelayMs);
    }
    // Exponential backoff: base * 2^attempt, with ±25% jitter
    const exponential = this.baseDelayMs * Math.pow(2, attempt);
    const jitter = exponential * (0.75 + Math.random() * 0.5);
    return Math.min(jitter, this.maxDelayMs);
  }

  /**
   * Sleep for the given number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Core HTTP method used by both request<T>() and requestVoid().
   * Handles authentication, timeout, error parsing, and automatic retry
   * for transient failures (429, 502, 503, 504).
   *
   * @param endpoint - API path (e.g. "/api/v1/agent/all")
   * @param options - fetch() options (method, body, etc.)
   * @returns The raw Response object on success
   * @throws ApiRequestError (or subclass) on HTTP errors after retries are exhausted
   * @throws AuthenticationError if no credentials are configured
   * @throws Error on timeout or network failure
   */
  private async fetchWithRetry(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: this.getAuthorizationHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers as Record<string, string>),
    };

    const method = (options.method || "GET").toUpperCase();
    // Only retry on idempotent methods (GET, HEAD, PUT, DELETE, OPTIONS)
    // POST is NOT retried to avoid duplicate side effects (e.g. starting an agent twice)
    const isIdempotent = method !== "POST";
    const maxAttempts = isIdempotent ? this.maxRetries + 1 : 1;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        if (response.ok) {
          return response;
        }

        // Build typed error from response
        const error = await this.buildErrorFromResponse(response, endpoint);

        // Don't retry auth errors (401/403) — they won't resolve with retries
        if (error.isUnauthorized || error.isForbidden) {
          throw error;
        }

        // Check if this status code is retryable
        if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxAttempts - 1) {
          const retryAfter = error instanceof RateLimitError ? error.retryAfterSeconds : null;
          const delay = this.getRetryDelay(attempt, retryAfter);
          lastError = error;
          await this.sleep(delay);
          continue;
        }

        // Non-retryable error — throw immediately
        throw error;
      } catch (error) {
        if (error instanceof ApiRequestError || error instanceof AuthenticationError) {
          throw error;
        }
        if (error instanceof Error && error.name === "AbortError") {
          const timeoutError = new Error(`Request timeout after ${this.requestTimeoutMs}ms: ${endpoint}`);
          // Retry timeouts on idempotent requests
          if (attempt < maxAttempts - 1) {
            lastError = timeoutError;
            const delay = this.getRetryDelay(attempt, null);
            await this.sleep(delay);
            continue;
          }
          throw timeoutError;
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error(`Request failed after ${maxAttempts} attempts: ${endpoint}`);
  }

  /**
   * Make an authenticated request to the API and parse the JSON response.
   * Includes automatic retry for transient failures (429, 502, 503, 504) on
   * idempotent methods.
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await this.fetchWithRetry(endpoint, options);

    // Handle redirect for file downloads
    if (response.redirected) {
      return { redirectUrl: response.url } as T;
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return response.json() as Promise<T>;
    }

    return response.text() as unknown as T;
  }

  /**
   * Make an authenticated request that doesn't expect a response body.
   * Includes automatic retry for transient failures (429, 502, 503, 504) on
   * idempotent methods.
   */
  private async requestVoid(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<void> {
    await this.fetchWithRetry(endpoint, options);
    // 204 No Content or any success status — just return
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
    const body: Record<string, unknown> = {
      Name: request.name,
      IsEnabled: request.isEnabled ?? true,
      Parallelism: request.parallelism ?? 1,
    };
    if (request.scheduleType !== undefined) body.ScheduleType = request.scheduleType;
    if (request.cronExpression !== undefined) body.CronExpression = request.cronExpression;
    if (request.startTime !== undefined) body.StartTime = request.startTime;
    if (request.runEveryCount !== undefined) body.RunEveryCount = request.runEveryCount;
    if (request.runEveryPeriod !== undefined) body.RunEveryPeriod = request.runEveryPeriod;
    if (request.timezone !== undefined) body.Timezone = request.timezone;
    if (request.inputParameters !== undefined) body.InputParameters = request.inputParameters;
    if (request.parallelMaxConcurrency !== undefined) body.ParallelMaxConcurrency = request.parallelMaxConcurrency;
    if (request.parallelExport !== undefined) body.ParallelExport = request.parallelExport;
    if (request.logLevel !== undefined) body.LogLevel = request.logLevel;
    if (request.logMode !== undefined) body.LogMode = request.logMode;
    if (request.isExclusive !== undefined) body.IsExclusive = request.isExclusive;
    if (request.isWaitOnFailure !== undefined) body.IsWaitOnFailure = request.isWaitOnFailure;

    return this.request<AgentScheduleApiModel>(
      `/api/v1/agent/${agentId}/schedules`,
      {
        method: "POST",
        body: JSON.stringify(body),
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
   * Get a specific schedule by ID
   * @param agentId - The ID of the agent
   * @param scheduleId - The ID of the schedule
   * @returns The schedule details
   */
  async getAgentSchedule(agentId: number, scheduleId: number): Promise<AgentScheduleApiModel> {
    return this.request<AgentScheduleApiModel>(
      `/api/v1/agent/${agentId}/schedules/${scheduleId}`
    );
  }

  /**
   * Update an existing schedule
   * @param agentId - The ID of the agent
   * @param scheduleId - The ID of the schedule to update
   * @param request - The updated schedule configuration
   * @returns The updated schedule
   */
  async updateAgentSchedule(
    agentId: number,
    scheduleId: number,
    request: UpdateScheduleRequest
  ): Promise<AgentScheduleApiModel> {
    const body: Record<string, unknown> = { Name: request.name };
    if (request.scheduleType !== undefined) body.ScheduleType = request.scheduleType;
    if (request.cronExpression !== undefined) body.CronExpression = request.cronExpression;
    if (request.localSchedule !== undefined) body.LocalSchedule = request.localSchedule;
    if (request.startTime !== undefined) body.StartTime = request.startTime;
    if (request.runEveryCount !== undefined) body.RunEveryCount = request.runEveryCount;
    if (request.runEveryPeriod !== undefined) body.RunEveryPeriod = request.runEveryPeriod;
    if (request.timezone !== undefined) body.Timezone = request.timezone;
    if (request.inputParameters !== undefined) body.InputParameters = request.inputParameters;
    if (request.isEnabled !== undefined) body.IsEnabled = request.isEnabled;
    if (request.parallelism !== undefined) body.Parallelism = request.parallelism;
    if (request.parallelMaxConcurrency !== undefined) body.ParallelMaxConcurrency = request.parallelMaxConcurrency;
    if (request.parallelExport !== undefined) body.ParallelExport = request.parallelExport;
    if (request.proxyPoolId !== undefined) body.ProxyPoolId = request.proxyPoolId;
    if (request.serverGroupId !== undefined) body.ServerGroupId = request.serverGroupId;
    if (request.logLevel !== undefined) body.LogLevel = request.logLevel;
    if (request.logMode !== undefined) body.LogMode = request.logMode;
    if (request.isExclusive !== undefined) body.IsExclusive = request.isExclusive;
    if (request.isWaitOnFailure !== undefined) body.IsWaitOnFailure = request.isWaitOnFailure;

    return this.request<AgentScheduleApiModel>(
      `/api/v1/agent/${agentId}/schedules/${scheduleId}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      }
    );
  }

  /**
   * Enable a schedule so it runs according to its configuration
   * @param agentId - The ID of the agent
   * @param scheduleId - The ID of the schedule to enable
   */
  async enableAgentSchedule(agentId: number, scheduleId: number): Promise<void> {
    await this.requestVoid(
      `/api/v1/agent/${agentId}/schedules/${scheduleId}/enable`,
      { method: "POST" }
    );
  }

  /**
   * Disable a schedule so it will not run until re-enabled
   * @param agentId - The ID of the agent
   * @param scheduleId - The ID of the schedule to disable
   */
  async disableAgentSchedule(agentId: number, scheduleId: number): Promise<void> {
    await this.requestVoid(
      `/api/v1/agent/${agentId}/schedules/${scheduleId}/disable`,
      { method: "POST" }
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
    if (agentId !== undefined) params.append("agentId", String(agentId));
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
