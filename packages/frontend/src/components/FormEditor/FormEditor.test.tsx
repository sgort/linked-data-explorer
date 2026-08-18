// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const getForms = vi.fn();
const saveForm = vi.fn();
const getForm = vi.fn();
const deleteForm = vi.fn();
const hydrateFromServer = vi.fn();

vi.mock('../../services/formService', () => ({
  FormService: {
    getForms: (...args: unknown[]) => getForms(...args),
    saveForm: (...args: unknown[]) => saveForm(...args),
    getForm: (...args: unknown[]) => getForm(...args),
    deleteForm: (...args: unknown[]) => deleteForm(...args),
    hydrateFromServer: (...args: unknown[]) => hydrateFromServer(...args),
  },
}));

const getStoredVersion = vi.fn();
const setStoredVersion = vi.fn();
vi.mock('../../utils/exampleVersions', () => ({
  EXAMPLE_VERSIONS: new Proxy({}, { get: () => 1 }),
  getStoredVersion: (...args: unknown[]) => getStoredVersion(...args),
  setStoredVersion: (...args: unknown[]) => setStoredVersion(...args),
}));

vi.mock('./FormList', () => ({
  default: ({
    forms,
    activeFormId,
    onCreateForm,
    onImportForm,
    onLoadForm,
    onDeleteForm,
    onUpdateFormName,
    onLanguageChange,
    onOrganizationChange,
  }: {
    forms: { id: string }[];
    activeFormId: string | null;
    onCreateForm: () => void;
    onImportForm: (
      schema: unknown,
      name: string,
      lang?: string,
      org?: string,
      isE2EFixture?: boolean
    ) => void;
    onLoadForm: (id: string) => void;
    onDeleteForm: (id: string) => void;
    onUpdateFormName: (id: string, name: string) => void;
    onLanguageChange?: (lang: string | undefined) => void;
    onOrganizationChange?: (org: string | undefined) => void;
  }) => (
    <div>
      <div>forms:{forms.map((f) => f.id).join(',')}</div>
      <div>active:{activeFormId ?? 'none'}</div>
      <button onClick={onCreateForm}>create-form</button>
      <button onClick={() => onImportForm({ components: [] }, 'Imported form', 'nl', 'flevoland')}>
        import-form
      </button>
      <button
        onClick={() =>
          onImportForm({ components: [] }, 'Imported E2E form', 'nl', 'flevoland', true)
        }
      >
        import-e2e-form
      </button>
      {forms.map((f) => (
        <button key={f.id} onClick={() => onLoadForm(f.id)}>
          load-{f.id}
        </button>
      ))}
      {forms.map((f) => (
        <button key={f.id} onClick={() => onDeleteForm(f.id)}>
          delete-{f.id}
        </button>
      ))}
      {activeFormId && (
        <button onClick={() => onUpdateFormName(activeFormId, 'Renamed')}>rename-active</button>
      )}
      <button onClick={() => onLanguageChange?.('nl')}>set-language</button>
      <button onClick={() => onOrganizationChange?.('flevoland')}>set-org</button>
    </div>
  ),
}));

vi.mock('./FormCanvas', () => ({
  default: ({
    schema,
    onSave,
    onClose,
    onDirtyChange,
  }: {
    schema: Record<string, unknown>;
    onSave: (schema: Record<string, unknown>) => void;
    onClose: () => void;
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <div>
      <div>canvas-schema:{JSON.stringify(schema)}</div>
      <button onClick={() => onSave({ ...schema, edited: true })}>save-canvas</button>
      <button onClick={onClose}>close-canvas</button>
      <button onClick={() => onDirtyChange?.(true)}>mark-dirty</button>
    </div>
  ),
}));

import FormEditor from './FormEditor';

function form(
  overrides: Partial<{
    id: string;
    name: string;
    schema: Record<string, unknown>;
    status: string;
    readonly: boolean;
    language: string;
    organization: string;
    createdAt: string;
    updatedAt: string;
  }> = {}
) {
  return {
    id: 'f1',
    name: 'Aanvraagformulier',
    schema: { id: 'f1' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  getForms.mockReset();
  saveForm.mockReset();
  getForm.mockReset();
  deleteForm.mockReset();
  hydrateFromServer.mockReset();
  getStoredVersion.mockReset();
  setStoredVersion.mockReset();
});

describe('FormEditor — bootstrap', () => {
  test('loads forms from FormService on mount, then hydrates from the server', async () => {
    getForms.mockReturnValue([form()]);
    getStoredVersion.mockReturnValue(Infinity); // skip all example seeding
    hydrateFromServer.mockResolvedValue([form(), form({ id: 'f2', name: 'Server form' })]);

    render(<FormEditor />);

    expect(screen.getByText('forms:f1')).toBeTruthy();
    expect(await screen.findByText('forms:f1,f2')).toBeTruthy();
  });

  test('shows the "no form selected" placeholder when nothing is active', () => {
    getForms.mockReturnValue([]);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([]);

    render(<FormEditor />);
    expect(screen.getByText('No form selected')).toBeTruthy();
  });

  test('seeds a stale example form: fetches its schema, saves it, and makes it active', async () => {
    getForms.mockReturnValue([]);
    hydrateFromServer.mockResolvedValue([]);
    // First example id is 'example_kapvergunning_start' — force only that one to be stale.
    getStoredVersion.mockImplementation((id: string) =>
      id === 'example_kapvergunning_start' ? 0 : Infinity
    );
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ id: 'example_kapvergunning_start', components: [] }),
    });

    render(<FormEditor />);

    await vi.waitFor(() =>
      expect(saveForm).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'example_kapvergunning_start', status: 'example' })
      )
    );
    expect(setStoredVersion).toHaveBeenCalledWith('example_kapvergunning_start', 1);
  });
});

