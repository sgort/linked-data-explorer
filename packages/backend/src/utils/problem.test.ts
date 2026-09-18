import { Request, Response } from 'express';
import { ProblemCode, sendProblem } from './problem';

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.type = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

function mockReq(originalUrl: string): Request {
  return { originalUrl } as Request;
}

describe('sendProblem', () => {
  test('sets the status, content type, and the RFC 9457 body members', () => {
    const res = mockRes();
    const req = mockReq('/v1/assets/bpmn');

    sendProblem(res, req, { status: 500, detail: 'boom', code: 'LIST_FAILED' });

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.type).toHaveBeenCalledWith('application/problem+json');
    expect(res.json).toHaveBeenCalledWith({
      type: 'about:blank',
      status: 500,
      title: 'List failed',
      detail: 'boom',
      instance: '/v1/assets/bpmn',
      code: 'LIST_FAILED',
    });
  });

  test('strips the query string from instance', () => {
    const res = mockRes();
    const req = mockReq('/v1/norms?rulesetid=abc&applicable_date=2026-01-01');

    sendProblem(res, req, { status: 400, detail: 'bad', code: 'INVALID_PARAM' });

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ instance: '/v1/norms' }));
  });

  test('the same code always produces the same title', () => {
    const res1 = mockRes();
    const res2 = mockRes();

    sendProblem(res1, mockReq('/v1/a'), { status: 500, detail: 'one', code: 'DELETE_FAILED' });
    sendProblem(res2, mockReq('/v1/b'), { status: 500, detail: 'two', code: 'DELETE_FAILED' });

    const title1 = (res1.json as jest.Mock).mock.calls[0][0].title;
    const title2 = (res2.json as jest.Mock).mock.calls[0][0].title;
    expect(title1).toBe(title2);
  });

  test('an explicit title overrides the code lookup', () => {
    const res = mockRes();
    sendProblem(res, mockReq('/v1/dso/begrippen'), {
      status: 502,
      detail: 'catalogus unavailable',
      title: 'Upstream request failed',
    });

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Upstream request failed' })
    );
    expect((res.json as jest.Mock).mock.calls[0][0]).not.toHaveProperty('code');
  });

  test('omits code when none is given', () => {
    const res = mockRes();
    sendProblem(res, mockReq('/v1/dso/begrippen'), {
      status: 502,
      detail: 'catalogus unavailable',
      title: 'Upstream request failed',
    });

    expect((res.json as jest.Mock).mock.calls[0][0]).not.toHaveProperty('code');
  });

  test('merges extension members into the body', () => {
    const res = mockRes();
    sendProblem(res, mockReq('/v1/chains/execute'), {
      status: 500,
      detail: 'A DMN in the chain failed',
      title: 'Chain execution failed',
      extensions: { data: { chainId: 'a->b', executionTime: 12, finalOutputs: {} } },
    });

    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({
      data: { chainId: 'a->b', executionTime: 12, finalOutputs: {} },
    });
  });

  test('a custom type overrides the about:blank default', () => {
    const res = mockRes();
    sendProblem(res, mockReq('/v1/x'), {
      status: 400,
      detail: 'bad',
      code: 'INVALID_REQUEST',
      type: 'https://example.org/problems/invalid-request',
    });

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'https://example.org/problems/invalid-request' })
    );
  });

  // sendProblem runs inside error paths, often in the catch of an async
  // handler that Express 4 does not await. Throwing there would become an
  // unhandled rejection and stop the process, so a missing title must fall
  // back to the status's standard reason phrase instead.
  test('falls back to the standard reason phrase when there is no code and no title', () => {
    const res = mockRes();

    expect(() => sendProblem(res, mockReq('/v1/x'), { status: 503, detail: 'boom' })).not.toThrow();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 503, title: 'Service Unavailable' })
    );
  });

  test('falls back rather than throwing for a code unknown at runtime', () => {
    // The ProblemCode type rules this out at compile time; the cast stands in
    // for a value that arrives untyped, so the runtime guard is still proven.
    const res = mockRes();

    expect(() =>
      sendProblem(res, mockReq('/v1/x'), {
        status: 500,
        detail: 'boom',
        code: 'MADE_UP_CODE' as ProblemCode,
      })
    ).not.toThrow();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500, title: 'Internal Server Error', code: 'MADE_UP_CODE' })
    );
  });

  test('an extension cannot overwrite the problem members', () => {
    const res = mockRes();
    sendProblem(res, mockReq('/v1/x'), {
      status: 400,
      detail: 'the real detail',
      code: 'INVALID_REQUEST',
      extensions: { status: 200, title: 'forged', detail: 'forged', code: 'forged', extra: 1 },
    });

    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({
      status: 400,
      title: 'Invalid request',
      detail: 'the real detail',
      code: 'INVALID_REQUEST',
      extra: 1,
    });
  });
});
