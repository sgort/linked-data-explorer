// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

const getForms = vi.fn();
vi.mock('../../services/formService', () => ({
  FormService: { getForms: (...args: unknown[]) => getForms(...args) },
}));

import { FormSchema } from '../../types';
import FormTemplateSelector from './FormTemplateSelector';

function form(overrides: Partial<FormSchema> = {}): FormSchema {
  return {
    id: 'f1',
    name: 'Aanvraagformulier',
    schema: { id: 'form-schema-1' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('FormTemplateSelector', () => {
  test('shows a fallback message when there are no forms', async () => {
    getForms.mockReturnValue([]);
    render(<FormTemplateSelector element={{}} modeling={{ updateProperties: vi.fn() }} />);
    expect(await screen.findByText(/No forms available/)).toBeTruthy();
  });

  test('lists forms by their schema id, and pre-selects the current formRef', async () => {
    getForms.mockReturnValue([form()]);
    render(
      <FormTemplateSelector
        element={{}}
        modeling={{ updateProperties: vi.fn() }}
        selectedFormRef="form-schema-1"
      />
    );

    expect(await screen.findByText('📝 Aanvraagformulier')).toBeTruthy();
    expect(screen.getByRole('combobox')).toHaveValue('form-schema-1');
  });

  test('selecting a form updates the BPMN element with camunda:formRef', async () => {
    getForms.mockReturnValue([form()]);
    const updateProperties = vi.fn();
    const element = { id: 'task1' };
    render(<FormTemplateSelector element={element} modeling={{ updateProperties }} />);

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'form-schema-1');

    expect(updateProperties).toHaveBeenCalledWith(element, {
      'camunda:formRef': 'form-schema-1',
      'camunda:formRefBinding': 'latest',
      'camunda:formKey': undefined,
    });
  });

  test('clearing the selection removes the formRef properties', async () => {
    getForms.mockReturnValue([form()]);
    const updateProperties = vi.fn();
    const element = { id: 'task1' };
    render(
      <FormTemplateSelector
        element={element}
        modeling={{ updateProperties }}
        selectedFormRef="form-schema-1"
      />
    );

    await userEvent.selectOptions(await screen.findByRole('combobox'), '');

    expect(updateProperties).toHaveBeenCalledWith(element, {
      'camunda:formRef': undefined,
      'camunda:formRefBinding': undefined,
    });
  });
});
