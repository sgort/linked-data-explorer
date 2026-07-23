// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

let store: { id: string; [k: string]: unknown }[] = [];
const getTemplates = vi.fn(() => store);
const saveTemplate = vi.fn((t: { id: string }) => {
  const i = store.findIndex((x) => x.id === t.id);
  if (i >= 0) store[i] = t as never;
  else store.push(t as never);
});
const getTemplate = vi.fn((id: string) => store.find((t) => t.id === id) ?? null);
const deleteTemplate = vi.fn((id: string) => {
  store = store.filter((t) => t.id !== id);
});

vi.mock('../../services/documentService', () => ({
  DocumentService: {
    getTemplates: (...args: unknown[]) => getTemplates(...args),
    saveTemplate: (...args: unknown[]) => saveTemplate(...args),
    getTemplate: (...args: unknown[]) => getTemplate(...args),
    deleteTemplate: (...args: unknown[]) => deleteTemplate(...args),
  },
}));

vi.mock('./defaultTemplates', () => ({
  DEFAULT_TEMPLATES: [
    { id: 'default-1', name: 'Default One', bindings: [], zones: {} },
    { id: 'default-2', name: 'Default Two', bindings: [], zones: {} },
  ],
}));

vi.mock('./ContentLibrary', () => ({ default: () => <div>ContentLibrary stub</div> }));
vi.mock('./AssetLibrary', () => ({
  default: ({ endpoint }: { endpoint: string }) => <div>AssetLibrary stub:{endpoint}</div>,
}));

vi.mock('./DocumentList', () => ({
  default: ({
    templates,
    activeTemplateId,
    effectiveLanguage,
    effectiveOrganization,
    onCreateTemplate,
    onImportTemplate,
    onLoadTemplate,
    onDeleteTemplate,
    onUpdateTemplateName,
    onLanguageChange,
    onOrganizationChange,
  }: {
    templates: { id: string }[];
    activeTemplateId: string | null;
    effectiveLanguage?: string;
    effectiveOrganization?: string;
    onCreateTemplate: () => void;
    onImportTemplate: (t: unknown) => void;
    onLoadTemplate: (id: string) => void;
    onDeleteTemplate: (id: string) => void;
    onUpdateTemplateName: (id: string, name: string) => void;
    onLanguageChange?: (l: string | undefined) => void;
    onOrganizationChange?: (o: string | undefined) => void;
  }) => (
    <div>
      <div>templates:{templates.map((t) => t.id).join(',')}</div>
      <div>active:{activeTemplateId ?? 'none'}</div>
      <div>effLang:{effectiveLanguage ?? 'none'}</div>
      <div>effOrg:{effectiveOrganization ?? 'none'}</div>
      <button onClick={onCreateTemplate}>create-template</button>
      <button
        onClick={() =>
          onImportTemplate({ id: 'imported', name: 'Imported', bindings: [], zones: {} })
        }
      >
        import-template
      </button>
      {templates.map((t) => (
        <button key={t.id} onClick={() => onLoadTemplate(t.id)}>
          load-{t.id}
        </button>
      ))}
      {templates.map((t) => (
        <button key={t.id} onClick={() => onDeleteTemplate(t.id)}>
          delete-{t.id}
        </button>
      ))}
      {activeTemplateId && (
        <button onClick={() => onUpdateTemplateName(activeTemplateId, 'Renamed')}>
          rename-active
        </button>
      )}
      <button onClick={() => onLanguageChange?.('nl')}>set-language</button>
      <button onClick={() => onOrganizationChange?.('flevoland')}>set-org</button>
    </div>
  ),
}));

vi.mock('./DocumentCanvas', () => ({
  default: ({
    template,
    hasChanges,
    onTemplateChange,
    onSave,
    onSaveAs,
    onExport,
    onClose,
  }: {
    template: { id: string; name: string; bindings: { placeholder: string }[] };
    hasChanges: boolean;
    onTemplateChange: (t: unknown) => void;
    onSave: () => void;
    onSaveAs: () => void;
    onExport: () => void;
    onClose: () => void;
  }) => (
    <div>
      <div>canvas-template:{template.id}</div>
      <div>hasChanges:{String(hasChanges)}</div>
      <div>bindings:{template.bindings.map((b) => b.placeholder).join(',')}</div>
      <button onClick={onSave}>save-canvas</button>
      <button onClick={onSaveAs}>saveas-canvas</button>
      <button onClick={onExport}>export-canvas</button>
      <button onClick={onClose}>close-canvas</button>
      <button onClick={() => onTemplateChange({ ...template, name: 'Edited' })}>edit-canvas</button>
    </div>
  ),
}));

