/**
 * Sequentum API Type Definitions
 * These types match the API models from the Sequentum Control Center
 */

/**
 * Represents a web scraping agent configuration
 */
export interface AgentApiModel {
  id?: number;
  name?: string;
  description?: string;
  documentation?: string;
  icon?: string;
  image?: Uint8Array;
  inputParameters?: Record<string, string>;
  configType: ConfigType;
  proxyPoolId?: number;
  spaceId?: number;
  startUrl?: string;
  status?: number;
  userId?: number;
  validationStatus?: ConfigValidationStatus;
  version: number;
  created?: string;
  updated?: string;
  lastActivity?: string;
  agentTemplates?: string;
}

/**
 * Represents a run/execution of an agent
 */
export interface AgentRunApiModel {
  id: number;
  configId: number;
  organizationId: number;
  status: RunStatus;
  startTime?: string;
  endTime?: string;
  startedBy?: string;
  errorMessage?: string;
  recordsExtracted?: number;
  recordsExported?: number;
  parallelism?: number;
  parallelSet?: number;
  logLevel?: LogLevel;
  logMode?: LogMode;
}

/**
 * Represents an output file from an agent run
 */
export interface AgentRunFileApiModel {
  id: number;
  name: string;
  fileType: string;
  fileSize: number;
  created: string;
  regionId?: number;
}

/**
 * Represents a version history entry for an agent
 */
export interface AgentVersionModel {
  userName: string;
  version: number;
  created: string;
  comments?: string;
  fileSize: number;
}

/**
 * Request model for starting an agent
 */
export interface StartAgentRequest {
  inputParameters?: string;
  parallelism?: number;
  parallelMaxConcurrency?: number;
  parallelExport?: ParallelExport;
  proxyPoolId?: number;
  timeout?: number;
  isExclusive?: boolean;
  isWaitOnFailure?: boolean;
  isRunSynchronously?: boolean;
  logLevel?: LogLevel;
  logMode?: LogMode;
}

/**
 * Agent last run status enum - represents the RunStatus from the last execution
 * Used for filtering agents by their last run result
 */
export enum AgentRunStatus {
  Invalid = 0,
  Running = 1,
  Exporting = 2,
  Starting = 3,
  Queuing = 4,
  Stopping = 5,
  Failure = 6,
  Failed = 7,
  Stopped = 8,
  Completed = 9,
  Success = 10,
  Skipped = 11,
  Waiting = 12,
}

/**
 * Configuration type enum
 */
export enum ConfigType {
  Agent = "Agent",
  Command = "Command",
  Api = "Api",
  Shared = "Shared",
}

/**
 * Run status enum
 */
export enum RunStatus {
  Unknown = "Unknown",
  Queuing = "Queuing",
  Queued = "Queued",
  Starting = "Starting",
  Running = "Running",
  Stopping = "Stopping",
  Stopped = "Stopped",
  Completed = "Completed",
  CompletedWithErrors = "CompletedWithErrors",
  Failed = "Failed",
  FailedToStart = "FailedToStart",
  WaitingOnFailure = "WaitingOnFailure",
}

/**
 * Log level enum
 */
export enum LogLevel {
  Trace = "Trace",
  Debug = "Debug",
  Info = "Info",
  Warning = "Warning",
  Error = "Error",
  Critical = "Critical",
}

/**
 * Log mode enum
 */
export enum LogMode {
  Text = "Text",
  Json = "Json",
}

/**
 * Parallel export enum
 */
export enum ParallelExport {
  Combined = "Combined",
  Separate = "Separate",
}

/**
 * Validation status enum
 */
export enum ConfigValidationStatus {
  Unknown = "Unknown",
  Valid = "Valid",
  Invalid = "Invalid",
  Warning = "Warning",
}

/**
 * API error response
 */
export interface ApiError {
  message: string;
  severity?: string;
  statusCode?: number;
}

/**
 * Request model for filtering agents
 */
export interface ListAgentsRequest {
  /** Filter by agent's last run status (RunStatus enum value) */
  status?: AgentRunStatus;
  /** Filter by space ID */
  spaceId?: number;
  /** Search by agent name (partial match) - maps to API 'name' parameter */
  search?: string;
  /** Filter by configuration type */
  configType?: ConfigType;
  /** Column to sort by (e.g., "name", "lastActivity", "created", "updated") - maps to API 'sortColumn' */
  sortColumn?: string;
  /** Sort order: 0 = ascending (default), 1 = descending - maps to API 'sortOrder' */
  sortOrder?: number;
  /** Page index for pagination (1-based) */
  pageIndex?: number;
  /** Number of records per page */
  recordsPerPage?: number;
}

/**
 * Paginated response for agent list
 */
export interface PaginatedAgentsResponse {
  /** Array of agents */
  data: AgentApiModel[];
  /** Total number of agents matching the query */
  totalCount: number;
  /** Current page index */
  pageIndex: number;
  /** Number of records per page */
  recordsPerPage: number;
}

// ==========================================
// Schedule Types
// ==========================================

