/**
 * One value placed in an Operaton URL path (#415 in ronl-business-api).
 *
 * The backend calls the engine as an operaton-admin account, its evaluate and
 * read routes are anonymous (since #163 the writes need an author's token,
 * except a test deploy), and Express has already decoded route parameters, so
 * a caller's "x/../../process-instance?" would otherwise reach a different
 * engine endpoint with admin rights. Every
 * interpolated path value goes through here: encodeURIComponent, with ":" left
 * readable for definition IDs (key:version:uuid), and the segments "." and ".."
 * (which encodeURIComponent leaves alone) refused outright.
 */
export function engineSegment(value: string): string {
  if (value === '' || value === '.' || value === '..') {
    throw new Error(`Invalid Operaton path segment: ${JSON.stringify(value)}`);
  }
  return encodeURIComponent(value).replace(/%3A/gi, ':');
}
