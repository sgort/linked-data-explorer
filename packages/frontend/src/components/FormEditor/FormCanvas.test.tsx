// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const { instances } = vi.hoisted(() => ({ instances: [] as MockFormJsEditor[] }));

interface MockFormJsEditor {
  container: HTMLElement;
  schema: Record<string, unknown> | null;
  listeners: Record<string, () => void>;
  importSchema: (schema: Record<string, unknown>) => Promise<void>;
  on: (event: string, cb: () => void) => void;
  off: (event: string, cb: () => void) => void;
  saveSchema: () => Promise<Record<string, unknown>>;
  destroy: () => void;
  emit: (event: string) => void;
}

vi.mock('@bpmn-io/form-js/dist/assets/form-js.css', () => ({}));
vi.mock('@bpmn-io/form-js/dist/assets/form-js-editor.css', () => ({}));

vi.mock('@bpmn-io/form-js', () => ({
  FormEditor: class {
    container: HTMLElement;
    schema: Record<string, unknown> | null = null;
    listeners: Record<string, () => void> = {};

    constructor(opts: { container: HTMLElement }) {
      this.container = opts.container;
      instances.push(this as unknown as MockFormJsEditor);
    }
    importSchema(schema: Record<string, unknown>) {
      // A schema carrying __fail stands in for one form-js cannot parse.
      if (schema.__fail) return Promise.reject(new Error('bad schema'));
      this.schema = schema;
      return Promise.resolve();
    }
    on(event: string, cb: () => void) {
      this.listeners[event] = cb;
    }
    off(event: string) {
      delete this.listeners[event];
    }
    saveSchema() {
      return Promise.resolve(this.schema);
    }
    destroy() {}
    emit(event: string) {
      this.listeners[event]?.();
    }
  },
}));

import FormCanvas from './FormCanvas';

afterEach(() => {
  instances.length = 0;
  vi.restoreAllMocks();
});

async function renderCanvas(props: Partial<React.ComponentProps<typeof FormCanvas>> = {}) {
  const onSave = props.onSave ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();
  const onDirtyChange = props.onDirtyChange ?? vi.fn();
  render(
    <FormCanvas
      schema={{ id: 'form-1', components: [] }}
      onSave={onSave}
      onClose={onClose}
      onDirtyChange={onDirtyChange}
      {...props}
    />
  );
  await vi.waitFor(() => expect(instances.length).toBe(1));
  return { editor: instances[0], onSave, onClose, onDirtyChange };
}

describe('FormCanvas', () => {
  test('imports the schema into a new form-js editor instance on mount', async () => {
    const { editor } = await renderCanvas({ schema: { id: 'form-1', components: [] } });
    expect(editor.schema).toEqual({ id: 'form-1', components: [] });
  });

  test('the Save button starts disabled and enables once the editor reports a change', async () => {
    const { editor } = await renderCanvas();
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();

    act(() => editor.emit('changed'));
    expect(await screen.findByRole('button', { name: /Save/ })).not.toBeDisabled();
  });

  test('hasFooterChanges alone also enables Save, even with no canvas edits', async () => {
    await renderCanvas({ hasFooterChanges: true });
    expect(screen.getByRole('button', { name: /Save/ })).not.toBeDisabled();
  });

  test('clicking Save calls onSave with the saved schema and resets the dirty state', async () => {
    const { editor, onSave, onDirtyChange } = await renderCanvas();
    act(() => editor.emit('changed'));
    await screen.findByRole('button', { name: /Save/ }).then((b) => expect(b).not.toBeDisabled());

    await userEvent.click(screen.getByRole('button', { name: /Save/ }));

    expect(onSave).toHaveBeenCalledWith({ id: 'form-1', components: [] });
    expect(onDirtyChange).toHaveBeenCalledWith(true);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
  });

  test('a subsequent edit after saving re-triggers the dirty signal', async () => {
    const { editor, onDirtyChange } = await renderCanvas();
    act(() => editor.emit('changed'));
    await userEvent.click(screen.getByRole('button', { name: /Save/ }));

    act(() => editor.emit('changed'));
    expect(await screen.findByRole('button', { name: /Save/ })).not.toBeDisabled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  test('Export builds a .form download with language/organization wrapper metadata', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await renderCanvas({ effectiveLanguage: 'nl', effectiveOrganization: 'flevoland' });
    await userEvent.click(screen.getByText('Export .form'));

    expect(createObjectURL).toHaveBeenCalled();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const text = await blob.text();
    expect(JSON.parse(text)).toEqual({
      id: 'form-1',
      components: [],
      language: 'nl',
      organization: 'flevoland',
    });
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  test('a repeat change event before saving does not re-signal dirty', async () => {
    const { editor, onDirtyChange } = await renderCanvas();

    act(() => editor.emit('changed'));
    act(() => editor.emit('changed'));
    act(() => editor.emit('changed'));

    expect(onDirtyChange).toHaveBeenCalledTimes(1);
    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });

  test('Export omits wrapper metadata when neither language nor organization is set', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = vi.fn();
    let downloadName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloadName = this.download;
    });

    await renderCanvas();
    await userEvent.click(screen.getByText('Export .form'));

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(JSON.parse(await blob.text())).toEqual({ id: 'form-1', components: [] });
    expect(downloadName).toBe('form-1.form');
  });

  test('Export falls back to "form" as the filename when the schema has no id', async () => {
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
    let downloadName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloadName = this.download;
    });

    await renderCanvas({ schema: { components: [] } });
    await userEvent.click(screen.getByText('Export .form'));

    expect(downloadName).toBe('form.form');
  });

  test('logs and keeps the toolbar usable when the schema cannot be imported', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { editor } = await renderCanvas({ schema: { __fail: true } });

    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to import form schema:',
        expect.objectContaining({ message: 'bad schema' })
      )
    );
    // No `changed` listener is wired up, so the canvas can never go dirty.
    expect(editor.listeners.changed).toBeUndefined();
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
  });

  test('Close calls onClose', async () => {
    const { onClose } = await renderCanvas();
    await userEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  test('destroys the editor instance on unmount', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const { unmount } = render(
      <FormCanvas schema={{ id: 'form-1', components: [] }} onSave={onSave} onClose={onClose} />
    );
    await vi.waitFor(() => expect(instances.length).toBe(1));
    const destroySpy = vi.spyOn(instances[0], 'destroy');

    unmount();

    expect(destroySpy).toHaveBeenCalled();
  });
});
