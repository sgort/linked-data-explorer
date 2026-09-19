import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { getErrorMessage, getErrorDetails } from '../utils/errors';
import { sendProblem } from '../utils/problem';

/**
 * The app-wide `express.json`/`express.urlencoded` body-size limit
 * (see `index.ts`). Named in the 413 `detail` below only as a fallback, when
 * a body-parser error carries no `limit` of its own — a route with its own,
 * smaller limit (e.g. the CSP report collector's 64 kb, #161) throws an
 * error whose `limit` names *that* limit instead, and the 413 names it, not
 * this constant.
 */
export const BODY_SIZE_LIMIT = '10mb';

/**
 * The `type` strings body-parser (via `raw-body`) sets on errors it creates.
 * See https://github.com/sgort/linked-data-explorer/issues/143.
 *
 * A body-parser error also carries a `status`/`statusCode` that is already
 * the right HTTP status for what went wrong, but a *thrown* application
 * error can carry a `status` property too (an `HttpError`, a proxied
 * upstream failure) without being a body-parser error at all. So this
 * recognises one by its `type` -- a string only body-parser itself sets --
 * never by the mere presence of `status`: that is what stops an arbitrary
 * thrown error from choosing its own response status.
 */
const BODY_PARSER_ERROR_TYPES = new Set([
  'entity.parse.failed', // body is not valid JSON/urlencoded data
  'entity.too.large', // body (or, for urlencoded, its field count) over BODY_SIZE_LIMIT
  'charset.unsupported', // Content-Type names a charset this server cannot decode
  'encoding.unsupported', // Content-Encoding this server cannot inflate
  'request.aborted', // client disconnected before the body finished
  'request.size.invalid', // body length did not match Content-Length
  'parameters.too.many', // urlencoded body has too many keys
  'querystring.parse.rangeError', // urlencoded body nests deeper than qs allows
]);

interface BodyParserError {
  type: string;
  status?: number;
  statusCode?: number;
  message?: string;
  /** The limit (bytes) body-parser/raw-body actually enforced for entity.too.large. */
  limit?: number;
}

/**
 * A byte count as a short, human-readable size ("16 kB", "10 MB"), for the
 * 413 detail below. Binary units (1024, not 1000) since that is what
 * body-parser's own `limit` option means (bytes.parse('16kb') === 16384).
 */
function formatBytes(bytes: number): string {
  const format = (value: number, unit: string) =>
    `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;

  if (bytes >= 1024 * 1024) return format(bytes / (1024 * 1024), 'MB');
  if (bytes >= 1024) return format(bytes / 1024, 'kB');
  return `${bytes} B`;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    typeof (err as { type: unknown }).type === 'string' &&
    BODY_PARSER_ERROR_TYPES.has((err as { type: string }).type)
  );
}

/**
 * Answer a body-parser error with the status it already carries, instead of
 * the 500 the generic handler below would give it.
 */
function sendBodyParserProblem(res: Response, req: Request, err: BodyParserError): void {
  switch (err.type) {
    case 'entity.parse.failed':
      sendProblem(res, req, {
        status: 400,
        code: 'MALFORMED_BODY',
        detail: 'The request body could not be parsed.',
      });
      return;
    case 'entity.too.large': {
      // body-parser/raw-body sets `limit` (bytes) to whatever this specific
      // parser was actually configured with -- BODY_SIZE_LIMIT is only the
      // app-wide default (index.ts) and would misreport a route with its own
      // smaller limit (e.g. the CSP report collector's 16 kb, #161).
      const limit = typeof err.limit === 'number' ? formatBytes(err.limit) : BODY_SIZE_LIMIT;
      sendProblem(res, req, {
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
        detail: `The request body exceeds the ${limit} limit.`,
      });
      return;
    }
    default: {
      // charset.unsupported / encoding.unsupported (415), request.aborted /
      // request.size.invalid (400), parameters.too.many (413, urlencoded
      // only): each is a real but rare way for a client to misbehave, body-
      // parser already set the right status for it, and none is part of
      // this API's documented contract the way the 400/413 above are -- so
      // one shared code covers all of them rather than one each.
      const status = err.status ?? err.statusCode ?? 400;
      sendProblem(res, req, {
        status,
        code: 'INVALID_BODY',
        detail: err.message ?? 'The request body could not be processed.',
      });
    }
  }
}

/**
 * Global error handling middleware
 */
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const errorDetails = getErrorDetails(err);

  logger.error('Unhandled error', {
    ...errorDetails,
    path: req.path,
    method: req.method,
  });

  if (isBodyParserError(err)) {
    sendBodyParserProblem(res, req, err);
    return;
  }

  sendProblem(res, req, {
    status: 500,
    code: 'INTERNAL_ERROR',
    detail: process.env.NODE_ENV === 'production' ? 'Internal server error' : getErrorMessage(err),
    extensions: {
      details: process.env.NODE_ENV === 'development' ? errorDetails.stack : undefined,
    },
  });
};

/**
 * 404 handler
 */
export const notFoundHandler = (req: Request, res: Response) => {
  sendProblem(res, req, {
    status: 404,
    code: 'NOT_FOUND',
    detail: `Endpoint not found: ${req.method} ${req.path}`,
  });
};
