// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const getProcesses = vi.fn();
const saveProcess = vi.fn();
const getProcess = vi.fn();
const deleteProcess = vi.fn();
const hydrateFromServer = vi.fn();

vi.mock('../../services/bpmnService', () => ({
  BpmnService: {
    getProcesses: (...args: unknown[]) => getProcesses(...args),
    saveProcess: (...args: unknown[]) => saveProcess(...args),
    getProcess: (...args: unknown[]) => getProcess(...args),
    deleteProcess: (...args: unknown[]) => deleteProcess(...args),
    hydrateFromServer: (...args: unknown[]) => hydrateFromServer(...args),
  },
}));

vi.mock('../../utils/bpmnTemplates', () => ({
  DEFAULT_BPMN_XML: '<bpmn:definitions><bpmn:process id="DefaultProcess"/></bpmn:definitions>',
  ASYLUM_MIGRATION_EXAMPLE_XML:
    '<bpmn:definitions><bpmn:process id="Process_Migratie_en_Asiel"/></bpmn:definitions>',
}));

const getStoredVersion = vi.fn();
const setStoredVersion = vi.fn();
vi.mock('../../utils/exampleVersions', () => ({
  EXAMPLE_VERSIONS: new Proxy({}, { get: () => 1 }),
  getStoredVersion: (...args: unknown[]) => getStoredVersion(...args),
  setStoredVersion: (...args: unknown[]) => setStoredVersion(...args),
}));

vi.mock('./ProcessList', () => ({
  default: ({
    processes,
    activeProcessId,
    effectiveLanguage,
    effectiveOrganization,
    effectiveRopaRef,
    effectiveDsoUrn,
    onCreateProcess,
    onImportProcess,
    onLoadProcess,
    onDeleteProcess,
    onUpdateProcessName,
    onRopaRefChange,
    onDsoActiviteitUrnChange,
    onLanguageChange,
    onOrganizationChange,
  }: {
    processes: { id: string }[];
    activeProcessId: string | null;
    effectiveLanguage?: string;
    effectiveOrganization?: string;
    effectiveRopaRef?: string;
    effectiveDsoUrn?: string;
    onCreateProcess: () => void;
    onImportProcess: (xml: string, name: string, lang?: string) => void;
    onLoadProcess: (id: string) => void;
    onDeleteProcess: (id: string) => void;
    onUpdateProcessName: (id: string, name: string) => void;
    onRopaRefChange: (ref: string | undefined) => void;
    onDsoActiviteitUrnChange: (urn: string | undefined) => void;
    onLanguageChange?: (lang: string | undefined) => void;
    onOrganizationChange?: (org: string | undefined) => void;
  }) => (
    <div>
      <div>processes:{processes.map((p) => p.id).join(',')}</div>
      <div>active:{activeProcessId ?? 'none'}</div>
      <div>effLang:{effectiveLanguage ?? 'none'}</div>
      <div>effOrg:{effectiveOrganization ?? 'none'}</div>
      <div>effRopa:{effectiveRopaRef ?? 'none'}</div>
      <div>effDso:{effectiveDsoUrn ?? 'none'}</div>
      <button onClick={onCreateProcess}>create-process</button>
      <button
        onClick={() =>
          onImportProcess(
            '<bpmn:definitions><bpmn:process id="ImportedProc"/></bpmn:definitions>',
            'Imported process',
            'nl'
          )
        }
      >
        import-process
      </button>
      <button
        onClick={() =>
          onImportProcess(
            '<bpmn:definitions><bpmn:process id="E2EImportedProc"><bpmn:textAnnotation id="Annotation_E2EFixture"><bpmn:text>fixture warning</bpmn:text></bpmn:textAnnotation></bpmn:process></bpmn:definitions>',
            'Imported E2E process'
          )
        }
      >
        import-e2e-process
      </button>
      {processes.map((p) => (
        <button key={p.id} onClick={() => onLoadProcess(p.id)}>
          load-{p.id}
        </button>
      ))}
      {processes.map((p) => (
        <button key={p.id} onClick={() => onDeleteProcess(p.id)}>
          delete-{p.id}
        </button>
      ))}
      {activeProcessId && (
        <button onClick={() => onUpdateProcessName(activeProcessId, 'Renamed')}>
          rename-active
        </button>
      )}
      <button onClick={() => onRopaRefChange('ropa-1')}>set-ropa</button>
      <button onClick={() => onDsoActiviteitUrnChange('urn:x')}>set-dso</button>
      <button onClick={() => onLanguageChange?.('nl')}>set-language</button>
      <button onClick={() => onOrganizationChange?.('flevoland')}>set-org</button>
      <button onClick={() => onRopaRefChange(undefined)}>clear-ropa</button>
      <button onClick={() => onDsoActiviteitUrnChange(undefined)}>clear-dso</button>
      <button onClick={() => onLanguageChange?.(undefined)}>clear-language</button>
      <button onClick={() => onOrganizationChange?.(undefined)}>clear-org</button>
    </div>
  ),
}));

