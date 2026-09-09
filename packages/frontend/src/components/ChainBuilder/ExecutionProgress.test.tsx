// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { DmnModel } from '../../types';
import ExecutionProgress from './ExecutionProgress';

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

describe('ExecutionProgress', () => {
  test('renders the executing message and one row per chain step', () => {
    render(
      <ExecutionProgress chain={[dmn({ identifier: 'step-1' }), dmn({ identifier: 'step-2' })]} />
    );

    expect(screen.getByText('Executing Chain...')).toBeTruthy();
    expect(screen.getByText('step-1')).toBeTruthy();
    expect(screen.getByText('step-2')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  test('renders nothing extra for an empty chain', () => {
    render(<ExecutionProgress chain={[]} />);
    expect(screen.getByText('Executing Chain...')).toBeTruthy();
    expect(screen.queryByText('1')).toBeNull();
  });
});
