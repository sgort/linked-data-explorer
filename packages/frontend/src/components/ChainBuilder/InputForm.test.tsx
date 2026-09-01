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

  test('renders a decimal input for Double and parses it as a float', async () => {
    const onInputChange = vi.fn();
    render(
      <InputForm
        chain={[]}
        inputs={{ income: 1234.5 }}
        onInputChange={onInputChange}
        validation={validation([
          { identifier: 'income', title: 'Income', type: 'Double', requiredBy: 'dmn-1' },
        ])}
      />
    );

    const field = screen.getByDisplayValue('1234.5');
    expect(field.getAttribute('step')).toBe('0.01');

    await userEvent.clear(field);
    expect(onInputChange).toHaveBeenLastCalledWith('income', 0);
  });

  test('an empty Double field renders blank rather than NaN', () => {
    render(
      <InputForm
        chain={[]}
        inputs={{}}
        onInputChange={vi.fn()}
        validation={validation([
          { identifier: 'income', title: 'Income', type: 'Double', requiredBy: 'dmn-1' },
        ])}
      />
    );
    expect(screen.getByPlaceholderText('Enter income')).toHaveValue(null);
  });

  test('clearing an Integer field reports 0 rather than NaN', async () => {
    const onInputChange = vi.fn();
    render(
      <InputForm
        chain={[]}
        inputs={{ age: 42 }}
        onInputChange={onInputChange}
        validation={validation([
          { identifier: 'age', title: 'Age', type: 'Integer', requiredBy: 'dmn-1' },
        ])}
      />
    );

    await userEvent.clear(screen.getByDisplayValue('42'));
    expect(onInputChange).toHaveBeenLastCalledWith('age', 0);
  });

  test('an unset Date field renders empty and reports the picked date', async () => {
    const onInputChange = vi.fn();
    const { container } = render(
      <InputForm
        chain={[]}
        inputs={{}}
        onInputChange={onInputChange}
        validation={validation([
          { identifier: 'birthdate', title: 'Birthdate', type: 'Date', requiredBy: 'dmn-1' },
        ])}
      />
    );

    const field = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(field.value).toBe('');

    await userEvent.type(field, '2020-01-01');
    expect(onInputChange).toHaveBeenLastCalledWith('birthdate', '2020-01-01');
  });

  test('falls back to a text input for an unrecognised type', async () => {
    const onInputChange = vi.fn();
    render(
      <InputForm
        chain={[]}
        inputs={{}}
        onInputChange={onInputChange}
        validation={validation([
          {
            identifier: 'bsn',
            title: 'BSN',
            type: 'Duration' as RequiredInput['type'],
            requiredBy: 'dmn-1',
          },
        ])}
      />
    );

    await userEvent.type(screen.getByPlaceholderText('Enter bsn'), '1');
    expect(onInputChange).toHaveBeenLastCalledWith('bsn', '1');
  });

  test('renders an input description when the RDF supplies one', () => {
    render(
      <InputForm
        chain={[]}
        inputs={{}}
        onInputChange={vi.fn()}
        validation={validation([
          {
            identifier: 'name',
            title: 'Name',
            type: 'String',
            requiredBy: 'dmn-1',
            description: 'Full legal name as registered',
          },
        ])}
      />
    );
    expect(screen.getByText('Full legal name as registered')).toBeTruthy();
  });

  test('"Fill with test data" clears Date inputs that carry no RDF test value', async () => {
    const onInputChange = vi.fn();
    render(
      <InputForm
        chain={[dmn()]}
        inputs={{}}
        onInputChange={onInputChange}
        validation={validation([
          { identifier: 'age', title: 'Age', type: 'Integer', requiredBy: 'dmn-1', testValue: 21 },
          { identifier: 'since', title: 'Since', type: 'Date', requiredBy: 'dmn-1' },
        ])}
      />
    );

    await userEvent.click(screen.getByText(/Fill with test data/));

    expect(onInputChange).toHaveBeenCalledWith('age', 21);
    expect(onInputChange).toHaveBeenCalledWith('since', null);
    expect(getCombinedTestData).not.toHaveBeenCalled();
  });

  test('pluralises the DMN count on the test-data button', () => {
    const { rerender } = render(
      <InputForm
        chain={[dmn()]}
        inputs={{}}
        onInputChange={vi.fn()}
        validation={validation([
          { identifier: 'name', title: 'Name', type: 'String', requiredBy: 'dmn-1' },
        ])}
      />
    );
    expect(screen.getByText('Fill with test data (1 DMN)')).toBeTruthy();

    rerender(
      <InputForm
        chain={[dmn(), dmn({ identifier: 'income-check' })]}
        inputs={{}}
        onInputChange={vi.fn()}
        validation={validation([
          { identifier: 'name', title: 'Name', type: 'String', requiredBy: 'dmn-1' },
        ])}
      />
    );
    expect(screen.getByText('Fill with test data (2 DMNs)')).toBeTruthy();
  });
});
