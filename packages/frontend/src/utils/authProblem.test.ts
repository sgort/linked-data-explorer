import { describe, expect, test } from 'vitest';

import { authProblemMessage } from './authProblem';

describe('authProblemMessage (#163)', () => {
  test('401 asks to sign in', () => {
    expect(authProblemMessage(401, 'deploy')).toBe('Sign in to deploy');
  });

  test('403 says the permission is missing', () => {
    expect(authProblemMessage(403, 'save')).toBe('You need permission to save');
  });

  test('anything else is not a sign-in problem', () => {
    expect(authProblemMessage(500, 'deploy')).toBeNull();
    expect(authProblemMessage(undefined, 'deploy')).toBeNull();
  });
});
