// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { DocumentTemplate, DocumentZones } from '../../types/document.types';
import DocumentList from './DocumentList';

function zones(): DocumentZones {
  return {
    letterhead: { blocks: [] },
    contactInformation: { blocks: [] },
    reference: { blocks: [] },
    body: { blocks: [] },
    closing: { blocks: [] },
    signOff: { blocks: [] },
  };
}

function template(overrides: Partial<DocumentTemplate> = {}): DocumentTemplate {
  return {
    id: 't1',
    name: 'Beschikking',
    schemaVersion: 1,
    zones: zones(),
    bindings: [],
    assets: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const baseProps = {
  activeTemplateId: null,
  activeTemplate: null,
  onCreateTemplate: vi.fn(),
  onImportTemplate: vi.fn(),
  onLoadTemplate: vi.fn(),
  onDeleteTemplate: vi.fn(),
  onUpdateTemplateName: vi.fn(),
};

describe('DocumentList', () => {
  test('shows an empty-state message when there are no templates', () => {
    render(<DocumentList {...baseProps} templates={[]} />);
    expect(screen.getByText('No documents yet')).toBeTruthy();
  });

  test('renders templates grouped by organization, ungrouped last', () => {
    render(
      <DocumentList
        {...baseProps}
        templates={[
          template({ id: 't1', name: 'Zorg doc', organization: 'toeslagen' }),
          template({ id: 't2', name: 'Ungrouped doc' }),
          template({ id: 't3', name: 'Flevoland doc', organization: 'flevoland' }),
        ]}
      />
    );

    expect(screen.getByText('flevoland')).toBeTruthy();
    expect(screen.getByText('toeslagen')).toBeTruthy();
    expect(screen.getByText('Ungrouped')).toBeTruthy();
  });

  test('a status badge is shown for example/wip/e2e templates', () => {
    render(
      <DocumentList
        {...baseProps}
        templates={[
          template({ id: 't1', name: 'Example doc', status: 'example' }),
          template({ id: 't2', name: 'Draft doc', status: 'wip' }),
          template({ id: 't3', name: 'E2E doc', status: 'e2e' }),
        ]}
      />
    );
    expect(screen.getByText('EXAMPLE')).toBeTruthy();
    expect(screen.getByText('DRAFT')).toBeTruthy();
    expect(screen.getByText('E2E')).toBeTruthy();
  });

  test('clicking a card calls onLoadTemplate with its id', async () => {
    const onLoadTemplate = vi.fn();
    render(
      <DocumentList {...baseProps} templates={[template()]} onLoadTemplate={onLoadTemplate} />
    );

    await userEvent.click(screen.getByText('Beschikking'));
    expect(onLoadTemplate).toHaveBeenCalledWith('t1');
  });

  test('deleting calls onDeleteTemplate without also selecting the card', async () => {
    const onLoadTemplate = vi.fn();
    const onDeleteTemplate = vi.fn();
    render(
      <DocumentList
        {...baseProps}
        templates={[template()]}
        onLoadTemplate={onLoadTemplate}
        onDeleteTemplate={onDeleteTemplate}
      />
    );

    await userEvent.click(screen.getByTitle('Delete'));
    expect(onDeleteTemplate).toHaveBeenCalledWith('t1');
    expect(onLoadTemplate).not.toHaveBeenCalled();
  });

  test('a readonly template disables its delete button and cannot be renamed', async () => {
    render(<DocumentList {...baseProps} templates={[template({ readonly: true })]} />);
    expect(screen.getByTitle('Example documents cannot be deleted')).toBeDisabled();

    await userEvent.dblClick(screen.getByText('Beschikking'));
    expect(screen.queryByDisplayValue('Beschikking')).toBeNull();
  });

  test('double-clicking a title starts renaming; Enter commits the new name', async () => {
    const onUpdateTemplateName = vi.fn();
    render(
      <DocumentList
        {...baseProps}
        templates={[template()]}
        onUpdateTemplateName={onUpdateTemplateName}
      />
    );

    await userEvent.dblClick(screen.getByText('Beschikking'));
    const input = screen.getByDisplayValue('Beschikking');
    await userEvent.clear(input);
    await userEvent.type(input, 'Renamed{Enter}');

    expect(onUpdateTemplateName).toHaveBeenCalledWith('t1', 'Renamed');
  });

  test('the toolbar search filters the visible templates', async () => {
    render(
      <DocumentList
        {...baseProps}
        templates={[
          template({ id: 't1', name: 'Zorgtoeslag besluit' }),
          template({ id: 't2', name: 'Kapvergunning besluit' }),
        ]}
      />
    );

    await userEvent.type(screen.getByPlaceholderText(/Search name/i), 'Kap');
    expect(screen.getByText('Kapvergunning besluit')).toBeTruthy();
    expect(screen.queryByText('Zorgtoeslag besluit')).toBeNull();
  });

  test('importing a .document file parses it and infers the language from the filename', async () => {
    const onImportTemplate = vi.fn();
    render(<DocumentList {...baseProps} templates={[]} onImportTemplate={onImportTemplate} />);

    const file = new File([JSON.stringify(template({ id: 'imported' }))], 'my-doc.nl.document', {
      type: 'application/json',
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    await vi.waitFor(() =>
      expect(onImportTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'imported', language: 'nl', status: 'wip' })
      )
    );
  });

  test('importing a .document file declaring status "e2e" preserves it, unlike other statuses', async () => {
    const onImportTemplate = vi.fn();
    render(<DocumentList {...baseProps} templates={[]} onImportTemplate={onImportTemplate} />);

    const file = new File(
      [JSON.stringify(template({ id: 'e2e-doc', status: 'e2e' }))],
      'example_treefelling_beschikking.document',
      { type: 'application/json' }
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    await vi.waitFor(() =>
      expect(onImportTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'e2e-doc', status: 'e2e' })
      )
    );
  });

  test('importing a .document file declaring an untrusted status (e.g. "example") falls back to "wip"', async () => {
    const onImportTemplate = vi.fn();
    render(<DocumentList {...baseProps} templates={[]} onImportTemplate={onImportTemplate} />);

    const file = new File(
      [JSON.stringify(template({ id: 'stray-example', status: 'example' }))],
      'stray.document',
      { type: 'application/json' }
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    await vi.waitFor(() =>
      expect(onImportTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'stray-example', status: 'wip' })
      )
    );
  });

  test('importing an invalid .document file alerts instead of crashing', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<DocumentList {...baseProps} templates={[]} />);

    const file = new File(['not json'], 'broken.document', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    await vi.waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('broken.document'))
    );
  });

  test('the footer language/organization selectors only appear once a template is active', () => {
    const { rerender } = render(<DocumentList {...baseProps} templates={[template()]} />);
    expect(screen.queryByText('Language')).toBeNull();

    rerender(
      <DocumentList
        {...baseProps}
        templates={[template()]}
        activeTemplate={template()}
        activeTemplateId="t1"
      />
    );
    expect(screen.getByText('Language')).toBeTruthy();
    expect(screen.getByText('Organization')).toBeTruthy();
  });
});