/**
 * Represents a scheduled task for an agent
 */
export interface AgentScheduleApiModel {
  id: number;
  configId: number;
  name?: string;
  schedule?: string;
  localSchedule?: string;
  timezone?: string;
  nextRunTime?: string;
  startTime?: string;
  scheduleType?: string;
  isEnabled: boolean;
  runEveryCount?: number;
  runEveryPeriod?: number;
  inputParameters?: string;
  parallelism?: number;
  parallelMaxConcurrency?: number;
  parallelExport?: string;
  proxyPoolId?: number;
  logLevel?: string;
  logMode?: string;
  created: string;
  updated: string;
}

/**
 * Request model for creating a schedule
 */
export interface CreateScheduleRequest {
  name: string;
  cronExpression?: string;
  localSchedule?: string;
  timezone?: string;
  /** Start time in ISO 8601 format (UTC). Required for RunOnce, optional for RunEvery, not used for CRON. */
  startTime?: string;
  inputParameters?: string;
  isEnabled?: boolean;
  parallelism?: number;
  /** Schedule type: 0=None, 1=RunOnce, 2=RunEvery, 3=CRON */
  scheduleType?: number;
  /** How many periods for RunEvery schedule type */
  runEveryCount?: number;
  /** Period unit: 1=minutes, 2=hours, 3=days, 4=weeks, 5=months */
  runEveryPeriod?: number;
}

/**
 * Response model for upcoming scheduled runs
 */
export interface UpcomingScheduleApiModel {
  scheduleId: number;
  agentId: number;
  agentName?: string;
  scheduleName?: string;
  nextRunTime?: string;
  timezone?: string;
  isEnabled: boolean;
}

// ==========================================
// Billing/Credits Types
// ==========================================

/**
 * Response model for credits balance
 */
export interface CreditsBalanceApiModel {
  availableCredits: number;
  organizationId: number;
  retrievedAt: string;
}

/**
 * Response model for spending summary
 */
export interface SpendingSummaryApiModel {
  totalSpent: number;
  startDate: string;
  endDate: string;
  organizationId: number;
  currentBalance: number;
}

/**
 * Individual credit transaction record
 */
export interface CreditTransactionApiModel {
  id: number;
  transactionType?: string;
  amount: number;
  balance: number;
  created: string;
  expiresAt?: string;
  message?: string;
}

/**
 * Response model for credit history
 */
export interface CreditHistoryApiModel {
  transactions: CreditTransactionApiModel[];
  totalCount: number;
  pageIndex: number;
  recordsPerPage: number;
}

// ==========================================
// Space Types
// ==========================================

/**
 * Response model for a space
 */
export interface SpaceApiModel {
  id: number;
  name: string;
  description?: string;
  organizationId: number;
  created: string;
  updated: string;
  isDefaultAccess: boolean;
}

/**
 * Agent summary for space listing
 */
export interface SpaceAgentApiModel {
  id: number;
  name: string;
  description?: string;
  configType: string;
  status?: number;
  validationStatus?: string;
  lastActivity?: string;
}

/**
 * Result of running all agents in a space
 */
export interface RunSpaceAgentsResultApiModel {
  spaceId: number;
  spaceName: string;
  totalAgents: number;
  agentsStarted: number;
  agentsFailed: number;
  results: AgentRunResultApiModel[];
}

/**
 * Individual agent run result
 */
export interface AgentRunResultApiModel {
  agentId: number;
  agentName: string;
  success: boolean;
  runId?: number;
  errorMessage?: string;
}

// ==========================================
// Analytics Types
// ==========================================

/**
 * Response model for runs summary
 */
export interface RunsSummaryApiModel {
  startDate: string;
  endDate: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  completedWithErrorsRuns: number;
  runningRuns: number;
  queuedRuns: number;
  stoppedRuns: number;
  failedRunDetails?: FailedRunSummaryApiModel[];
}

/**
 * Summary of a failed run
 */
export interface FailedRunSummaryApiModel {
  runId: number;
  agentId: number;
  agentName: string;
  startTime?: string;
  endTime?: string;
  status: string;
  errorMessage?: string;
  spaceId?: number;
  spaceName?: string;
}

/**
 * Response model for records summary
 */
export interface RecordsSummaryApiModel {
  startDate: string;
  endDate: string;
  totalRecordsExtracted: number;
  totalRecordsExported: number;
  totalErrors: number;
  totalPageLoads: number;
  runCount: number;
  agentId?: number;
}

/**
 * Response model for run diagnostics
 */
export interface RunDiagnosticsApiModel {
  runId: number;
  agentId: number;
  agentName: string;
  status: string;
  errorMessage?: string;
  startTime?: string;
  endTime?: string;
  runtimeSeconds?: number;
  stats?: RunStatsApiModel;
  possibleCauses: string[];
  suggestedActions: string[];
}

/**
 * Run statistics
 */
export interface RunStatsApiModel {
  dataCount: number;
  inputCount?: number;
  errorCount: number;
  pageCount: number;
  exportCount?: number;
  traffic?: number;
}

