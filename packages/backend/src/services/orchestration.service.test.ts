import { DmnModel } from '../types/dmn.types';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('./operaton.service', () => ({
  __esModule: true,
  operatonService: { evaluateDecision: jest.fn(), extractValues: jest.fn() },
}));
jest.mock('./sparql.service', () => ({
  __esModule: true,
  sparqlService: { getDmnByIdentifier: jest.fn() },
}));

import { operatonService } from './operaton.service';
import { sparqlService } from './sparql.service';
import { OrchestrationService, orchestrationService } from './orchestration.service';

const mockEvaluate = operatonService.evaluateDecision as jest.Mock;
const mockExtractValues = operatonService.extractValues as jest.Mock;
const mockGetDmn = sparqlService.getDmnByIdentifier as jest.Mock;

function dmn(
  identifier: string,
  inputs: Array<{ identifier: string; type: string }> = []
): DmnModel {
  return {
    identifier,
    title: `${identifier} title`,
    inputs,
    outputs: [],
  } as unknown as DmnModel;
}

beforeEach(() => {
  mockEvaluate.mockReset();
  mockExtractValues.mockReset();
  mockGetDmn.mockReset();
  // extractValues is a pure projection of Operaton's response; the default
  // stand-in echoes what evaluateDecision produced so chain assertions stay
  // about orchestration rather than about Operaton's wire format.
  mockExtractValues.mockImplementation((r: unknown) => r as Record<string, unknown>);
});

describe('executeChain as a DRD', () => {
  test('evaluates the entry-point decision once instead of stepping through the chain', async () => {
    mockEvaluate.mockResolvedValue({ recht: true });

    const result = await orchestrationService.executeChain(
      ['A', 'B', 'Entry'],
      { bsn: '123' },
      undefined,
      true,
      'Entry'
    );

    expect(result.success).toBe(true);
    expect(result.chainId).toBe('DRD:Entry');
    expect(result.finalOutputs).toEqual({ recht: true });
    expect(mockEvaluate).toHaveBeenCalledTimes(1);
    expect(mockEvaluate).toHaveBeenCalledWith('Entry', { bsn: '123' });
    expect(mockGetDmn).not.toHaveBeenCalled();
  });

  test('records a single synthetic step describing the whole diagram', async () => {
    mockEvaluate.mockResolvedValue({ recht: true });

    const result = await orchestrationService.executeChain(
      ['A', 'B', 'Entry'],
      { bsn: '123' },
      undefined,
      true,
      'Entry'
    );

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({
      dmnId: 'Entry',
      dmnTitle: 'DRD (3 decisions)',
      inputs: { bsn: '123' },
      outputs: { recht: true },
    });
    expect(result.steps[0].duration).toBeGreaterThanOrEqual(0);
  });

  test('reports a failed DRD evaluation without steps or outputs', async () => {
    mockEvaluate.mockRejectedValue(new Error('no matching rule'));

    const result = await orchestrationService.executeChain(
      ['A', 'Entry'],
      { bsn: '123' },
      undefined,
      true,
      'Entry'
    );

    expect(result).toMatchObject({
      success: false,
      chainId: 'DRD:Entry',
      steps: [],
      finalOutputs: {},
      error: 'no matching rule',
    });
  });

  test('falls back to sequential execution when the entry point is unknown', async () => {
    mockGetDmn.mockResolvedValue(dmn('A'));
    mockEvaluate.mockResolvedValue({ out: 1 });

    const result = await orchestrationService.executeChain(['A'], {}, undefined, true, undefined);

    expect(result.chainId).toBe('A');
    expect(mockGetDmn).toHaveBeenCalled();
  });

  test('falls back to sequential execution when isDrd is not set', async () => {
    mockGetDmn.mockResolvedValue(dmn('A'));
    mockEvaluate.mockResolvedValue({ out: 1 });

    const result = await orchestrationService.executeChain(['A'], {}, undefined, false, 'Entry');

    expect(result.chainId).toBe('A');
    expect(mockGetDmn).toHaveBeenCalled();
  });
});

