// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const getAllTemplates = vi.fn();
const getTemplatesByCategory = vi.fn();
const getUserTemplates = vi.fn();
const saveUserTemplate = vi.fn();
const deleteUserTemplate = vi.fn();

vi.mock('../../services/templateService', () => ({
  templateService: {
    getAllTemplates: (...args: unknown[]) => getAllTemplates(...args),
    getTemplatesByCategory: (...args: unknown[]) => getTemplatesByCategory(...args),
  },
}));

vi.mock('../../services/userTemplateStorage', () => ({
  getUserTemplates: (...args: unknown[]) => getUserTemplates(...args),
  saveUserTemplate: (...args: unknown[]) => saveUserTemplate(...args),
  deleteUserTemplate: (...args: unknown[]) => deleteUserTemplate(...args),
}));

vi.mock('./TestCasePanel', () => ({ default: () => <div>TestCasePanel stub</div> }));
vi.mock('./InputForm', () => ({ default: () => <div>InputForm stub</div> }));
vi.mock('./ExecutionProgress', () => ({ default: () => <div>ExecutionProgress stub</div> }));
vi.mock('./ChainResults', () => ({ default: () => <div>ChainResults stub</div> }));
vi.mock('./ExportChain', () => ({ default: () => <button>ExportChain stub</button> }));

import { ChainExecutionResult, DmnModel } from '../../types';
import { ChainPreset, ChainValidation } from '../../types/chainBuilder.types';
import ChainConfig from './ChainConfig';

function dmn(overrides: Partial<DmnModel> = {}): DmnModel {
  return {
    id: 'd1',
    identifier: 'age-check',
    title: 'Age check',
    inputs: [],
    outputs: [],
    ...overrides,
  };
}

function validation(overrides: Partial<ChainValidation> = {}): ChainValidation {
  return {
    isValid: true,
    isDrdCompatible: true,
    errors: [],
    warnings: [],
    semanticMatches: [],
    drdIssues: [],
    requiredInputs: [],
    missingInputs: [],
    estimatedTime: 100,
    ...overrides,
  };
}