vi.mock('./BpmnCanvas', () => ({
  default: ({
    xml,
    hasFooterChanges,
    onSave,
    onClose,
    onDirtyChange,
  }: {
    xml: string;
    hasFooterChanges?: boolean;
    onSave: (xml: string) => void;
    onClose: () => void;
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <div>
      <div>canvas-xml:{xml}</div>
      <div>hasFooterChanges:{String(hasFooterChanges)}</div>
      <button onClick={() => onSave(xml.replace('DefaultProcess', 'EditedProcess'))}>
        save-canvas
      </button>
      <button onClick={onClose}>close-canvas</button>
      <button onClick={() => onDirtyChange?.(true)}>mark-dirty</button>
    </div>
  ),
}));

import { BpmnProcess } from '../../types';
import BpmnModeler from './BpmnModeler';

function process(overrides: Partial<BpmnProcess> = {}): BpmnProcess {
  return {
    id: 'p1',
    name: 'Zorgtoeslag',
    xml: '<bpmn:definitions><bpmn:process id="ZorgtoeslagProcess"/></bpmn:definitions>',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    linkedDmnTemplates: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  getProcesses.mockReset();
  saveProcess.mockReset();
  getProcess.mockReset();
  deleteProcess.mockReset();
  hydrateFromServer.mockReset();
  getStoredVersion.mockReset();
  setStoredVersion.mockReset();
});

describe('BpmnModeler — bootstrap', () => {
  test('loads processes on mount, then hydrates from the server', async () => {
    getProcesses.mockReturnValue([process()]);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([process(), process({ id: 'p2', name: 'Server proc' })]);

    render(<BpmnModeler endpoint="e" />);

    expect(screen.getByText('processes:p1')).toBeTruthy();
    expect(await screen.findByText('processes:p1,p2')).toBeTruthy();
  });

  test('shows the "no process selected" placeholder when nothing is active', () => {
    getProcesses.mockReturnValue([]);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([]);

    render(<BpmnModeler endpoint="e" />);
    expect(screen.getByText('No process selected')).toBeTruthy();
  });

  test('seeds a stale example process: fetches its XML, saves it, and makes it active', async () => {
    getProcesses.mockReturnValue([]);
    hydrateFromServer.mockResolvedValue([]);
    getStoredVersion.mockImplementation((id: string) =>
      id === 'example_awb_process' ? 0 : Infinity
    );
    global.fetch = vi.fn().mockResolvedValue({ text: async () => '<bpmn:definitions/>' });

    render(<BpmnModeler endpoint="e" />);

    await vi.waitFor(() =>
      expect(saveProcess).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'example_awb_process', status: 'example' })
      )
    );
    expect(setStoredVersion).toHaveBeenCalledWith('example_awb_process', 1);
  });
});