describe('executeChain sequentially', () => {
  test('resolves every DMN before executing any of them', async () => {
    mockGetDmn.mockImplementation(async (id: string) => dmn(id));
    mockEvaluate.mockResolvedValue({});

    await orchestrationService.executeChain(['A', 'B'], { bsn: '123' });

    expect(mockGetDmn).toHaveBeenCalledWith('A', undefined);
    expect(mockGetDmn).toHaveBeenCalledWith('B', undefined);
  });

  test('forwards the endpoint override to the DMN lookup', async () => {
    mockGetDmn.mockResolvedValue(dmn('A'));
    mockEvaluate.mockResolvedValue({});

    await orchestrationService.executeChain(['A'], {}, 'https://triplydb.example/sparql');

    expect(mockGetDmn).toHaveBeenCalledWith('A', 'https://triplydb.example/sparql');
  });

  test('feeds each step the accumulated variables from the previous ones', async () => {
    mockGetDmn.mockImplementation(async (id: string) => dmn(id));
    mockEvaluate
      .mockResolvedValueOnce({ leeftijd: 67 })
      .mockResolvedValueOnce({ bijstandsnorm: 1200 });

    const result = await orchestrationService.executeChain(['A', 'B'], { bsn: '123' });

    expect(mockEvaluate).toHaveBeenNthCalledWith(1, 'A', { bsn: '123' });
    expect(mockEvaluate).toHaveBeenNthCalledWith(2, 'B', { bsn: '123', leeftijd: 67 });
    expect(result.finalOutputs).toEqual({ bsn: '123', leeftijd: 67, bijstandsnorm: 1200 });
  });

  test('lets a later output shadow an earlier variable of the same name', async () => {
    mockGetDmn.mockImplementation(async (id: string) => dmn(id));
    mockEvaluate.mockResolvedValueOnce({ bedrag: 100 }).mockResolvedValueOnce({ bedrag: 250 });

    const result = await orchestrationService.executeChain(['A', 'B'], { bedrag: 0 });

    expect(result.finalOutputs.bedrag).toBe(250);
  });

  test('records one step per DMN, in order, with its input snapshot', async () => {
    mockGetDmn.mockImplementation(async (id: string) => dmn(id));
    mockEvaluate.mockResolvedValueOnce({ leeftijd: 67 }).mockResolvedValueOnce({ recht: true });

    const result = await orchestrationService.executeChain(['A', 'B'], { bsn: '123' });

    expect(result.steps.map((s) => s.dmnId)).toEqual(['A', 'B']);
    expect(result.steps[0]).toMatchObject({
      dmnTitle: 'A title',
      inputs: { bsn: '123' },
      outputs: { leeftijd: 67 },
    });
    expect(result.steps[1].inputs).toEqual({ bsn: '123', leeftijd: 67 });
  });

  test('names the chain by its DMN identifiers', async () => {
    mockGetDmn.mockImplementation(async (id: string) => dmn(id));
    mockEvaluate.mockResolvedValue({});

    const result = await orchestrationService.executeChain(['A', 'B', 'C'], {});

    expect(result.chainId).toBe('A->B->C');
    expect(result.executionTime).toBeGreaterThanOrEqual(0);
  });

  test('fails before executing anything when a DMN cannot be resolved', async () => {
    mockGetDmn.mockImplementation(async (id: string) => (id === 'B' ? null : dmn(id)));

    const result = await orchestrationService.executeChain(['A', 'B'], { bsn: '123' });

    expect(result).toMatchObject({
      success: false,
      chainId: 'A->B',
      steps: [],
      error: 'DMN not found: B',
    });
    expect(result.finalOutputs).toEqual({ bsn: '123' });
    expect(mockEvaluate).not.toHaveBeenCalled();
  });

  test('stops at the first failing step, keeping the completed ones', async () => {
    mockGetDmn.mockImplementation(async (id: string) => dmn(id));
    mockEvaluate
      .mockResolvedValueOnce({ leeftijd: 67 })
      .mockRejectedValueOnce(new Error('Operaton returned 500'));

    const result = await orchestrationService.executeChain(['A', 'B', 'C'], { bsn: '123' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Operaton returned 500');
    // The failing step is not appended — only the steps that ran to completion.
    expect(result.steps.map((s) => s.dmnId)).toEqual(['A']);
    expect(mockEvaluate).toHaveBeenCalledTimes(2);
  });

  test('returns the variables accumulated up to the failure', async () => {
    mockGetDmn.mockImplementation(async (id: string) => dmn(id));
    mockEvaluate.mockResolvedValueOnce({ leeftijd: 67 }).mockRejectedValueOnce(new Error('boom'));

    const result = await orchestrationService.executeChain(['A', 'B'], { bsn: '123' });

    expect(result.finalOutputs).toEqual({ bsn: '123', leeftijd: 67 });
  });

  test('an empty chain succeeds trivially, returning the inputs unchanged', async () => {
    const result = await orchestrationService.executeChain([], { bsn: '123' });

    expect(result).toMatchObject({ success: true, chainId: '', steps: [] });
    expect(result.finalOutputs).toEqual({ bsn: '123' });
  });

  test('does not mutate the caller initial inputs', async () => {
    mockGetDmn.mockResolvedValue(dmn('A'));
    mockEvaluate.mockResolvedValue({ leeftijd: 67 });
    const inputs = { bsn: '123' };

    await orchestrationService.executeChain(['A'], inputs);

    expect(inputs).toEqual({ bsn: '123' });
  });
});

describe('executeHeusdenpasChain', () => {
  test('runs the fixed SVB → SZW → Heusden chain', async () => {
    mockGetDmn.mockImplementation(async (id: string) => dmn(id));
    mockEvaluate.mockResolvedValue({});

    const result = await orchestrationService.executeHeusdenpasChain({ bsn: '123' });

    expect(result.chainId).toBe(
      'SVB_LeeftijdsInformatie->SZW_BijstandsnormInformatie->RONL_HeusdenpasEindresultaat'
    );
    expect(mockGetDmn).toHaveBeenCalledWith('SVB_LeeftijdsInformatie', undefined);
  });
});

describe('validateChainInputs', () => {
  const service = new OrchestrationService();

  test('accepts inputs that cover the first DMN requirements', () => {
    const dmns = [dmn('A', [{ identifier: 'bsn', type: 'String' }])];

    expect(service.validateChainInputs(dmns, { bsn: '123' })).toEqual({
      valid: true,
      missingInputs: [],
      errors: [],
    });
  });

  test('only the first DMN inputs are required — later ones come from upstream outputs', () => {
    const dmns = [
      dmn('A', [{ identifier: 'bsn', type: 'String' }]),
      dmn('B', [{ identifier: 'leeftijd', type: 'Integer' }]),
    ];

    const result = service.validateChainInputs(dmns, { bsn: '123' });

    expect(result.valid).toBe(true);
    expect(result.missingInputs).toEqual([]);
  });

  test('reports the missing inputs by name', () => {
    const dmns = [
      dmn('A', [
        { identifier: 'bsn', type: 'String' },
        { identifier: 'dagVanAanvraag', type: 'String' },
      ]),
    ];

    const result = service.validateChainInputs(dmns, { bsn: '123' });

    expect(result.valid).toBe(false);
    expect(result.missingInputs).toEqual(['dagVanAanvraag']);
    expect(result.errors).toEqual(['Missing required inputs: dagVanAanvraag']);
  });

  test('an empty chain requires nothing', () => {
    expect(service.validateChainInputs([], {})).toEqual({
      valid: true,
      missingInputs: [],
      errors: [],
    });
  });

  test.each([
    ['String', 'abc'],
    ['Integer', 42],
    ['Boolean', true],
    ['Double', 3.14],
    ['Double', 3],
  ])('accepts a %s input', (type, value) => {
    const dmns = [dmn('A', [{ identifier: 'v', type }])];

    expect(service.validateChainInputs(dmns, { v: value }).valid).toBe(true);
  });

  test.each([
    ['String', 42, 'number'],
    ['Integer', 'abc', 'string'],
    ['Boolean', 'true', 'string'],
    ['Double', 'abc', 'string'],
  ])('rejects a %s declared input given a %s', (type, value, actual) => {
    const dmns = [dmn('A', [{ identifier: 'v', type }])];

    const result = service.validateChainInputs(dmns, { v: value });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`Type mismatch for v: expected ${type}, got ${actual}`);
  });

  test('rejects a non-integral number for an Integer input', () => {
    const dmns = [dmn('A', [{ identifier: 'v', type: 'Integer' }])];

    const result = service.validateChainInputs(dmns, { v: 3.5 });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Type mismatch for v: expected Integer, got number');
  });

  test('skips null and undefined values rather than flagging their type', () => {
    const dmns = [dmn('A', [{ identifier: 'v', type: 'String' }])];

    const result = service.validateChainInputs(dmns, { v: null, w: undefined });

    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  test('ignores extra inputs the DMN does not declare', () => {
    const dmns = [dmn('A', [{ identifier: 'bsn', type: 'String' }])];

    const result = service.validateChainInputs(dmns, { bsn: '123', extra: 999 });

    expect(result.valid).toBe(true);
  });

  test('reports both a missing input and a type mismatch together', () => {
    const dmns = [
      dmn('A', [
        { identifier: 'bsn', type: 'String' },
        { identifier: 'leeftijd', type: 'Integer' },
      ]),
    ];

    const result = service.validateChainInputs(dmns, { bsn: 42 });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.missingInputs).toEqual(['leeftijd']);
  });
});

describe('module exports', () => {
  test('the singleton is an OrchestrationService', () => {
    expect(orchestrationService).toBeInstanceOf(OrchestrationService);
  });
});
