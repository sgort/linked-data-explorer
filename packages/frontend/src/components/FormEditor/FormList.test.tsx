// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { FormSchema } from '../../types';
import FormList from './FormList';

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

const baseProps = {
  activeFormId: null,
  activeForm: null,
  onCreateForm: vi.fn(),
  onImportForm: vi.fn(),
  onLoadForm: vi.fn(),
  onDeleteForm: vi.fn(),
  onUpdateFormName: vi.fn(),
};

describe('FormList', () => {
  test('shows an empty-state message when there are no forms', () => {
    render(<FormList {...baseProps} forms={[]} />);
    expect(screen.getByText('No forms yet')).toBeTruthy();
  });

  test('renders forms grouped by organization, ungrouped last', () => {
    render(
      <FormList
        {...baseProps}
        forms={[
          form({ id: 'f1', name: 'Zorg form', organization: 'toeslagen' }),
          form({ id: 'f2', name: 'Ungrouped form' }),
          form({ id: 'f3', name: 'Flevoland form', organization: 'flevoland' }),
        ]}
      />
    );

    expect(screen.getByText('flevoland')).toBeTruthy();
    expect(screen.getByText('toeslagen')).toBeTruthy();
    expect(screen.getByText('Ungrouped')).toBeTruthy();
  });

  test('collapsing an organization hides its forms', async () => {
    render(
      <FormList
        {...baseProps}
        forms={[form({ id: 'f1', name: 'Flevoland form', organization: 'flevoland' })]}
      />
    );

    expect(screen.getByText('Flevoland form')).toBeTruthy();
    await userEvent.click(screen.getByText('flevoland'));
    expect(screen.queryByText('Flevoland form')).toBeNull();
  });

  test('a status badge is shown for example/wip/dso/e2e forms', () => {
    render(
      <FormList
        {...baseProps}
        forms={[
          form({ id: 'f1', name: 'Example form', status: 'example' }),
          form({ id: 'f2', name: 'WIP form', status: 'wip' }),
          form({ id: 'f3', name: 'DSO form', status: 'dso' }),
          form({ id: 'f4', name: 'E2E form', status: 'e2e' }),
        ]}
      />
    );
    expect(screen.getByText('EXAMPLE')).toBeTruthy();
    expect(screen.getByText('WIP')).toBeTruthy();
    expect(screen.getByText('DSO')).toBeTruthy();
    expect(screen.getByText('E2E')).toBeTruthy();
  });

  test('clicking a card calls onLoadForm with its id', async () => {
    const onLoadForm = vi.fn();
    render(<FormList {...baseProps} forms={[form()]} onLoadForm={onLoadForm} />);

    await userEvent.click(screen.getByText('Aanvraagformulier'));
    expect(onLoadForm).toHaveBeenCalledWith('f1');
  });

  test('deleting calls onDeleteForm without also selecting the card', async () => {
    const onLoadForm = vi.fn();
    const onDeleteForm = vi.fn();
    render(
      <FormList
        {...baseProps}
        forms={[form()]}
        onLoadForm={onLoadForm}
        onDeleteForm={onDeleteForm}
      />
    );

    await userEvent.click(screen.getByTitle('Delete form'));
    expect(onDeleteForm).toHaveBeenCalledWith('f1');
    expect(onLoadForm).not.toHaveBeenCalled();
  });

  test('a readonly form disables its delete button', () => {
    render(<FormList {...baseProps} forms={[form({ readonly: true })]} />);
    expect(screen.getByTitle('Cannot delete example')).toBeDisabled();
  });

  test('double-clicking a title starts renaming; Enter commits the new name', async () => {
    const onUpdateFormName = vi.fn();
    render(<FormList {...baseProps} forms={[form()]} onUpdateFormName={onUpdateFormName} />);

    await userEvent.dblClick(screen.getByText('Aanvraagformulier'));
    const input = screen.getByDisplayValue('Aanvraagformulier');
    await userEvent.clear(input);
    await userEvent.type(input, 'Renamed form{Enter}');

    expect(onUpdateFormName).toHaveBeenCalledWith('f1', 'Renamed form');
  });

  test('a readonly form cannot be renamed via double-click', async () => {
    render(<FormList {...baseProps} forms={[form({ readonly: true })]} />);

    await userEvent.dblClick(screen.getByText('Aanvraagformulier'));
    expect(screen.queryByDisplayValue('Aanvraagformulier')).toBeNull();
  });

  test('the toolbar search filters the visible forms', async () => {
    render(
      <FormList
        {...baseProps}
        forms={[
          form({ id: 'f1', name: 'Zorgtoeslag intake' }),
          form({ id: 'f2', name: 'Kapvergunning' }),
        ]}
      />
    );

    await userEvent.type(screen.getByPlaceholderText(/Search name/i), 'Kap');

    expect(screen.getByText('Kapvergunning')).toBeTruthy();
    expect(screen.queryByText('Zorgtoeslag intake')).toBeNull();
  });

  test('shows "no forms match" when the filter excludes everything', async () => {
    render(<FormList {...baseProps} forms={[form()]} />);

    await userEvent.type(screen.getByPlaceholderText(/Search name/i), 'nonexistent');
    expect(screen.getByText('No forms match the current filters')).toBeTruthy();
  });

  test('importing a .form file parses it and calls onImportForm with the inferred language', async () => {
    const onImportForm = vi.fn();
    render(<FormList {...baseProps} forms={[]} onImportForm={onImportForm} />);

    const file = new File(
      [JSON.stringify({ id: 'imported-schema', components: [], language: 'nl' })],
      'my-form.nl.form',
      { type: 'application/json' }
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    await vi.waitFor(() =>
      expect(onImportForm).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'imported-schema' }),
        'imported-schema',
        'nl',
        undefined,
        false
      )
    );
  });

  test('importing a .form file carrying the e2eFixture marker calls onImportForm with isE2EFixture true, and strips the marker from the schema', async () => {
    const onImportForm = vi.fn();
    render(<FormList {...baseProps} forms={[]} onImportForm={onImportForm} />);

    const file = new File(
      [JSON.stringify({ id: 'e2e-schema', components: [], e2eFixture: true })],
      'tree-felling-review.form',
      { type: 'application/json' }
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    await vi.waitFor(() =>
      expect(onImportForm).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'e2e-schema' }),
        'e2e-schema',
        undefined,
        undefined,
        true
      )
    );
    const [[schema]] = onImportForm.mock.calls;
    expect(schema).not.toHaveProperty('e2eFixture');
  });

  test('importing an invalid .form file alerts instead of crashing', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<FormList {...baseProps} forms={[]} />);

    const file = new File(['not json'], 'broken.form', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    await vi.waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('broken.form'))
    );
  });

  test('the footer language/organization selectors only appear once a form is active', () => {
    const { rerender } = render(<FormList {...baseProps} forms={[form()]} />);
    expect(screen.queryByText('Language')).toBeNull();

    rerender(<FormList {...baseProps} forms={[form()]} activeForm={form()} activeFormId="f1" />);
    expect(screen.getByText('Language')).toBeTruthy();
    expect(screen.getByText('Organization')).toBeTruthy();
  });
});