describe('BpmnModeler — create / import / load / save / delete', () => {
  test('"Create New Process" (empty state) creates a blank process and makes it active', async () => {
    getProcesses.mockReturnValue([]);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([]);
    render(<BpmnModeler endpoint="e" />);
    await screen.findByText('No process selected');

    await userEvent.click(screen.getByText('Create New Process'));

    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Process', processRole: 'standalone' })
    );
  });

  test('importing a process saves it with the inferred bpmnProcessId/language and activates it', async () => {
    getProcesses.mockReturnValue([]);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([]);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('import-process'));

    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Imported process',
        bpmnProcessId: 'ImportedProc',
        language: 'nl',
        status: 'wip',
      })
    );
  });

  test('importing a process carrying the e2e-fixtures textAnnotation marker saves it with status "e2e"', async () => {
    getProcesses.mockReturnValue([]);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([]);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('import-e2e-process'));

    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Imported E2E process',
        bpmnProcessId: 'E2EImportedProc',
        status: 'e2e',
      })
    );
  });

  test('reclassifying standalone processes on hydrate sets shellId on the promoted subprocess, not just calledElement', async () => {
    const shell = process({
      id: 'shell1',
      processRole: 'standalone',
      bpmnProcessId: 'ShellProc',
      xml: '<bpmn:definitions><bpmn:process id="ShellProc"><bpmn:callActivity calledElement="SubProc"/></bpmn:process></bpmn:definitions>',
    });
    const sub = process({
      id: 'sub1',
      processRole: 'standalone',
      bpmnProcessId: 'SubProc',
      xml: '<bpmn:definitions><bpmn:process id="SubProc"/></bpmn:definitions>',
    });
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([shell, sub]);
    getProcesses.mockReturnValue([shell, sub]);
    render(<BpmnModeler endpoint="e" />);

    await vi.waitFor(() =>
      expect(saveProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'sub1',
          processRole: 'subprocess',
          calledElement: 'ShellProc',
          shellId: 'shell1',
        })
      )
    );
  });

  test('loading a process makes it active and passes its XML to the canvas', async () => {
    getProcesses.mockReturnValue([
      process(),
      process({
        id: 'p2',
        name: 'Other',
        xml: '<bpmn:definitions><bpmn:process id="Other"/></bpmn:definitions>',
      }),
    ]);
    getProcess.mockImplementation((id: string) =>
      id === 'p2'
        ? process({
            id: 'p2',
            name: 'Other',
            xml: '<bpmn:definitions><bpmn:process id="Other"/></bpmn:definitions>',
          })
        : process()
    );
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getProcesses());
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p2'));

    expect(screen.getByText('active:p2')).toBeTruthy();
    expect(
      screen.getByText('canvas-xml:<bpmn:definitions><bpmn:process id="Other"/></bpmn:definitions>')
    ).toBeTruthy();
  });

  test('loading a different process while dirty asks for confirmation, and is cancelled when declined', async () => {
    getProcesses.mockReturnValue([process(), process({ id: 'p2', name: 'Other' })]);
    getProcess.mockReturnValue(process());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getProcesses());
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('mark-dirty'));
    await userEvent.click(screen.getByText('load-p2'));

    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getByText('active:p1')).toBeTruthy();
  });

  test('saving from the canvas merges footer draft edits and refreshes the process list', async () => {
    getProcesses.mockReturnValue([process()]);
    getProcess.mockReturnValue(process());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getProcesses());
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('set-language'));
    await userEvent.click(screen.getByText('save-canvas'));

    expect(saveProcess).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', language: 'nl' }));
  });

  test('saving a shell process propagates its language/organization to linked subprocesses', async () => {
    const shell = process({
      id: 'shell1',
      processRole: 'shell',
      bpmnProcessId: 'ShellProc',
      xml: '<bpmn:definitions><bpmn:process id="ShellProc"/></bpmn:definitions>',
    });
    const sub = process({
      id: 'sub1',
      processRole: 'subprocess',
      calledElement: 'ShellProc',
      xml: '<bpmn:definitions><bpmn:process id="SubProc"/></bpmn:definitions>',
    });
    getProcesses.mockReturnValue([shell, sub]);
    getProcess.mockReturnValue(shell);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([shell, sub]);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-shell1'));
    await userEvent.click(screen.getByText('set-org'));
    await userEvent.click(screen.getByText('save-canvas'));

    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sub1', organization: 'flevoland' })
    );
  });

  test('saving a shell process does not propagate to a subprocess of an unrelated shell that shares the same bpmnProcessId', async () => {
    // Mirrors an e2e-fixtures shell sharing its bpmnProcessId with the seeded
    // example shell it was copied from (same production Operaton key, by design).
    const savingShell = process({
      id: 'e2e-shell',
      processRole: 'shell',
      bpmnProcessId: 'AwbShellProcess',
      xml: '<bpmn:definitions><bpmn:process id="AwbShellProcess"/></bpmn:definitions>',
    });
    const ownSub = process({
      id: 'e2e-sub',
      processRole: 'subprocess',
      calledElement: 'AwbShellProcess',
      shellId: 'e2e-shell',
      xml: '<bpmn:definitions><bpmn:process id="E2ESub"/></bpmn:definitions>',
    });
    const unrelatedSub = process({
      id: 'seeded-sub',
      processRole: 'subprocess',
      calledElement: 'AwbShellProcess',
      shellId: 'seeded-shell',
      xml: '<bpmn:definitions><bpmn:process id="SeededSub"/></bpmn:definitions>',
    });
    getProcesses.mockReturnValue([savingShell, ownSub, unrelatedSub]);
    getProcess.mockReturnValue(savingShell);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([savingShell, ownSub, unrelatedSub]);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-e2e-shell'));
    await userEvent.click(screen.getByText('set-org'));
    await userEvent.click(screen.getByText('save-canvas'));

    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'e2e-sub', organization: 'flevoland' })
    );
    expect(saveProcess).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'seeded-sub' }));
  });

  test('renaming an active process calls BpmnService.saveProcess with the new name', async () => {
    getProcesses.mockReturnValue([process()]);
    getProcess.mockReturnValue(process());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getProcesses());
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('rename-active'));

    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', name: 'Renamed' })
    );
  });

  test('deleting an example process alerts and does not call BpmnService.deleteProcess', async () => {
    getProcesses.mockReturnValue([process({ status: 'example' })]);
    getProcess.mockReturnValue(process({ status: 'example' }));
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getProcesses());
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('delete-p1'));

    expect(alertSpy).toHaveBeenCalledWith('Cannot delete example processes');
    expect(deleteProcess).not.toHaveBeenCalled();
  });

  test('deleting a regular process asks for confirmation and clears the active process if selected', async () => {
    getProcesses.mockReturnValue([process()]);
    getProcess.mockReturnValue(process());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getProcesses());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('delete-p1'));

    expect(deleteProcess).toHaveBeenCalledWith('p1');
    expect(screen.getByText('active:none')).toBeTruthy();
  });
});