vi.mock('./BindingPanel', () => ({
  default: ({
    processKey,
    bindings,
    onAdd,
    onDelete,
    onUpdateProcessKey,
  }: {
    processKey?: string;
    bindings: { id: string }[];
    onAdd: (b: unknown) => void;
    onDelete: (id: string) => void;
    onUpdateProcessKey: (key: string) => void;
  }) => (
    <div>
      <div>processKey:{processKey ?? 'none'}</div>
      <div>bindings-count:{bindings.length}</div>
      <button onClick={() => onAdd({ placeholder: '{{x}}', variableKey: 'x', source: 'process' })}>
        add-binding
      </button>
      {bindings.map((b) => (
        <button key={b.id} onClick={() => onDelete(b.id)}>
          delete-binding-{b.id}
        </button>
      ))}
      <button onClick={() => onUpdateProcessKey('NewProcess')}>set-processkey</button>
    </div>
  ),
}));

import DocumentComposer from './DocumentComposer';

afterEach(() => {
  vi.restoreAllMocks();
  store = [];
  getTemplates.mockClear();
  saveTemplate.mockClear();
  getTemplate.mockClear();
  deleteTemplate.mockClear();
});

describe('DocumentComposer — bootstrap', () => {
  test('seeds every default template when the store is empty, and activates the first one', () => {
    render(<DocumentComposer endpoint="e" />);

    expect(saveTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: 'default-1' }));
    expect(saveTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: 'default-2' }));
    expect(screen.getByText('active:default-1')).toBeTruthy();
  });

  test('does not reseed when every default template already exists', () => {
    store = [
      { id: 'default-1', name: 'Default One', bindings: [], zones: {} },
      { id: 'default-2', name: 'Default Two', bindings: [], zones: {} },
    ];
    render(<DocumentComposer endpoint="e" />);

    expect(saveTemplate).not.toHaveBeenCalled();
    expect(screen.getByText('templates:default-1,default-2')).toBeTruthy();
    expect(screen.getByText('active:none')).toBeTruthy();
  });

  test('shows the "no document selected" placeholder with no active template', () => {
    store = [
      { id: 'default-1', name: 'Default One', bindings: [], zones: {} },
      { id: 'default-2', name: 'Default Two', bindings: [], zones: {} },
    ];
    render(<DocumentComposer endpoint="e" />);
    expect(screen.getByText('No document selected')).toBeTruthy();
  });
});

describe('DocumentComposer — template CRUD', () => {
  test('"Create New document" (empty state) creates a blank template and activates it', async () => {
    store = [
      { id: 'default-1', name: 'Default One', bindings: [], zones: {} },
      { id: 'default-2', name: 'Default Two', bindings: [], zones: {} },
    ];
    render(<DocumentComposer endpoint="e" />);

    await userEvent.click(screen.getByText('Create New document'));

    expect(saveTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: 'New document' }));
    expect(await screen.findByText(/canvas-template:doc_/)).toBeTruthy();
  });

  test('importing a template saves and activates it', async () => {
    store = [];
    render(<DocumentComposer endpoint="e" />);

    await userEvent.click(screen.getByText('import-template'));

    expect(saveTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: 'imported' }));
    expect(screen.getByText('canvas-template:imported')).toBeTruthy();
  });

  test('loading a template activates it and renders it in the canvas', async () => {
    store = [{ id: 'default-1', name: 'Default One', bindings: [], zones: {} }];
    render(<DocumentComposer endpoint="e" />);

    await userEvent.click(screen.getByText('load-default-1'));
    expect(screen.getByText('canvas-template:default-1')).toBeTruthy();
  });

  test('loading a different template while dirty asks for confirmation, cancelled when declined', async () => {
    store = [
      { id: 'd1', name: 'One', bindings: [], zones: {} },
      { id: 'd2', name: 'Two', bindings: [], zones: {} },
    ];
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<DocumentComposer endpoint="e" />);

    await userEvent.click(screen.getByText('load-d1'));
    await userEvent.click(screen.getByText('edit-canvas'));
    await userEvent.click(screen.getByText('load-d2'));

    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getByText('active:d1')).toBeTruthy();
  });

  test('renaming an active template calls DocumentService.saveTemplate with the new name', async () => {
    store = [{ id: 'd1', name: 'One', bindings: [], zones: {} }];
    render(<DocumentComposer endpoint="e" />);

    await userEvent.click(screen.getByText('load-d1'));
    await userEvent.click(screen.getByText('rename-active'));

    expect(saveTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'd1', name: 'Renamed' })
    );
  });

  test('deleting an example template alerts and does not call deleteTemplate', async () => {
    store = [{ id: 'd1', name: 'One', bindings: [], zones: {}, status: 'example' }];
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<DocumentComposer endpoint="e" />);

    await userEvent.click(screen.getByText('delete-d1'));

    expect(alertSpy).toHaveBeenCalledWith('Example documents cannot be deleted.');
    expect(deleteTemplate).not.toHaveBeenCalled();
  });

  test('deleting a regular template asks for confirmation and clears the active template if selected', async () => {
    store = [{ id: 'd1', name: 'One', bindings: [], zones: {} }];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DocumentComposer endpoint="e" />);

    await userEvent.click(screen.getByText('load-d1'));
    await userEvent.click(screen.getByText('delete-d1'));

    expect(deleteTemplate).toHaveBeenCalledWith('d1');
    expect(screen.getByText('active:none')).toBeTruthy();
  });
});

