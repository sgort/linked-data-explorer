// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const exportChain = vi.fn();
const validateChainForExport = vi.fn();

vi.mock('../../utils/exportService', () => ({
  exportChain: (...args: unknown[]) => exportChain(...args),
  validateChainForExport: (...args: unknown[]) => validateChainForExport(...args),
}));

import { DmnModel } from '../../types';
import { ChainValidation } from '../../types/chainBuilder.types';
import ExportChain from './ExportChain';

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
    estimatedTime: 0,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  exportChain.mockReset();
  validateChainForExport.mockReset();
});

describe('ExportChain', () => {
  test('the Export button is disabled with an empty chain', () => {
    render(<ExportChain dmnIds={[]} inputs={{}} chainDmns={[]} validation={null} />);
    expect(screen.getByRole('button', { name: /Export/ })).toBeDisabled();
  });

  test('the Export button is disabled when the chain is invalid', () => {
    render(
      <ExportChain
        dmnIds={['age-check']}
        inputs={{}}
        chainDmns={[dmn()]}
        validation={validation({ isValid: false })}
      />
    );
    expect(screen.getByRole('button', { name: /Export/ })).toBeDisabled();
  });

  test('clicking Export opens the modal with a default filename', async () => {
    validateChainForExport.mockReturnValue({ valid: true, errors: [] });
    render(
      <ExportChain
        dmnIds={['age-check']}
        inputs={{}}
        chainDmns={[dmn()]}
        validation={validation()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Export/ }));

    expect(screen.getByText('Export Chain')).toBeTruthy();
    expect(screen.getByDisplayValue('chain-1-dmns')).toBeTruthy();
  });

  test('a failed pre-export validation shows the error instead of opening the modal', async () => {
    validateChainForExport.mockReturnValue({ valid: false, errors: ['Missing DMN xml'] });
    render(
      <ExportChain
        dmnIds={['age-check']}
        inputs={{}}
        chainDmns={[dmn()]}
        validation={validation()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Export/ }));

    expect(screen.getByText('Missing DMN xml')).toBeTruthy();
    expect(screen.queryByText('Export Chain')).toBeNull();
  });

  test('selecting a format highlights it, and the Export footer button is disabled until a filename is present', async () => {
    validateChainForExport.mockReturnValue({ valid: true, errors: [] });
    render(
      <ExportChain
        dmnIds={['age-check']}
        inputs={{}}
        chainDmns={[dmn()]}
        validation={validation()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Export/ }));

    expect(screen.getByText('JSON')).toBeTruthy();
    await userEvent.click(screen.getByText('BPMN 2.0'));
    // Filename was pre-filled by handleExportClick, so the footer Export button is enabled.
    expect(screen.getAllByRole('button', { name: /Export/ })[1]).not.toBeDisabled();
  });

  test('a successful export calls exportChain and closes the modal', async () => {
    validateChainForExport.mockReturnValue({ valid: true, errors: [] });
    exportChain.mockResolvedValue({ success: true });
    render(
      <ExportChain
        dmnIds={['age-check']}
        inputs={{ age: 30 }}
        chainDmns={[dmn()]}
        chainName="my-export"
        validation={validation()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Export/ }));
    const footerExport = screen.getAllByRole('button', { name: /Export/ })[1];
    await userEvent.click(footerExport);

    expect(exportChain).toHaveBeenCalledWith(
      ['age-check'],
      { age: 30 },
      [dmn()],
      expect.objectContaining({ format: 'json', includeMetadata: true, prettyPrint: true })
    );
    expect(screen.queryByText('Export Chain')).toBeNull();
  });

  test('a failed export keeps the modal open and shows the error', async () => {
    validateChainForExport.mockReturnValue({ valid: true, errors: [] });
    exportChain.mockResolvedValue({ success: false, error: 'Disk full' });
    render(
      <ExportChain
        dmnIds={['age-check']}
        inputs={{}}
        chainDmns={[dmn()]}
        validation={validation()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Export/ }));
    await userEvent.click(screen.getAllByRole('button', { name: /Export/ })[1]);

    expect(await screen.findByText('Disk full')).toBeTruthy();
    expect(screen.getByText('Export Chain')).toBeTruthy();
  });

  test('a failed export with no error text falls back to a generic message', async () => {
    validateChainForExport.mockReturnValue({ valid: true, errors: [] });
    exportChain.mockResolvedValue({ success: false });
    render(
      <ExportChain
        dmnIds={['age-check']}
        inputs={{}}
        chainDmns={[dmn()]}
        validation={validation()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Export/ }));
    await userEvent.click(screen.getAllByRole('button', { name: /Export/ })[1]);

    expect(await screen.findByText('Export failed')).toBeTruthy();
  });

  test('an exportChain rejection surfaces the thrown message', async () => {
    validateChainForExport.mockReturnValue({ valid: true, errors: [] });
    exportChain.mockRejectedValue(new Error('Serializer crashed'));
    render(
      <ExportChain
        dmnIds={['age-check']}
        inputs={{}}
        chainDmns={[dmn()]}
        validation={validation()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Export/ }));
    await userEvent.click(screen.getAllByRole('button', { name: /Export/ })[1]);

    expect(await screen.findByText('Serializer crashed')).toBeTruthy();
    expect(screen.getByText('Export Chain')).toBeTruthy();
  });

  test('a rejection that is not an Error still leaves the modal usable', async () => {
    validateChainForExport.mockReturnValue({ valid: true, errors: [] });
    exportChain.mockRejectedValue('not an Error instance');
    render(
      <ExportChain
        dmnIds={['age-check']}
        inputs={{}}
        chainDmns={[dmn()]}
        validation={validation()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Export/ }));
    await userEvent.click(screen.getAllByRole('button', { name: /Export/ })[1]);

    expect(await screen.findByText('Unknown error')).toBeTruthy();
    // The finally block must still clear isExporting, or the footer button
    // stays stuck on "Exporting…" with no way to retry.
    expect(screen.getAllByRole('button', { name: /Export/ })[1]).not.toBeDisabled();
  });

  test('the chain summary pluralises the DMN count', async () => {
    validateChainForExport.mockReturnValue({ valid: true, errors: [] });
    render(
      <ExportChain
        dmnIds={['age-check', 'income-check']}
        inputs={{ age: 30 }}
        chainDmns={[dmn(), dmn({ id: 'd2', identifier: 'income-check' })]}
        validation={validation()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Export/ }));

    expect(screen.getByText('2 DMNs • 1 input')).toBeTruthy();
  });

  test('Enter in the filename field runs the export', async () => {
    validateChainForExport.mockReturnValue({ valid: true, errors: [] });
    exportChain.mockResolvedValue({ success: true });
    render(
      <ExportChain
        dmnIds={['age-check']}
        inputs={{}}
        chainDmns={[dmn()]}
        validation={validation()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Export/ }));
    await userEvent.type(screen.getByPlaceholderText('Enter filename...'), '-v2{Enter}');

    expect(exportChain).toHaveBeenCalledWith(
      ['age-check'],
      {},
      [dmn()],
      expect.objectContaining({ filename: 'chain-1-dmns-v2' })
    );
  });

  test('Enter with an empty filename does not run the export', async () => {
    validateChainForExport.mockReturnValue({ valid: true, errors: [] });
    render(
      <ExportChain
        dmnIds={['age-check']}
        inputs={{}}
        chainDmns={[dmn()]}
        validation={validation()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Export/ }));
    const input = screen.getByPlaceholderText('Enter filename...');
    await userEvent.clear(input);
    await userEvent.type(input, '{Enter}');

    expect(exportChain).not.toHaveBeenCalled();
    expect(screen.getByText('Export Chain')).toBeTruthy();
  });

  test('Cancel closes the modal and resets the filename', async () => {
    validateChainForExport.mockReturnValue({ valid: true, errors: [] });
    render(
      <ExportChain
        dmnIds={['age-check']}
        inputs={{}}
        chainDmns={[dmn()]}
        validation={validation()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Export/ }));
    await userEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByText('Export Chain')).toBeNull();
    expect(exportChain).not.toHaveBeenCalled();
  });
});