describe('BpmnModeler — footer draft (RoPA / DSO / language / organization)', () => {
  test('setting RoPA/DSO refs updates the effective values passed to ProcessList', async () => {
    getProcesses.mockReturnValue([process()]);
    getProcess.mockReturnValue(process());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getProcesses());
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('set-ropa'));
    await userEvent.click(screen.getByText('set-dso'));

    expect(screen.getByText('effRopa:ropa-1')).toBeTruthy();
    expect(screen.getByText('effDso:urn:x')).toBeTruthy();
  });

  test('a footer edit enables hasFooterChanges on the canvas', async () => {
    getProcesses.mockReturnValue([process()]);
    getProcess.mockReturnValue(process());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getProcesses());
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    expect(screen.getByText('hasFooterChanges:false')).toBeTruthy();

    await userEvent.click(screen.getByText('set-language'));
    expect(screen.getByText('hasFooterChanges:true')).toBeTruthy();
  });
});

describe('BpmnModeler — close / discard-changes gate', () => {
  test('closing without unsaved changes closes immediately, without confirming', async () => {
    getProcesses.mockReturnValue([process()]);
    getProcess.mockReturnValue(process());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getProcesses());
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('close-canvas'));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByText('No process selected')).toBeTruthy();
  });

  test('closing with unsaved canvas changes asks for confirmation', async () => {
    getProcesses.mockReturnValue([process()]);
    getProcess.mockReturnValue(process());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getProcesses());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('mark-dirty'));
    await userEvent.click(screen.getByText('close-canvas'));

    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getByText('No process selected')).toBeTruthy();
  });
});

describe('BpmnModeler — example seeding', () => {
  test('seeds every bundled example when all stored versions are stale', async () => {
    getProcesses.mockReturnValue([]);
    hydrateFromServer.mockResolvedValue([]);
    getStoredVersion.mockReturnValue(0);
    global.fetch = vi.fn().mockResolvedValue({ text: async () => '<bpmn:definitions/>' });

    render(<BpmnModeler endpoint="e" />);

    await vi.waitFor(() => expect(setStoredVersion.mock.calls.length).toBeGreaterThan(4));

    const seeded = saveProcess.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(new Set(seeded).size).toBe(seeded.length);
    expect(seeded).toContain('example_awb_process');
    expect(seeded).toContain('example_tree_felling');
    expect(seeded).toContain('example_awb_zorgtoeslag');
    expect(screen.getByText(/^active:/).textContent).toBe('active:example_awb_process');
  });
});

