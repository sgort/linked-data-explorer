// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const fetchVariableHints = vi.fn();
vi.mock('../../services/assetService', () => ({
  fetchVariableHints: (...args: unknown[]) => fetchVariableHints(...args),
}));

import { VariableBinding } from '../../types/document.types';
import BindingPanel from './BindingPanel';

const baseProps = {
  processKey: undefined as string | undefined,
  bindings: [] as VariableBinding[],
  onAdd: vi.fn(),
  onDelete: vi.fn(),
  onUpdateProcessKey: vi.fn(),
};

afterEach(() => {
  fetchVariableHints.mockReset();
  vi.restoreAllMocks();
});

describe('BindingPanel', () => {
  test('the discover button is disabled without a process key', () => {
    render(<BindingPanel {...baseProps} />);
    expect(screen.getByText('Discover variables in Operaton')).toBeDisabled();
  });

  test('editing the process key calls onUpdateProcessKey', async () => {
    const onUpdateProcessKey = vi.fn();
    render(<BindingPanel {...baseProps} onUpdateProcessKey={onUpdateProcessKey} />);

    await userEvent.type(screen.getByPlaceholderText(/AwbShellProcess/), 'x');
    expect(onUpdateProcessKey).toHaveBeenCalledWith('x');
  });

  test('discovering variables lists hints, clickable to prefill the new-binding form', async () => {
    fetchVariableHints.mockResolvedValue([{ name: 'leeftijd', type: 'Integer' }]);
    render(<BindingPanel {...baseProps} processKey="AwbShellProcess" />);

    await userEvent.click(screen.getByText('Discover variables in Operaton'));

    expect(await screen.findByText('leeftijd')).toBeTruthy();
    await userEvent.click(screen.getByText('leeftijd'));

    expect(screen.getByPlaceholderText('dossierReference')).toHaveValue('leeftijd');
    expect(screen.getByPlaceholderText('{{dossierReference}}')).toHaveValue('{{leeftijd}}');
  });

  test('shows a "no variables found" message when discovery returns nothing', async () => {
    fetchVariableHints.mockResolvedValue([]);
    render(<BindingPanel {...baseProps} processKey="AwbShellProcess" />);

    await userEvent.click(screen.getByText('Discover variables in Operaton'));
    expect(await screen.findByText(/No variables found/)).toBeTruthy();
  });

  test('Add is disabled until both placeholder and variable key are filled', async () => {
    render(<BindingPanel {...baseProps} />);
    const addButton = screen.getByText('Add');
    expect(addButton).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('{{dossierReference}}'), 'x');
    expect(addButton).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('dossierReference'), 'y');
    expect(addButton).not.toBeDisabled();
  });

  test('Add wraps a bare placeholder in {{ }} and calls onAdd, then clears the form', async () => {
    const onAdd = vi.fn();
    render(<BindingPanel {...baseProps} onAdd={onAdd} />);

    await userEvent.type(screen.getByPlaceholderText('{{dossierReference}}'), 'dossierReference');
    await userEvent.type(screen.getByPlaceholderText('dossierReference'), 'dossierReference');
    await userEvent.type(screen.getByPlaceholderText('Dossiernummer'), 'Dossier nr.');
    await userEvent.click(screen.getByText('Add'));

    expect(onAdd).toHaveBeenCalledWith({
      placeholder: '{{dossierReference}}',
      variableKey: 'dossierReference',
      source: 'process',
      label: 'Dossier nr.',
    });
    expect(screen.getByPlaceholderText('{{dossierReference}}')).toHaveValue('');
  });

  test('lists existing bindings and deletes one on click', async () => {
    const onDelete = vi.fn();
    render(
      <BindingPanel
        {...baseProps}
        bindings={[
          { id: 'b1', placeholder: '{{age}}', variableKey: 'age', source: 'process', label: 'Age' },
        ]}
        onDelete={onDelete}
      />
    );

    expect(screen.getByText('{{age}}')).toBeTruthy();
    expect(screen.getByText('age')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '' }));
    expect(onDelete).toHaveBeenCalledWith('b1');
  });
});
