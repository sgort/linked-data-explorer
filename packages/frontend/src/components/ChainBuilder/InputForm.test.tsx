// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const getCombinedTestData = vi.fn();
vi.mock('../../utils/testData', () => ({
  getCombinedTestData: (...args: unknown[]) => getCombinedTestData(...args),
}));

import { DmnModel } from '../../types';
import { ChainValidation, RequiredInput } from '../../types/chainBuilder.types';
import InputForm from './InputForm';

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

function validation(requiredInputs: RequiredInput[]): ChainValidation {
  return {
    isValid: true,
    isDrdCompatible: true,
    errors: [],
    warnings: [],
    semanticMatches: [],
    drdIssues: [],
    requiredInputs,
    missingInputs: [],
    estimatedTime: 0,
  };
}

afterEach(() => {
  getCombinedTestData.mockReset();
});

describe('InputForm', () => {
  test('shows a placeholder message when there are no required inputs', () => {
    render(
      <InputForm chain={[]} inputs={{}} onInputChange={vi.fn()} validation={validation([])} />
    );
    expect(screen.getByText('No inputs required for this chain')).toBeTruthy();
  });

  test('shows the same placeholder when validation is null', () => {
    render(<InputForm chain={[]} inputs={{}} onInputChange={vi.fn()} validation={null} />);
    expect(screen.getByText('No inputs required for this chain')).toBeTruthy();
  });

  test('renders a text input for a String field and reports changes', async () => {
    const onInputChange = vi.fn();
    render(
      <InputForm
        chain={[]}
        inputs={{}}
        onInputChange={onInputChange}
        validation={validation([
          { identifier: 'name', title: 'Name', type: 'String', requiredBy: 'dmn-1' },
        ])}
      />
    );

    await userEvent.type(screen.getByPlaceholderText('Enter name'), 'x');
    expect(onInputChange).toHaveBeenLastCalledWith('name', 'x');
  });

  test('renders a checkbox for a Boolean field', async () => {
    const onInputChange = vi.fn();
    render(
      <InputForm
        chain={[]}
        inputs={{}}
        onInputChange={onInputChange}
        validation={validation([
          { identifier: 'eligible', title: 'Eligible', type: 'Boolean', requiredBy: 'dmn-1' },
        ])}
      />
    );

    await userEvent.click(screen.getByRole('checkbox'));
    expect(onInputChange).toHaveBeenCalledWith('eligible', true);
  });

  test('renders a number input for Integer and parses it as an int', async () => {
    const onInputChange = vi.fn();
    render(
      <InputForm
        chain={[]}
        inputs={{}}
        onInputChange={onInputChange}
        validation={validation([
          { identifier: 'age', title: 'Age', type: 'Integer', requiredBy: 'dmn-1' },
        ])}
      />
    );

    await userEvent.type(screen.getByPlaceholderText('Enter age'), '5');
    expect(onInputChange).toHaveBeenLastCalledWith('age', 5);
  });

  test('renders a date input for Date fields', () => {
    render(
      <InputForm
        chain={[]}
        inputs={{ birthdate: '2020-01-01' }}
        onInputChange={vi.fn()}
        validation={validation([
          { identifier: 'birthdate', title: 'Birthdate', type: 'Date', requiredBy: 'dmn-1' },
        ])}
      />
    );
    expect(screen.getByDisplayValue('2020-01-01')).toBeTruthy();
  });

  test('shows a checkmark once a field has a value', () => {
    render(
      <InputForm
        chain={[]}
        inputs={{ name: 'Jan' }}
        onInputChange={vi.fn()}
        validation={validation([
          { identifier: 'name', title: 'Name', type: 'String', requiredBy: 'dmn-1' },
        ])}
      />
    );
    expect(screen.getByText('✓')).toBeTruthy();
  });

  test('"Fill with test data" prefers each input\'s own testValue over testData.json', async () => {
    const onInputChange = vi.fn();
    render(
      <InputForm
        chain={[dmn()]}
        inputs={{}}
        onInputChange={onInputChange}
        validation={validation([
          { identifier: 'age', title: 'Age', type: 'Integer', requiredBy: 'dmn-1', testValue: 21 },
        ])}
      />
    );

    await userEvent.click(screen.getByText(/Fill with test data/));

    expect(onInputChange).toHaveBeenCalledWith('age', 21);
    expect(getCombinedTestData).not.toHaveBeenCalled();
  });

  test('"Fill with test data" falls back to testData.json when no input has a testValue', async () => {
    const onInputChange = vi.fn();
    getCombinedTestData.mockReturnValue({ age: 30 });
    render(
      <InputForm
        chain={[dmn({ identifier: 'age-check' })]}
        inputs={{}}
        onInputChange={onInputChange}
        validation={validation([
          { identifier: 'age', title: 'Age', type: 'Integer', requiredBy: 'dmn-1' },
        ])}
      />
    );

    await userEvent.click(screen.getByText(/Fill with test data/));

    expect(getCombinedTestData).toHaveBeenCalledWith(['age-check']);
    expect(onInputChange).toHaveBeenCalledWith('age', 30);
  });
});