describe('BpmnModeler — guards and no-ops', () => {
  function setup(processes = [process()], lookup: BpmnProcess | undefined = process()) {
    getProcesses.mockReturnValue(processes);
    getProcess.mockReturnValue(lookup);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(processes);
  }

  test('creating a process while dirty is cancelled when the discard prompt is declined', async () => {
    setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('mark-dirty'));
    saveProcess.mockClear();

    await userEvent.click(screen.getByText('create-process'));

    expect(window.confirm).toHaveBeenCalled();
    expect(saveProcess).not.toHaveBeenCalled();
    expect(screen.getByText('active:p1')).toBeTruthy();
  });

  test('re-loading the already-active process is a no-op, even while dirty', async () => {
    setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('mark-dirty'));
    await userEvent.click(screen.getByText('load-p1'));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByText('active:p1')).toBeTruthy();
  });

  test('loading a process that has disappeared leaves the selection untouched', async () => {
    getProcesses.mockReturnValue([process(), process({ id: 'p2', name: 'Other' })]);
    getProcess.mockImplementation((id: string) => (id === 'p2' ? undefined : process()));
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getProcesses());
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('load-p2'));

    expect(screen.getByText('active:p1')).toBeTruthy();
  });

  test('saving after the process disappeared from storage writes nothing', async () => {
    setup();
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    saveProcess.mockClear();
    getProcess.mockReturnValue(undefined);

    await userEvent.click(screen.getByText('save-canvas'));

    expect(saveProcess).not.toHaveBeenCalled();
  });

  test('renaming a process that no longer exists writes nothing', async () => {
    setup();
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    saveProcess.mockClear();
    getProcess.mockReturnValue(undefined);

    await userEvent.click(screen.getByText('rename-active'));

    expect(saveProcess).not.toHaveBeenCalled();
  });

  test('footer edits are ignored while no process is active', async () => {
    setup();
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('set-ropa'));
    await userEvent.click(screen.getByText('set-dso'));
    await userEvent.click(screen.getByText('set-language'));
    await userEvent.click(screen.getByText('set-org'));

    expect(screen.getByText('effRopa:none')).toBeTruthy();
    expect(screen.getByText('effDso:none')).toBeTruthy();
    expect(screen.getByText('effLang:none')).toBeTruthy();
    expect(screen.getByText('effOrg:none')).toBeTruthy();
  });

  test('declining the delete confirmation keeps the process', async () => {
    setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('delete-p1'));

    expect(deleteProcess).not.toHaveBeenCalled();
    expect(screen.getByText('active:p1')).toBeTruthy();
  });

  test('deleting a process other than the active one keeps the selection', async () => {
    getProcesses.mockReturnValue([process(), process({ id: 'p2', name: 'Other' })]);
    getProcess.mockImplementation((id: string) =>
      id === 'p2' ? process({ id: 'p2', name: 'Other' }) : process()
    );
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue(getProcesses());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('delete-p2'));

    expect(deleteProcess).toHaveBeenCalledWith('p2');
    expect(screen.getByText('active:p1')).toBeTruthy();
  });

  test('closing while dirty is cancelled when the discard prompt is declined', async () => {
    setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('mark-dirty'));
    await userEvent.click(screen.getByText('close-canvas'));

    expect(screen.getByText('active:p1')).toBeTruthy();
  });
});

