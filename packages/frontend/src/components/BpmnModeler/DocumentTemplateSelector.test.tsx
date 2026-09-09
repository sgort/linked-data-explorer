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

  test('lists templates and pre-selects the current documentRef', () => {
    getTemplates.mockReturnValue([template()]);
    render(
      <DocumentTemplateSelector
        element={{}}
        modeling={{ updateProperties: vi.fn() }}
        selectedDocumentRef="d1"
      />
    );

    expect(screen.getByText('📄 Beschikking')).toBeTruthy();
    expect(screen.getByRole('combobox')).toHaveValue('d1');
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

  test('selecting a template writes ronl:documentRef to the element', async () => {
    getTemplates.mockReturnValue([template()]);
    const updateProperties = vi.fn();
    const element = { id: 'task1' };
    render(<DocumentTemplateSelector element={element} modeling={{ updateProperties }} />);

    await userEvent.selectOptions(screen.getByRole('combobox'), 'd1');
    expect(updateProperties).toHaveBeenCalledWith(element, { 'ronl:documentRef': 'd1' });
  });

  test('clearing the selection removes ronl:documentRef', async () => {
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

    await userEvent.selectOptions(screen.getByRole('combobox'), '');
    expect(updateProperties).toHaveBeenCalledWith(element, { 'ronl:documentRef': undefined });
  });
});