describe('DocumentComposer — save / save as / export / close', () => {
  test('Save merges footer draft edits and persists via DocumentService', async () => {
    store = [{ id: 'd1', name: 'One', bindings: [], zones: {} }];
    render(<DocumentComposer endpoint="e" />);

    await userEvent.click(screen.getByText('load-d1'));
    await userEvent.click(screen.getByText('set-language'));
    await userEvent.click(screen.getByText('save-canvas'));

    expect(saveTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'd1', language: 'nl' })
    );
  });

  test('Save As prompts for a name and creates a new template with a fresh id', async () => {
    store = [{ id: 'd1', name: 'One', bindings: [], zones: {} }];
    vi.spyOn(window, 'prompt').mockReturnValue('Copy of One');
    render(<DocumentComposer endpoint="e" />);

    await userEvent.click(screen.getByText('load-d1'));
    await userEvent.click(screen.getByText('saveas-canvas'));

    expect(saveTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Copy of One', readonly: false, status: 'wip' })
    );
  });

  test('Save As does nothing when the prompt is cancelled', async () => {
    store = [
      { id: 'd1', name: 'One', bindings: [], zones: {} },
      { id: 'default-1', name: 'Default One', bindings: [], zones: {} },
      { id: 'default-2', name: 'Default Two', bindings: [], zones: {} },
    ];
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    render(<DocumentComposer endpoint="e" />);

    await userEvent.click(screen.getByText('load-d1'));
    await userEvent.click(screen.getByText('saveas-canvas'));

    expect(saveTemplate).not.toHaveBeenCalled();
  });

  test('Export builds a .document blob download', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    store = [{ id: 'd1', name: 'One', bindings: [], zones: {} }];
    render(<DocumentComposer endpoint="e" />);
    await userEvent.click(screen.getByText('load-d1'));
    await userEvent.click(screen.getByText('export-canvas'));

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  test('Close without unsaved changes closes immediately, without confirming', async () => {
    store = [{ id: 'd1', name: 'One', bindings: [], zones: {} }];
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<DocumentComposer endpoint="e" />);

    await userEvent.click(screen.getByText('load-d1'));
    await userEvent.click(screen.getByText('close-canvas'));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByText('No document selected')).toBeTruthy();
  });
});

describe('DocumentComposer — bindings and left-panel tabs', () => {
  test('adding a binding updates the canvas-visible template', async () => {
    store = [{ id: 'd1', name: 'One', bindings: [], zones: {} }];
    render(<DocumentComposer endpoint="e" />);

    await userEvent.click(screen.getByText('load-d1'));
    await userEvent.click(screen.getByText('add-binding'));

    expect(screen.getByText('bindings:{{x}}')).toBeTruthy();
  });

  test('updating the process key flows through to BindingPanel', async () => {
    store = [{ id: 'd1', name: 'One', bindings: [], zones: {} }];
    render(<DocumentComposer endpoint="e" />);

    await userEvent.click(screen.getByText('load-d1'));
    await userEvent.click(screen.getByText('set-processkey'));

    expect(screen.getByText('processKey:NewProcess')).toBeTruthy();
  });

  test('switches between the Content and Logos (assets) left-panel tabs', async () => {
    store = [{ id: 'default-1', name: 'Default One', bindings: [], zones: {} }];
    render(<DocumentComposer endpoint="https://example.com/sparql" />);

    expect(screen.getByText('ContentLibrary stub')).toBeTruthy();
    await userEvent.click(screen.getByText('Logos'));
    expect(screen.getByText('AssetLibrary stub:https://example.com/sparql')).toBeTruthy();
  });
});