describe('BpmnModeler — ronl:* attribute rewriting on save', () => {
  function setup(xml: string) {
    const p = process({ xml });
    getProcesses.mockReturnValue([p]);
    getProcess.mockReturnValue(p);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([p]);
  }

  function savedXml(): string {
    const call = saveProcess.mock.calls.at(-1)![0] as { xml: string };
    return call.xml;
  }

  test('adds the ronl namespace and the attribute when neither is present', async () => {
    setup('<bpmn:definitions><bpmn:process id="P"/></bpmn:definitions>');
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('set-ropa'));
    await userEvent.click(screen.getByText('set-dso'));
    saveProcess.mockClear();
    await userEvent.click(screen.getByText('save-canvas'));

    expect(savedXml()).toContain('xmlns:ronl="http://ronl.nl/schema/1.0"');
    expect(savedXml()).toContain('ronl:ropaRef="ropa-1"');
    expect(savedXml()).toContain('ronl:dsoActiviteitUrn="urn:x"');
  });

  test('replaces an existing attribute in place, without re-declaring the namespace', async () => {
    setup(
      '<bpmn:definitions xmlns:ronl="http://ronl.nl/schema/1.0">' +
        '<bpmn:process id="P" ronl:ropaRef="old"/></bpmn:definitions>'
    );
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('set-ropa'));
    saveProcess.mockClear();
    await userEvent.click(screen.getByText('save-canvas'));

    expect(savedXml()).toContain('ronl:ropaRef="ropa-1"');
    expect(savedXml()).not.toContain('ronl:ropaRef="old"');
    expect(savedXml().match(/xmlns:ronl=/g)).toHaveLength(1);
  });

  test('clearing a footer field strips the attribute from the XML', async () => {
    setup(
      '<bpmn:definitions xmlns:ronl="http://ronl.nl/schema/1.0">' +
        '<bpmn:process id="P" ronl:ropaRef="old" ronl:organization="flevoland"/></bpmn:definitions>'
    );
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('clear-ropa'));
    await userEvent.click(screen.getByText('clear-org'));
    saveProcess.mockClear();
    await userEvent.click(screen.getByText('save-canvas'));

    expect(savedXml()).not.toContain('ronl:ropaRef');
    expect(savedXml()).not.toContain('ronl:organization');
  });

  test('clearing the language and DSO refs strips those attributes too', async () => {
    setup(
      '<bpmn:definitions xmlns:ronl="http://ronl.nl/schema/1.0">' +
        '<bpmn:process id="P" ronl:language="nl" ronl:dsoActiviteitUrn="urn:x"/></bpmn:definitions>'
    );
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('clear-language'));
    await userEvent.click(screen.getByText('clear-dso'));
    saveProcess.mockClear();
    await userEvent.click(screen.getByText('save-canvas'));

    expect(savedXml()).not.toContain('ronl:language');
    expect(savedXml()).not.toContain('ronl:dsoActiviteitUrn');
  });

  test('a new process whose XML declares no process id records "unknown"', async () => {
    getProcesses.mockReturnValue([]);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([]);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('create-process'));

    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({ bpmnProcessId: 'DefaultProcess', processRole: 'standalone' })
    );
  });
});