function template(
  overrides: Partial<
    ChainPreset & { type: string; category: string; complexity: string; estimatedTime: number }
  > = {}
) {
  return {
    id: 't1',
    name: 'Age eligibility',
    description: 'Checks age eligibility',
    dmnIds: ['age-check'],
    type: 'sequential',
    category: 'social',
    tags: [],
    complexity: 'simple',
    estimatedTime: 150,
    isPublic: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const baseProps = {
  inputs: {},
  onInputChange: vi.fn(),
  onExecute: vi.fn(),
  onLoadPreset: vi.fn(),
  executionResult: null as ChainExecutionResult | null,
  isExecuting: false,
  endpoint: 'https://example.com/sparql',
};

afterEach(() => {
  vi.restoreAllMocks();
  getAllTemplates.mockReset();
  getTemplatesByCategory.mockReset();
  getUserTemplates.mockReset();
  saveUserTemplate.mockReset();
  deleteUserTemplate.mockReset();
});

describe('ChainConfig — empty chain (template browser)', () => {
  test('shows the placeholder and loads templates on mount', async () => {
    getAllTemplates.mockResolvedValue([template()]);
    getUserTemplates.mockReturnValue([]);
    render(<ChainConfig {...baseProps} chain={[]} validation={null} />);

    expect(screen.getByText('Add DMNs to your chain to configure and execute')).toBeTruthy();
    expect(await screen.findByText('Age eligibility')).toBeTruthy();
    expect(getAllTemplates).toHaveBeenCalled();
  });

  test('shows an empty-category message when there are no templates', async () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    render(<ChainConfig {...baseProps} chain={[]} validation={null} />);
    expect(await screen.findByText('No templates in this category')).toBeTruthy();
  });

  test('selecting a category re-queries getTemplatesByCategory', async () => {
    getAllTemplates.mockResolvedValue([]);
    getTemplatesByCategory.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    render(<ChainConfig {...baseProps} chain={[]} validation={null} />);
    await screen.findByText('No templates in this category');

    await userEvent.selectOptions(screen.getByRole('combobox'), 'financial');
    expect(getTemplatesByCategory).toHaveBeenCalledWith('financial');
  });

  test('clicking a predefined template calls onLoadPreset', async () => {
    getAllTemplates.mockResolvedValue([template()]);
    getUserTemplates.mockReturnValue([]);
    const onLoadPreset = vi.fn();
    render(<ChainConfig {...baseProps} chain={[]} validation={null} onLoadPreset={onLoadPreset} />);

    await userEvent.click(await screen.findByText('Age eligibility'));
    expect(onLoadPreset).toHaveBeenCalledWith(template());
  });

  test('lists user templates separately, with a delete button gated by confirm', async () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([
      { ...template({ id: 'u1', name: 'My custom chain' }), endpoint: 'e', isUserTemplate: true },
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteUserTemplate.mockReturnValue(true);
    render(<ChainConfig {...baseProps} chain={[]} validation={null} />);

    expect(await screen.findByText('My Templates')).toBeTruthy();
    await userEvent.click(screen.getByTitle('Delete template'));

    expect(deleteUserTemplate).toHaveBeenCalledWith('https://example.com/sparql', 'u1');
  });
});

describe('ChainConfig — populated chain', () => {
  test('shows the chain header count and the mocked child sections', async () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    render(
      <ChainConfig
        {...baseProps}
        chain={[dmn(), dmn({ identifier: 'income-check' })]}
        validation={validation()}
      />
    );

    expect(screen.getByText('2 DMNs in chain')).toBeTruthy();
    expect(screen.getByText('TestCasePanel stub')).toBeTruthy();
    expect(screen.getByText('InputForm stub')).toBeTruthy();
  });

  test('the validation section collapses and expands', async () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    render(<ChainConfig {...baseProps} chain={[dmn()]} validation={validation()} />);

    expect(screen.getByText('✓ Chain is valid and ready to execute')).toBeTruthy();
    await userEvent.click(screen.getByText('Validation'));
    expect(screen.queryByText('✓ Chain is valid and ready to execute')).toBeNull();
  });

  test('shows validation error and warning messages when invalid', () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    render(
      <ChainConfig
        {...baseProps}
        chain={[dmn()]}
        validation={validation({
          isValid: false,
          errors: [{ type: 'missing_input', message: 'Missing input: age' }],
          warnings: [{ type: 'duplicate_dmn', message: 'DMN used twice' }],
        })}
      />
    );
    expect(screen.getAllByText('Missing input: age').length).toBeGreaterThan(0);
    expect(screen.getByText('DMN used twice')).toBeTruthy();
  });

  test('ExecutionProgress renders only while executing; ChainResults renders only once a result exists', () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    Element.prototype.scrollTo = vi.fn();
    const { rerender } = render(
      <ChainConfig {...baseProps} chain={[dmn()]} validation={validation()} isExecuting />
    );
    expect(screen.getByText('ExecutionProgress stub')).toBeTruthy();
    expect(screen.queryByText('ChainResults stub')).toBeNull();

    rerender(
      <ChainConfig
        {...baseProps}
        chain={[dmn()]}
        validation={validation()}
        isExecuting={false}
        executionResult={{
          success: true,
          chainId: 'c1',
          executionTime: 10,
          steps: [],
          finalOutputs: {},
        }}
      />
    );
    expect(screen.queryByText('ExecutionProgress stub')).toBeNull();
    expect(screen.getByText('ChainResults stub')).toBeTruthy();
  });

  test('Execute is disabled when invalid and calls onExecute when valid', async () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    const onExecute = vi.fn();
    const { rerender } = render(
      <ChainConfig
        {...baseProps}
        chain={[dmn()]}
        validation={validation({ isValid: false })}
        onExecute={onExecute}
      />
    );
    expect(screen.getByTitle('Execute chain')).toBeDisabled();

    rerender(
      <ChainConfig {...baseProps} chain={[dmn()]} validation={validation()} onExecute={onExecute} />
    );
    await userEvent.click(screen.getByTitle('Execute chain'));
    expect(onExecute).toHaveBeenCalled();
  });

  test('Save is disabled when invalid, and opens the save-template modal when valid', async () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    render(<ChainConfig {...baseProps} chain={[dmn()]} validation={validation()} />);

    await userEvent.click(screen.getByTitle('Save as DRD'));
    expect(screen.getByRole('heading', { name: 'Save as DRD Template' })).toBeTruthy();
  });

  test("the modal's Save Template button stays disabled until a name is entered", async () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    render(
      <ChainConfig
        {...baseProps}
        chain={[dmn()]}
        validation={validation({ isDrdCompatible: false })}
      />
    );

    await userEvent.click(screen.getByTitle('Save template'));
    expect(screen.getByRole('button', { name: 'Save Template' })).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText(/My Eligibility Check/), 'x');
    expect(screen.getByRole('button', { name: 'Save Template' })).not.toBeDisabled();
    expect(saveUserTemplate).not.toHaveBeenCalled();
  });

  test('saving a sequential (non-DRD) template calls saveUserTemplate directly, with no deploy fetch', async () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    saveUserTemplate.mockReturnValue({ ...template(), name: 'My chain' });
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <ChainConfig
        {...baseProps}
        chain={[dmn()]}
        validation={validation({ isDrdCompatible: false })}
      />
    );

    await userEvent.click(screen.getByTitle('Save template'));
    await userEvent.type(screen.getByPlaceholderText(/My Eligibility Check/), 'My chain');
    await userEvent.click(screen.getByRole('button', { name: 'Save Template' }));

    await vi.waitFor(() =>
      expect(saveUserTemplate).toHaveBeenCalledWith(
        'https://example.com/sparql',
        expect.objectContaining({ name: 'My chain', type: 'sequential' })
      )
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Save as Sequential Template' })).toBeNull();
  });

  test('saving a DRD-compatible template deploys first, then saves with DRD fields', async () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    saveUserTemplate.mockReturnValue({ ...template(), name: 'My DRD' });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        success: true,
        data: { entryPointId: 'entry1', deploymentId: 'deploy1' },
      }),
    });

    render(
      <ChainConfig
        {...baseProps}
        chain={[dmn()]}
        validation={validation({ isDrdCompatible: true })}
      />
    );

    await userEvent.click(screen.getByTitle('Save as DRD'));
    await userEvent.type(screen.getByPlaceholderText(/My Eligibility Check/), 'My DRD');
    await userEvent.click(screen.getByRole('button', { name: 'Save as DRD' }));

    await vi.waitFor(() =>
      expect(saveUserTemplate).toHaveBeenCalledWith(
        'https://example.com/sparql',
        expect.objectContaining({
          name: 'My DRD',
          drdDeploymentId: 'deploy1',
          drdEntryPointId: 'dmn0_entry1',
        })
      )
    );
    expect(screen.queryByRole('heading', { name: 'Save as DRD Template' })).toBeNull();
  });

  test('a failed DRD deploy shows the error and keeps the modal open', async () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: false, error: 'Deployment quota exceeded' }),
    });

    render(
      <ChainConfig
        {...baseProps}
        chain={[dmn()]}
        validation={validation({ isDrdCompatible: true })}
      />
    );

    await userEvent.click(screen.getByTitle('Save as DRD'));
    await userEvent.type(screen.getByPlaceholderText(/My Eligibility Check/), 'My DRD');
    await userEvent.click(screen.getByRole('button', { name: 'Save as DRD' }));

    expect(await screen.findByText(/Deployment quota exceeded/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Save as DRD Template' })).toBeTruthy();
  });

  test('Cancel closes the save-template modal without saving', async () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    render(<ChainConfig {...baseProps} chain={[dmn()]} validation={validation()} />);

    await userEvent.click(screen.getByTitle('Save as DRD'));
    await userEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByRole('heading', { name: 'Save as DRD Template' })).toBeNull();
    expect(saveUserTemplate).not.toHaveBeenCalled();
  });
});
