// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

const getTemplates = vi.fn();
vi.mock('../../services/documentService', () => ({
  DocumentService: { getTemplates: (...args: unknown[]) => getTemplates(...args) },
}));

import { DocumentTemplate } from '../../types/document.types';
import DocumentTemplateSelector from './DocumentTemplateSelector';

function template(overrides: Partial<DocumentTemplate> = {}): DocumentTemplate {
  return {
    id: 'd1',
    name: 'Beschikking',
    schemaVersion: 1,
    zones: {} as DocumentTemplate['zones'],
    bindings: {},
    assets: [],
    status: 'wip',
    ...overrides,
  } as DocumentTemplate;
}

describe('DocumentTemplateSelector', () => {
  test('shows a fallback message when there are no document templates', () => {
    getTemplates.mockReturnValue([]);
    render(<DocumentTemplateSelector element={{}} modeling={{ updateProperties: vi.fn() }} />);
    expect(screen.getByText(/No documents available/)).toBeTruthy();
  });

  test('shows the template already attached by documentRef', () => {
    getTemplates.mockReturnValue([template()]);
    render(
      <DocumentTemplateSelector
        element={{}}
        modeling={{ updateProperties: vi.fn() }}
        selectedDocumentRef="d1"
      />
    );

    expect(screen.getByText('📄 Beschikking')).toBeTruthy();
    // Attached templates leave the add-list, so the only option left is its placeholder.
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  test('shows every template in a comma-separated documentRef', () => {
    getTemplates.mockReturnValue([template(), template({ id: 'd2', name: 'Objectenboom' })]);
    render(
      <DocumentTemplateSelector
        element={{}}
        modeling={{ updateProperties: vi.fn() }}
        selectedDocumentRef="d1,d2"
      />
    );

    expect(screen.getByText('📄 Beschikking')).toBeTruthy();
    expect(screen.getByText('📄 Objectenboom')).toBeTruthy();
  });

  test('falls back to the id when the referenced template is not in this browser', () => {
    // A BPMN can arrive referencing a template this browser was never seeded
    // with; hiding the attachment would make it look unset and invite a
    // modeller to overwrite it.
    getTemplates.mockReturnValue([template()]);
    render(
      <DocumentTemplateSelector
        element={{}}
        modeling={{ updateProperties: vi.fn() }}
        selectedDocumentRef="d1,rip-objectenboom"
      />
    );
    expect(screen.getByText('📄 rip-objectenboom')).toBeTruthy();
  });

  test("shows the linked template's processKey when set", () => {
    getTemplates.mockReturnValue([template({ processKey: 'ZorgtoeslagProcess' })]);
    render(
      <DocumentTemplateSelector
        element={{}}
        modeling={{ updateProperties: vi.fn() }}
        selectedDocumentRef="d1"
      />
    );
    expect(screen.getByText(/processKey: ZorgtoeslagProcess/)).toBeTruthy();
  });

  test('attaching a template writes ronl:documentRef to the element', async () => {
    getTemplates.mockReturnValue([template()]);
    const updateProperties = vi.fn();
    const element = { id: 'task1' };
    render(<DocumentTemplateSelector element={element} modeling={{ updateProperties }} />);

    await userEvent.selectOptions(screen.getByRole('combobox'), 'd1');
    expect(updateProperties).toHaveBeenCalledWith(element, { 'ronl:documentRef': 'd1' });
  });

  test('attaching a second template appends rather than replacing', async () => {
    getTemplates.mockReturnValue([template(), template({ id: 'd2', name: 'Objectenboom' })]);
    const updateProperties = vi.fn();
    const element = { id: 'task1' };
    render(
      <DocumentTemplateSelector
        element={element}
        modeling={{ updateProperties }}
        selectedDocumentRef="d1"
      />
    );

    await userEvent.selectOptions(screen.getByRole('combobox'), 'd2');
    expect(updateProperties).toHaveBeenCalledWith(element, { 'ronl:documentRef': 'd1,d2' });
  });

  test('removing one of two leaves the other attached', async () => {
    getTemplates.mockReturnValue([template(), template({ id: 'd2', name: 'Objectenboom' })]);
    const updateProperties = vi.fn();
    const element = { id: 'task1' };
    render(
      <DocumentTemplateSelector
        element={element}
        modeling={{ updateProperties }}
        selectedDocumentRef="d1,d2"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove Beschikking' }));
    expect(updateProperties).toHaveBeenCalledWith(element, { 'ronl:documentRef': 'd2' });
  });

  test('removing the last one removes ronl:documentRef', async () => {
    getTemplates.mockReturnValue([template()]);
    const updateProperties = vi.fn();
    const element = { id: 'task1' };
    render(
      <DocumentTemplateSelector
        element={element}
        modeling={{ updateProperties }}
        selectedDocumentRef="d1"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove Beschikking' }));
    expect(updateProperties).toHaveBeenCalledWith(element, { 'ronl:documentRef': undefined });
  });
});
