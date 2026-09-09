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
    ChainPreset & {
      type: string;
      category: string;
      complexity: string;
      estimatedTime: number;
      usageCount: number;
    }
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

  test('the Custom category is served from localStorage without a backend query', async () => {
    getAllTemplates.mockResolvedValue([template({ id: 'p1', name: 'Predefined chain' })]);
    getUserTemplates.mockReturnValue([
      {
        ...template({ id: 'u1', name: 'My custom chain', category: 'custom' }),
        endpoint: 'e',
        isUserTemplate: true,
      },
    ]);
    render(<ChainConfig {...baseProps} chain={[]} validation={null} />);
    await screen.findByText('Predefined chain');

    await userEvent.selectOptions(screen.getByRole('combobox'), 'custom');

    expect(await screen.findByText('My custom chain')).toBeTruthy();
    expect(screen.queryByText('Predefined chain')).toBeNull();
    // 'custom' is not a backend category — asking for it returns nothing and
    // would wipe the list the user actually wants.
    expect(getTemplatesByCategory).not.toHaveBeenCalled();
  });

  test('cancelling the delete confirmation neither deletes nor loads the template', async () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([
      { ...template({ id: 'u1', name: 'My custom chain' }), endpoint: 'e', isUserTemplate: true },
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onLoadPreset = vi.fn();
    render(<ChainConfig {...baseProps} chain={[]} validation={null} onLoadPreset={onLoadPreset} />);
    await screen.findByText('My Templates');

    await userEvent.click(screen.getByTitle('Delete template'));

    expect(deleteUserTemplate).not.toHaveBeenCalled();
    expect(screen.getByText('My custom chain')).toBeTruthy();
    // The delete button sits inside the template's load button; without the
    // stopPropagation the cancelled delete would load the chain instead.
    expect(onLoadPreset).not.toHaveBeenCalled();
  });

  test('a delete the storage layer rejects alerts instead of silently reloading', async () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([
      { ...template({ id: 'u1', name: 'My custom chain' }), endpoint: 'e', isUserTemplate: true },
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    deleteUserTemplate.mockReturnValue(false);
    render(<ChainConfig {...baseProps} chain={[]} validation={null} />);
    await screen.findByText('My Templates');

    await userEvent.click(screen.getByTitle('Delete template'));

    expect(alertSpy).toHaveBeenCalledWith('Failed to delete template');
    expect(screen.getByText('My custom chain')).toBeTruthy();
  });

  test('DRD templates are marked as such in both lists', async () => {
    getAllTemplates.mockResolvedValue([template({ id: 'p1', name: 'DRD chain', type: 'drd' })]);
    getUserTemplates.mockReturnValue([
      {
        ...template({ id: 'u1', name: 'My DRD chain', type: 'drd' }),
        endpoint: 'e',
        isUserTemplate: true,
      },
    ]);
    render(<ChainConfig {...baseProps} chain={[]} validation={null} />);

    expect(await screen.findByText('DRD chain')).toBeTruthy();
    expect(screen.getByText('DRD')).toBeTruthy();
    // One marker per list — the sequential '⛓️' would be wrong for both.
    expect(screen.getAllByText('🎯')).toHaveLength(2);
    expect(screen.queryByText('⛓️')).toBeNull();
  });

  test('a template that records usage shows the count', async () => {
    getAllTemplates.mockResolvedValue([template({ usageCount: 12 })]);
    getUserTemplates.mockReturnValue([]);
    render(<ChainConfig {...baseProps} chain={[]} validation={null} />);

    expect(await screen.findByText('12 uses')).toBeTruthy();
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

  /** Saves a sequential template named `name` over the given chain. */
  async function saveSequentialTemplate(chain: DmnModel[], name: string, v = validation()) {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    saveUserTemplate.mockReturnValue({ ...template(), name });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(
      <ChainConfig {...baseProps} chain={chain} validation={{ ...v, isDrdCompatible: false }} />
    );

    await userEvent.click(screen.getByTitle('Save template'));
    await userEvent.type(screen.getByPlaceholderText(/My Eligibility Check/), name);
    await userEvent.click(screen.getByRole('button', { name: 'Save Template' }));
  }

  test('a template saved without a description gets one derived from the chain', async () => {
    await saveSequentialTemplate(
      [dmn(), dmn({ id: 'd2', identifier: 'income-check' })],
      'Two step'
    );

    await vi.waitFor(() =>
      expect(saveUserTemplate).toHaveBeenCalledWith(
        'https://example.com/sparql',
        expect.objectContaining({
          description: 'Sequential chain with 2 DMNs',
          complexity: 'medium',
        })
      )
    );
  });

  test('a chain of more than three DMNs is saved as complex', async () => {
    const chain = ['a', 'b', 'c', 'd'].map((id, i) => dmn({ id: `d${i}`, identifier: id }));

    await saveSequentialTemplate(chain, 'Four step');

    await vi.waitFor(() =>
      expect(saveUserTemplate).toHaveBeenCalledWith(
        'https://example.com/sparql',
        expect.objectContaining({
          description: 'Sequential chain with 4 DMNs',
          complexity: 'complex',
        })
      )
    );
  });

  test('a validation without a timing estimate falls back to one derived from the chain', async () => {
    await saveSequentialTemplate([dmn()], 'No estimate', validation({ estimatedTime: 0 }));

    await vi.waitFor(() =>
      // 1 DMN → 1 * 150 + 50. Storing 0 would advertise the chain as instant.
      expect(saveUserTemplate).toHaveBeenCalledWith(
        'https://example.com/sparql',
        expect.objectContaining({ estimatedTime: 200 })
      )
    );
  });

  /** Opens the DRD save modal and submits it against a failing deploy response. */
  async function failingDrdDeploy(deployBody: unknown) {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    global.fetch = vi.fn().mockResolvedValue({ json: async () => deployBody });
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
  }

  test('a deploy failure carrying an error object surfaces its message', async () => {
    // Camunda answers with an object here, not the string the sibling test uses.
    await failingDrdDeploy({ success: false, error: { message: 'DMN age-check not deployed' } });

    expect(await screen.findByText(/DMN age-check not deployed/)).toBeTruthy();
    expect(saveUserTemplate).not.toHaveBeenCalled();
  });

  test('a deploy failure with an unrecognised error shape falls back to the serialised payload', async () => {
    await failingDrdDeploy({ success: false, error: { code: 42 } });

    expect(await screen.findByText(/\{"code":42\}/)).toBeTruthy();
  });

  test('a deploy failure with no error field at all falls back to a generic message', async () => {
    await failingDrdDeploy({ success: false });

    expect(await screen.findByText(/DRD deployment failed/)).toBeTruthy();
  });

  test('the Inputs section collapses and expands', async () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    render(<ChainConfig {...baseProps} chain={[dmn()]} validation={validation()} />);

    expect(screen.getByText('InputForm stub')).toBeTruthy();
    await userEvent.click(screen.getByText('Inputs'));
    expect(screen.queryByText('InputForm stub')).toBeNull();

    await userEvent.click(screen.getByText('Inputs'));
    expect(screen.getByText('InputForm stub')).toBeTruthy();
  });

  test('a chain linked by semantic matches warns that execution stays sequential', async () => {
    getAllTemplates.mockResolvedValue([]);
    getUserTemplates.mockReturnValue([]);
    render(
      <ChainConfig
        {...baseProps}
        chain={[dmn()]}
        validation={validation({
          semanticMatches: [
            {
              outputDmn: 'age-check',
              outputVar: 'leeftijd',
              inputDmn: 'income-check',
              inputVar: 'age',
              matchType: 'semantic',
            },
          ],
        })}
      />
    );

    expect(screen.getByText('Sequential execution required (semantic links)')).toBeTruthy();
  });
});