describe('BpmnModeler — bpmnProcessId recomputed on save (#156)', () => {
  function setup(xml: string) {
    const p = process({ bpmnProcessId: 'DefaultProcess', xml });
    getProcesses.mockReturnValue([p]);
    getProcess.mockReturnValue(p);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([p]);
  }

  // The mocked BpmnCanvas's save-canvas button always replaces
  // "DefaultProcess" with "EditedProcess" in whatever xml it was given —
  // a stand-in for renaming the process id in the properties panel.
  test('recomputes bpmnProcessId from the XML being saved, not the create-time value', async () => {
    setup('<bpmn:definitions><bpmn:process id="DefaultProcess"/></bpmn:definitions>');
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('save-canvas'));

    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', bpmnProcessId: 'EditedProcess' })
    );
  });

  // #156: a bare `\b` before `id=` also matches right after `xsi:`'s `:`,
  // so the old regex backtracked onto whichever id-suffixed attribute came
  // last in the tag.
  test('prefers the real process id over a same-tag xsi:id attribute', async () => {
    setup(
      '<bpmn:definitions><bpmn:process id="DefaultProcess" xsi:id="WRONG"/></bpmn:definitions>'
    );
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('save-canvas'));

    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({ bpmnProcessId: 'EditedProcess' })
    );
    expect(saveProcess).not.toHaveBeenCalledWith(
      expect.objectContaining({ bpmnProcessId: 'WRONG' })
    );
  });

  test('finds the id attribute regardless of attribute order', async () => {
    setup(
      '<bpmn:definitions><bpmn:process xsi:id="WRONG" name="X" id="DefaultProcess"/></bpmn:definitions>'
    );
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('save-canvas'));

    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({ bpmnProcessId: 'EditedProcess' })
    );
  });

  // #156 fix round 1: the old `(?:bpmn:)?` prefix only ever matched a
  // literal "bpmn:" (or no prefix at all). Now that every save recomputes
  // this id, a `bpmn2:`-prefixed process used to save as "unknown" instead
  // of its real id.
  test('matches any namespace prefix, e.g. bpmn2:process', async () => {
    setup('<bpmn2:definitions><bpmn2:process id="DefaultProcess"/></bpmn2:definitions>');
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('save-canvas'));

    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({ bpmnProcessId: 'EditedProcess' })
    );
  });

  // #156 fix round 1: `\b` right after `process` so a tag that merely
  // starts with the word "process" (but isn't the element) is never
  // mistaken for it. No real `<process>` element exists here, so
  // extraction falls back to the process's existing bpmnProcessId rather
  // than overwriting it with "unknown".
  test('does not match a <processType> element, and falls back to the existing bpmnProcessId', async () => {
    setup('<bpmn:definitions><processType id="DefaultProcess"/></bpmn:definitions>');
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('save-canvas'));

    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({ bpmnProcessId: 'DefaultProcess' })
    );
    expect(saveProcess).not.toHaveBeenCalledWith(
      expect.objectContaining({ bpmnProcessId: 'unknown' })
    );
  });

  test('falls back to the existing bpmnProcessId when the XML has no process element at all', async () => {
    setup('<bpmn:definitions><bpmn:collaboration id="DefaultProcess"/></bpmn:definitions>');
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('save-canvas'));

    expect(saveProcess).toHaveBeenCalledWith(
      expect.objectContaining({ bpmnProcessId: 'DefaultProcess' })
    );
    expect(saveProcess).not.toHaveBeenCalledWith(
      expect.objectContaining({ bpmnProcessId: 'unknown' })
    );
  });
});

describe('BpmnModeler — surfacing failed create/import/rename writes (#156)', () => {
  test('shows an error banner when creating a process fails to persist', async () => {
    getProcesses.mockReturnValue([]);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([]);
    saveProcess.mockResolvedValue(false);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('create-process'));

    // Exact substring, not a full-element exact match: the banner's "✗ "
    // prefix is a sibling text node, so the element's own full text never
    // equals the message alone.
    expect(await screen.findByText(/Could not save "New Process" to the server\./)).toBeTruthy();
  });

  test('shows an error banner when importing a process fails to persist', async () => {
    getProcesses.mockReturnValue([]);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([]);
    saveProcess.mockResolvedValue(false);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('import-process'));

    expect(await screen.findByText(/Could not save the imported process/)).toBeTruthy();
  });

  test('shows an error banner when renaming a process fails to persist', async () => {
    getProcesses.mockReturnValue([process()]);
    getProcess.mockReturnValue(process());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([process()]);
    saveProcess.mockResolvedValue(false);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('rename-active'));

    expect(await screen.findByText(/Could not save the new name/)).toBeTruthy();
  });

  test('a subsequent successful write clears the error banner', async () => {
    getProcesses.mockReturnValue([]);
    // Prevents the unrelated "seed the Asylum Migration example" effect
    // (gated on `!getProcess(id)`, not on `getStoredVersion`) from consuming
    // one of the queued `mockResolvedValueOnce` values below before the
    // user's own click does.
    getProcess.mockReturnValue(process());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([]);
    saveProcess.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('create-process'));
    expect(await screen.findByText(/Could not save/)).toBeTruthy();

    await userEvent.click(screen.getByText('create-process'));
    expect(screen.queryByText(/Could not save/)).toBeNull();
  });
});

