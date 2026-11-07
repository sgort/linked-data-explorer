/**
 * operatonBasicAuth (#415 in ronl-business-api): the credentials every call to
 * Operaton sends, now that its engine-rest requires a login.
 */

const mockConfig = { operaton: {} as { username?: string; password?: string } };
jest.mock('./config', () => ({ __esModule: true, config: mockConfig, default: mockConfig }));

import { operatonBasicAuth } from './operaton-auth';

describe('operatonBasicAuth', () => {
  afterEach(() => {
    mockConfig.operaton = {};
  });

  test('returns the given username and password', () => {
    expect(operatonBasicAuth('u', 'p')).toEqual({ username: 'u', password: 'p' });
  });

  test('returns undefined without a password', () => {
    expect(operatonBasicAuth('u', '')).toBeUndefined();
  });

  test('returns undefined without a username', () => {
    expect(operatonBasicAuth('', 'p')).toBeUndefined();
  });

  test('defaults to the configured Operaton credentials', () => {
    mockConfig.operaton = { username: 'svc', password: 'pw' };
    expect(operatonBasicAuth()).toEqual({ username: 'svc', password: 'pw' });
  });

  test('returns undefined when nothing is configured', () => {
    expect(operatonBasicAuth()).toBeUndefined();
  });
});
