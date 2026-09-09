import {
  getErrorDetails,
  getErrorMessage,
  hasMessage,
  isAxiosError,
  isError,
  logError,
  toError,
} from './errors';

describe('isError', () => {
  test('true for a real Error instance', () => {
    expect(isError(new Error('boom'))).toBe(true);
  });

  test('false for a plain object, string, or null', () => {
    expect(isError({ message: 'boom' })).toBe(false);
    expect(isError('boom')).toBe(false);
    expect(isError(null)).toBe(false);
  });
});

describe('hasMessage', () => {
  test('true for an object with a string message property', () => {
    expect(hasMessage({ message: 'boom' })).toBe(true);
  });

  test('false when message is missing, non-string, or the value is not an object', () => {
    expect(hasMessage({})).toBe(false);
    expect(hasMessage({ message: 42 })).toBe(false);
    expect(hasMessage('boom')).toBe(false);
    expect(hasMessage(null)).toBe(false);
  });
});

describe('isAxiosError', () => {
  test('true when isAxiosError: true is present', () => {
    expect(isAxiosError({ isAxiosError: true, message: 'Request failed' })).toBe(true);
  });

  test('false for a plain Error or object without the flag', () => {
    expect(isAxiosError(new Error('boom'))).toBe(false);
    expect(isAxiosError({ message: 'boom' })).toBe(false);
    expect(isAxiosError(null)).toBe(false);
  });
});

describe('getErrorMessage', () => {
  test('extracts the message from a standard Error', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  test('extracts the message from an Axios-shaped error', () => {
    expect(getErrorMessage({ isAxiosError: true, message: 'Request failed with status 500' })).toBe(
      'Request failed with status 500'
    );
  });

  test('extracts the message from a plain object with a message property', () => {
    expect(getErrorMessage({ message: 'plain object error' })).toBe('plain object error');
  });

  test('returns a string error as-is', () => {
    expect(getErrorMessage('a string error')).toBe('a string error');
  });

  test('returns a fallback for null/undefined', () => {
    expect(getErrorMessage(null)).toBe('Unknown error occurred');
    expect(getErrorMessage(undefined)).toBe('Unknown error occurred');
  });

  test('stringifies an unrecognized object shape', () => {
    expect(getErrorMessage({ foo: 'bar' })).toBe('{"foo":"bar"}');
  });

  test('falls back for an empty object (stringifies to "{}")', () => {
    expect(getErrorMessage({})).toBe('Unknown error occurred');
  });

  test('falls back safely for a value that cannot be stringified (circular reference)', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(getErrorMessage(circular)).toBe('Unknown error occurred');
  });
});

describe('getErrorDetails', () => {
  test('checks the Axios branch before the generic Error branch (AxiosError extends Error)', () => {
    const axiosLikeError = Object.assign(new Error('Request failed with status code 400'), {
      isAxiosError: true,
      response: { status: 400, data: { message: 'Bad Request' } },
    });

    const details = getErrorDetails(axiosLikeError);
    expect(details.type).toBe('AxiosError');
    expect(details.status).toBe(400);
    expect(details.response).toEqual({ message: 'Bad Request' });
    expect(details.stack).toBeDefined();
  });

  test('omits the stack when the axios-shaped error is not a real Error instance', () => {
    const plainAxiosShape = {
      isAxiosError: true,
      message: 'Request failed',
      response: { status: 500, data: {} },
    };

    const details = getErrorDetails(plainAxiosShape);
    expect(details.type).toBe('AxiosError');
    expect(details.stack).toBeUndefined();
  });

  test('extracts message/stack/type from a standard Error', () => {
    class CustomError extends Error {}
    const details = getErrorDetails(new CustomError('custom failure'));
    expect(details.message).toBe('custom failure');
    expect(details.type).toBe('CustomError');
    expect(details.stack).toBeDefined();
  });

  test('falls back to message/type for a non-Error value', () => {
    const details = getErrorDetails('a plain string error');
    expect(details).toEqual({ message: 'a plain string error', type: 'string' });
  });
});

describe('toError', () => {
  test('preserves an existing Error instance, replacing its message', () => {
    const original = new Error('original message');
    const result = toError(original);
    expect(result).toBe(original);
    expect(result.message).toBe('original message');
  });

  test('creates a new Error from a non-Error value', () => {
    const result = toError('a string error');
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('a string error');
  });

  test('prefixes the message with the given context', () => {
    const result = toError('boom', 'fetchNorms');
    expect(result.message).toBe('fetchNorms: boom');
  });
});

describe('logError', () => {
  function makeLogger() {
    return { error: jest.fn(), warn: jest.fn() };
  }

  test('logs at error level with structured error details and extra context', () => {
    const logger = makeLogger();
    logError(logger, 'error', 'Fetch failed', new Error('boom'), { requestId: 'r1' });

    expect(logger.error).toHaveBeenCalledWith(
      'Fetch failed',
      expect.objectContaining({ message: 'boom', requestId: 'r1' })
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('logs at warn level when requested', () => {
    const logger = makeLogger();
    logError(logger, 'warn', 'Retrying', new Error('transient'));

    expect(logger.warn).toHaveBeenCalledWith(
      'Retrying',
      expect.objectContaining({ message: 'transient' })
    );
    expect(logger.error).not.toHaveBeenCalled();
  });
});
