import { isPublicPath } from './publicPaths';

// isPublicPath decides which requests get wildcard CORS (origin '*', GET/OPTIONS,
// no credentials) instead of the credentialed allowlist in index.ts. Everything it
// returns true for is readable cross-origin by any site, so it must be exact.
describe('isPublicPath', () => {
  test.each(['/v1/ropa/public', '/v1/bundles/public'])(
    'treats the public mount %s as public',
    (p) => {
      expect(isPublicPath(p)).toBe(true);
    }
  );

  test.each(['/v1/ropa/public/', '/v1/bundles/public/abc'])(
    'treats a path below a public mount (%s) as public',
    (p) => {
      expect(isPublicPath(p)).toBe(true);
    }
  );

  test.each(['/v1/dmns', '/v1/assets/ropa', '/v1/ropa', '/'])('treats %s as not public', (p) => {
    expect(isPublicPath(p)).toBe(false);
  });
  // The defect: a bare prefix match hands wildcard CORS to any sibling route whose
  // name merely begins with "public". No such route exists today -- the mount table
  // in routes/registry.ts has none -- which is exactly why it would arrive unnoticed.
  test.each(['/v1/ropa/publications', '/v1/ropa/public-admin', '/v1/bundles/publicity'])(
    'does not treat the sibling route %s as public',
    (p) => {
      expect(isPublicPath(p)).toBe(false);
    }
  );
});
