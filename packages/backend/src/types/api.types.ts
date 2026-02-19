/**
 * API Request and Response type definitions
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ChainExecutionRequest {
  chainId?: string;
  dmnIds?: string[]; // Manual chain specification
  inputs: Record<string, unknown>;
  endpoint?: string; // Optional TriplyDB endpoint for DMN lookup
  options?: {
    includeIntermediateSteps?: boolean;
    timeout?: number;
  };
  // NEW: DRD execution parameters
  isDrd?: boolean;
  drdEntryPointId?: string;
}

export interface ChainDiscoveryRequest {
  from?: string; // Starting DMN identifier
  to?: string; // Target DMN identifier
  maxDepth?: number;
  algorithm?: 'dfs' | 'bfs';
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  services: {
    triplydb: ServiceStatus;
    operaton: ServiceStatus;
  };
}

export interface ServiceStatus {
  status: 'up' | 'down' | 'unknown';
  latency?: number;
  lastCheck: string;
  error?: string;
}
