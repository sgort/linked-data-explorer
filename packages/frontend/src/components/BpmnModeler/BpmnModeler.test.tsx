// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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
