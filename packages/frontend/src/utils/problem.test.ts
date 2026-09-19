import { describe, expect, test } from 'vitest';

import { getProblemDetail } from './problem';

describe('getProblemDetail', () => {
  test('reads detail from a problem response', () => {
    expect(
      getProblemDetail(
        { type: 'about:blank', status: 500, title: 'List failed', detail: 'db unavailable' },
        'fallback'
      )
    ).toBe('db unavailable');
  });

  test('falls back when detail is missing', () => {
    expect(getProblemDetail({ status: 500 }, 'fallback')).toBe('fallback');
  });

  test('falls back when detail is not a string', () => {
    expect(getProblemDetail({ detail: { nested: true } }, 'fallback')).toBe('fallback');
  });

  test('falls back for null, undefined, or a non-object body', () => {
    expect(getProblemDetail(null, 'fallback')).toBe('fallback');
    expect(getProblemDetail(undefined, 'fallback')).toBe('fallback');
    expect(getProblemDetail('a plain string', 'fallback')).toBe('fallback');
  });

  test('falls back for the old envelope shape, which has no top-level detail', () => {
    expect(
      getProblemDetail({ success: false, error: { code: 'LIST_FAILED', message: 'x' } }, 'fallback')
    ).toBe('fallback');
  });
});
