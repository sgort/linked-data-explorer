/**
 * RFC 9457 problem details, one way to answer every error response.
 *
 * Used by the global error handler (`middleware/error.middleware.ts`) and by
 * every route that answers an error itself. See
 * https://github.com/sgort/linked-data-explorer/issues/131.
 *
 * `type` is `about:blank` unless a caller overrides it: this API has no
 * documentation page per problem kind, and `about:blank` is the RFC's own
 * placeholder for exactly that case (its meaning is "see `title`").
 *
 * `code` survives as an extension member alongside the RFC's own
 * `status`/`title`/`detail`/`instance` -- it is the machine-readable
 * identifier existing callers already branch on, and the ADR 2.2.1 ruleset's
 * `nlgov:problem-schema-members` rule allows extra members.
 */

import { STATUS_CODES } from 'http';

import { Request, Response } from 'express';

/**
 * Stable titles for the `code` values handlers already set, so the same
 * kind of problem always gets the same `title`. Add an entry here rather
 * than passing a one-off `title` string at a new call site.
 *
 * Declared `as const` so `ProblemCode` below is the set of its keys: a code
 * that is not listed here does not compile, rather than being discovered at
 * runtime inside an error path.
 */
const CODE_TITLES = {
  INTERNAL_ERROR: 'Internal server error',
  NOT_FOUND: 'Not found',
  DB_NOT_CONFIGURED: 'Storage not configured',
  LIST_FAILED: 'List failed',
  UPSERT_FAILED: 'Save failed',
  DELETE_FAILED: 'Delete failed',
  DEPLOY_MARK_FAILED: 'Deploy record failed',
  LOOKUP_FAILED: 'Lookup failed',
  QUERY_ERROR: 'Query failed',
  CACHE_ERROR: 'Cache operation failed',
  INVALID_REQUEST: 'Invalid request',
  INVALID_INPUT: 'Invalid request',
  INVALID_PARAM: 'Invalid request',
  EXECUTION_ERROR: 'Chain execution failed',
  DISCOVERY_ERROR: 'Chain discovery failed',
  OPENAPI_UNAVAILABLE: 'OpenAPI description unavailable',
  DMN_NOT_FOUND: 'DMN not found',
  DMN_FETCH_FAILED: 'DMN fetch failed',
  DRD_DEPLOY_FAILED: 'DRD deploy failed',
  PROCESS_DEPLOY_FAILED: 'Process deploy failed',
  DMN_DEPLOY_FAILED: 'DMN deploy failed',
  VALIDATION_ERROR: 'Validation failed',
  VARIABLE_HINTS_FAILED: 'Variable hints unavailable',
  EDOCS_STATUS_FAILED: 'eDOCS status check failed',
  EDOCS_WORKSPACE_FAILED: 'eDOCS workspace request failed',
  EDOCS_UPLOAD_FAILED: 'eDOCS upload failed',
  EDOCS_DOCUMENTS_FAILED: 'eDOCS document list failed',
} as const satisfies Record<string, string>;

/** A `code` this API answers with; each has a stable title above. */
export type ProblemCode = keyof typeof CODE_TITLES;

export interface ProblemInit {
  /** HTTP status, repeated in the body per RFC 9457. */
  status: number;
  /** What went wrong with *this* request. */
  detail: string;
  /**
   * The machine-readable identifier this handler already sets, kept as an
   * extension member. When given and `title` is omitted, it selects a title
   * from `CODE_TITLES` -- every call site for the same `code` then gets the
   * same `title` without repeating the string.
   */
  code?: ProblemCode;
  /**
   * A short, stable, human-readable summary of the *kind* of problem. Only
   * needed when there is no `code`, or the `code` is new and has no entry in
   * `CODE_TITLES` yet.
   */
  title?: string;
  /** Defaults to `about:blank` -- see the module comment. */
  type?: string;
  /**
   * Additional extension members. They cannot replace the members above:
   * those are written after the extensions, so a stray `status` or `detail`
   * here never changes what the problem says.
   */
  extensions?: Record<string, unknown>;
}

/**
 * Send an `application/problem+json` response: `status`, `title`, `detail`
 * and `instance` (the request path), plus `code` and any `extensions` the
 * caller passes.
 *
 * This function must never throw. It runs inside error paths — often in a
 * `catch` block of an async handler, which Express 4 does not await — so an
 * exception here would become an unhandled rejection and take the process
 * down. A missing title therefore falls back to the status's standard reason
 * phrase instead of throwing.
 */
export function sendProblem(res: Response, req: Request, init: ProblemInit): void {
  const { status, detail, code, type = 'about:blank', extensions } = init;
  const title =
    init.title ?? (code ? CODE_TITLES[code] : undefined) ?? STATUS_CODES[status] ?? 'Error';

  const body: Record<string, unknown> = {
    ...extensions,
    type,
    status,
    title,
    detail,
    instance: req.originalUrl.split('?')[0],
    ...(code !== undefined ? { code } : {}),
  };

  res.status(status).type('application/problem+json').json(body);
}