describe('FormEditor — create / import / load / save / delete', () => {
  test('"Create New Form" (empty state) creates a blank form and makes it active', async () => {
    getForms.mockReturnValue([]);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([]);
    render(<FormEditor />);
    await screen.findByText('No form selected');

    await userEvent.click(screen.getByText('Create New Form'));

    expect(saveForm).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Form', status: 'wip' })
    );
    const [[savedForm]] = saveForm.mock.calls;
    expect(await screen.findByText(`active:${savedForm.id}`)).toBeTruthy();
  });

  test("the sidebar's create-form button does the same", async () => {
    getForms.mockReturnValue([]);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([]);
    render(<FormEditor />);

    await userEvent.click(screen.getByText('create-form'));
    expect(saveForm).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Form' }));
  });

  test('importing a form saves it with the inferred language/organization and activates it', async () => {
    getForms.mockReturnValue([]);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([]);
    render(<FormEditor />);

    await userEvent.click(screen.getByText('import-form'));

    expect(saveForm).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Imported form',
        schema: { components: [] },
        language: 'nl',
        organization: 'flevoland',
        status: 'wip',
      })
    );
  });

  test('importing an e2e-fixtures form saves it with status "e2e" instead of "wip"', async () => {
    getForms.mockReturnValue([]);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([]);
    render(<FormEditor />);

    await userEvent.click(screen.getByText('import-e2e-form'));

    expect(saveForm).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Imported E2E form', status: 'e2e' })
    );
  });

  test('loading a form makes it active and renders its schema in the canvas', async () => {
    getForms.mockReturnValue([form(), form({ id: 'f2', name: 'Other', schema: { id: 'f2' } })]);
    getForm.mockImplementation((id: string) =>
      id === 'f2' ? form({ id: 'f2', name: 'Other', schema: { id: 'f2' } }) : form()
    );
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getForms());
    render(<FormEditor />);

    await userEvent.click(screen.getByText('load-f2'));

    expect(screen.getByText('active:f2')).toBeTruthy();
    expect(screen.getByText('canvas-schema:{"id":"f2"}')).toBeTruthy();
  });

  test('loading a different form while dirty asks for confirmation, and is cancelled when declined', async () => {
    getForms.mockReturnValue([form(), form({ id: 'f2', name: 'Other' })]);
    getForm.mockReturnValue(form());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getForms());
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<FormEditor />);

    await userEvent.click(screen.getByText('load-f1'));
    await userEvent.click(screen.getByText('mark-dirty'));
    await userEvent.click(screen.getByText('load-f2'));

    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getByText('active:f1')).toBeTruthy();
  });

  test('saving from the canvas merges the schema and footer draft, then refreshes the list', async () => {
    getForms.mockReturnValue([form()]);
    getForm.mockReturnValue(form());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getForms());
    render(<FormEditor />);

    await userEvent.click(screen.getByText('load-f1'));
    await userEvent.click(screen.getByText('set-language'));
    await userEvent.click(screen.getByText('save-canvas'));

    expect(saveForm).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f1', schema: { id: 'f1', edited: true }, language: 'nl' })
    );
  });

  test('renaming an active form calls FormService.saveForm with the new name', async () => {
    getForms.mockReturnValue([form()]);
    getForm.mockReturnValue(form());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getForms());
    render(<FormEditor />);

    await userEvent.click(screen.getByText('load-f1'));
    await userEvent.click(screen.getByText('rename-active'));

    expect(saveForm).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1', name: 'Renamed' }));
  });

  test('deleting an example form alerts and does not call FormService.deleteForm', async () => {
    getForms.mockReturnValue([form({ status: 'example' })]);
    getForm.mockReturnValue(form({ status: 'example' }));
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getForms());
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<FormEditor />);

    await userEvent.click(screen.getByText('delete-f1'));

    expect(alertSpy).toHaveBeenCalledWith('Cannot delete example forms');
    expect(deleteForm).not.toHaveBeenCalled();
  });

  test('deleting a regular form asks for confirmation and clears the active form if it was selected', async () => {
    getForms.mockReturnValue([form()]);
    getForm.mockReturnValue(form());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getForms());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<FormEditor />);

    await userEvent.click(screen.getByText('load-f1'));
    await userEvent.click(screen.getByText('delete-f1'));

    expect(deleteForm).toHaveBeenCalledWith('f1');
    expect(screen.getByText('active:none')).toBeTruthy();
  });
});

describe('FormEditor — close / discard-changes gate', () => {
  test('closing without unsaved changes closes immediately, without confirming', async () => {
    getForms.mockReturnValue([form()]);
    getForm.mockReturnValue(form());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getForms());
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<FormEditor />);

    await userEvent.click(screen.getByText('load-f1'));
    await userEvent.click(screen.getByText('close-canvas'));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByText('No form selected')).toBeTruthy();
  });

  test('closing with unsaved canvas changes asks for confirmation', async () => {
    getForms.mockReturnValue([form()]);
    getForm.mockReturnValue(form());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getForms());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<FormEditor />);

    await userEvent.click(screen.getByText('load-f1'));
    await userEvent.click(screen.getByText('mark-dirty'));
    await userEvent.click(screen.getByText('close-canvas'));

    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getByText('No form selected')).toBeTruthy();
  });
});
