// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const getUserTemplates = vi.fn();
vi.mock('../../services/userTemplateStorage', () => ({
  getUserTemplates: (...args: unknown[]) => getUserTemplates(...args),
}));

import DmnTemplateSelector from './DmnTemplateSelector';

function dmnsResponse(dmns: unknown[]) {
  return { json: async () => ({ success: true, data: { dmns } }) };
}

afterEach(() => {
  getUserTemplates.mockReset();
  vi.restoreAllMocks();
});

describe('DmnTemplateSelector', () => {
  test('shows a loading message, then a fallback when there is nothing to link', async () => {
    global.fetch = vi.fn().mockResolvedValue(dmnsResponse([]));
    getUserTemplates.mockReturnValue([]);
    render(
      <DmnTemplateSelector endpoint="e" element={{}} modeling={{ updateProperties: vi.fn() }} />
    );

    expect(screen.getByText('Loading DMNs and DRDs...')).toBeTruthy();
    expect(await screen.findByText('No DMNs or DRDs available for this endpoint')).toBeTruthy();
  });

  test('lists regular DMNs under "Single DMNs" and DRD templates under "DRDs"', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(dmnsResponse([{ identifier: 'age-check', title: 'Age check.dmn' }]));
    getUserTemplates.mockReturnValue([
      {
        type: 'drd',
        drdEntryPointId: 'drd-entry',
        name: 'Eligibility',
        description: 'desc',
        drdOriginalChain: ['age-check', 'income-check'],
      },
    ]);
    render(
      <DmnTemplateSelector endpoint="e" element={{}} modeling={{ updateProperties: vi.fn() }} />
    );

    expect(await screen.findByText('Age check')).toBeTruthy();
    expect(screen.getByText('Eligibility (DRD)')).toBeTruthy();
  });

  test('a user template missing drdEntryPointId is excluded from the DRD options', async () => {
    global.fetch = vi.fn().mockResolvedValue(dmnsResponse([]));
    getUserTemplates.mockReturnValue([{ type: 'drd', name: 'Incomplete' }]);
    render(
      <DmnTemplateSelector endpoint="e" element={{}} modeling={{ updateProperties: vi.fn() }} />
    );
    expect(await screen.findByText('No DMNs or DRDs available for this endpoint')).toBeTruthy();
  });

  test('selecting a regular DMN writes decisionRef/resultVariable/mapDecisionResult', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(dmnsResponse([{ identifier: 'ageCheck', title: 'ageCheck.dmn' }]));
    getUserTemplates.mockReturnValue([]);
    const updateProperties = vi.fn();
    const element = { id: 'task1' };
    render(<DmnTemplateSelector endpoint="e" element={element} modeling={{ updateProperties }} />);

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'ageCheck');

    expect(updateProperties).toHaveBeenCalledWith(element, {
      'camunda:decisionRef': 'ageCheck',
      'camunda:resultVariable': 'ageCheckResult',
      'camunda:mapDecisionResult': 'singleEntry',
    });
  });

  test('selecting a DRD option shows its badge and original-chain summary', async () => {
    global.fetch = vi.fn().mockResolvedValue(dmnsResponse([]));
    getUserTemplates.mockReturnValue([
      {
        type: 'drd',
        drdEntryPointId: 'drd-entry',
        name: 'Eligibility',
        drdOriginalChain: ['age-check', 'income-check'],
      },
    ]);
    render(
      <DmnTemplateSelector
        endpoint="e"
        element={{}}
        modeling={{ updateProperties: vi.fn() }}
        selectedDecisionRef="drd-entry"
      />
    );

    expect(await screen.findByText('DRD')).toBeTruthy();
    expect(screen.getByText('Combines: age-check → income-check')).toBeTruthy();
  });

  test('clearing the selection removes decisionRef/resultVariable', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(dmnsResponse([{ identifier: 'ageCheck', title: 'ageCheck.dmn' }]));
    getUserTemplates.mockReturnValue([]);
    const updateProperties = vi.fn();
    render(
      <DmnTemplateSelector
        endpoint="e"
        element={{}}
        modeling={{ updateProperties }}
        selectedDecisionRef="ageCheck"
      />
    );

    await userEvent.selectOptions(await screen.findByRole('combobox'), '');
    expect(updateProperties).toHaveBeenCalledWith(
      {},
      { 'camunda:decisionRef': undefined, 'camunda:resultVariable': undefined }
    );
  });

  test('a failed DMN fetch degrades to no options rather than crashing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    getUserTemplates.mockReturnValue([]);
    render(
      <DmnTemplateSelector endpoint="e" element={{}} modeling={{ updateProperties: vi.fn() }} />
    );
    expect(await screen.findByText('No DMNs or DRDs available for this endpoint')).toBeTruthy();
  });
});
