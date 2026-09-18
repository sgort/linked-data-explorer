/**
 * Reads the `detail` member of an RFC 9457 problem response
 * (`application/problem+json`), which is what the backend now answers for
 * every error (https://github.com/sgort/linked-data-explorer/issues/131).
 *
 * `body` is whatever a `fetch(...).json()` call produced -- untyped, and not
 * guaranteed to be a problem response at all (a network error, or a response
 * this reader has never seen, falls through to `fallback`).
 */
export function getProblemDetail(body: unknown, fallback: string): string {
  if (
    body !== null &&
    typeof body === 'object' &&
    'detail' in body &&
    typeof (body as { detail: unknown }).detail === 'string'
  ) {
    return (body as { detail: string }).detail;
  }
  return fallback;
}