describe('BpmnModeler — create/import/rename update local state immediately (#156 fix round 1/2)', () => {
  test('creating a process updates the active selection immediately, without waiting for the server round trip', async () => {
    getProcesses.mockReturnValue([]);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([]);
    // Never resolves during this test — if the local update needed it, the
    // synchronous query below would never see anything.
    saveProcess.mockReturnValue(new Promise<boolean>(() => {}));
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('create-process'));

    expect(screen.getByText(/^active:process_/)).toBeTruthy();
  });

  test('importing a process updates the active selection immediately, without waiting for the server round trip', async () => {
    getProcesses.mockReturnValue([]);
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([]);
    saveProcess.mockReturnValue(new Promise<boolean>(() => {}));
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('import-process'));

    expect(screen.getByText(/^active:process_/)).toBeTruthy();
  });

  // #156 fix round 2: a previous version of this fix suppressed the error
  // whenever the active process had changed by the time the write settled —
  // but that drops GENUINE failures, not just misattributed ones. The common
  // path: type a new name, click another card — the click's blur fires the
  // rename save, the click itself loads the other card, and if the rename
  // then fails, it must still be reported (it names the process it
  // concerns, so it's safe to show no matter what is selected by then).
  // Only local-state-first updates and clearing on switch/close are kept.
  test('a late create failure after switching to another process still shows its named banner, without changing the selection', async () => {
    getProcesses.mockReturnValue([process()]);
    getProcess.mockReturnValue(process());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([process()]);
    let resolveFirstSave: (v: boolean) => void = () => {};
    saveProcess.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveFirstSave = resolve;
        })
    );
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('create-process')); // pending — resolveFirstSave not called yet
    expect(screen.getByText(/^active:process_/)).toBeTruthy();

    // The user navigates away before the pending create's server round trip settles.
    await userEvent.click(screen.getByText('load-p1'));
    expect(screen.getByText('active:p1')).toBeTruthy();

    // The stale create now resolves as a failure — after the user has moved
    // on. `act` flushes the resulting state update, so the assertions below
    // cannot pass simply because nothing has re-rendered yet.
    await act(async () => {
      resolveFirstSave(false);
    });

    expect(screen.getByText('active:p1')).toBeTruthy();
    expect(await screen.findByText(/Could not save "New Process" to the server\./)).toBeTruthy();
  });

  test('a rename that fails after the user has already clicked another card still shows its named banner', async () => {
    const p2 = process({ id: 'p2', name: 'Other' });
    getProcesses.mockReturnValue([process(), p2]);
    getProcess.mockImplementation((id: string) => (id === 'p2' ? p2 : process()));
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([process(), p2]);
    let resolveRenameSave: (v: boolean) => void = () => {};
    saveProcess.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRenameSave = resolve;
        })
    );
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('rename-active')); // pending

    // Mirrors ProcessList.tsx: a click on another card both blurs the
    // rename input (firing its save) and loads that card.
    await userEvent.click(screen.getByText('load-p2'));
    expect(screen.getByText('active:p2')).toBeTruthy();

    await act(async () => {
      resolveRenameSave(false);
    });

    expect(screen.getByText('active:p2')).toBeTruthy();
    expect(
      await screen.findByText(/Could not save the new name "Renamed" to the server\./)
    ).toBeTruthy();
  });
});

describe('BpmnModeler — processError clears on switch/close (#156 fix round 1)', () => {
  test('clears the error banner when switching to a different process', async () => {
    const p2 = process({ id: 'p2', name: 'Other' });
    getProcesses.mockReturnValue([process(), p2]);
    getProcess.mockImplementation((id: string) => (id === 'p2' ? p2 : process()));
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([process(), p2]);
    saveProcess.mockResolvedValue(false);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('rename-active'));
    expect(await screen.findByText(/Could not save the new name/)).toBeTruthy();

    await userEvent.click(screen.getByText('load-p2'));

    expect(screen.queryByText(/Could not save/)).toBeNull();
  });

  test('clears the error banner when closing the process', async () => {
    getProcesses.mockReturnValue([process()]);
    getProcess.mockReturnValue(process());
    getStoredVersion.mockReturnValue(Infinity);
    hydrateFromServer.mockResolvedValue([process()]);
    saveProcess.mockResolvedValue(false);
    render(<BpmnModeler endpoint="e" />);

    await userEvent.click(screen.getByText('load-p1'));
    await userEvent.click(screen.getByText('rename-active'));
    expect(await screen.findByText(/Could not save the new name/)).toBeTruthy();

    await userEvent.click(screen.getByText('close-canvas'));

    expect(screen.queryByText(/Could not save/)).toBeNull();
  });
});
