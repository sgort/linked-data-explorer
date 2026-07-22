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
