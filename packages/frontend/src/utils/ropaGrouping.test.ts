import { describe, expect, test } from 'vitest';

import { BpmnProcess } from '../types';
import { RopaRecord } from '../types/ropa.types';
import { groupRopaRecords } from './ropaGrouping';

const record = (id: string, bpmnProcessId: string, processLevel: 'shell' | 'subprocess') =>
  ({ id, bpmnProcessId, processLevel, title: id }) as RopaRecord;

const shellProcess = (bpmnProcessId: string, calls: string[], organization?: string) =>
  ({
    id: `p_${bpmnProcessId}_${organization ?? ''}`,
    bpmnProcessId,
    organization,
    processRole: 'shell',
    xml: `<bpmn:process id="${bpmnProcessId}">${calls
      .map((c) => `<bpmn:callActivity calledElement="${c}"/>`)
      .join('')}</bpmn:process>`,
  }) as BpmnProcess;

const ids = (rs: RopaRecord[]) => rs.map((r) => r.id);

describe('groupRopaRecords (#173)', () => {
  const zorgShell = record('r-zorg', 'AwbZorgtoeslagProcess', 'shell');
  const kapShell = record('r-kap', 'AwbShellProcess', 'shell');
  const zorgSub = record('r-zorg-sub', 'ZorgtoeslagProvisionalSubProcess', 'subprocess');
  const kapSub = record('r-kap-sub', 'TreeFellingPermitSubProcess', 'subprocess');
  const processes = [
    shellProcess('AwbZorgtoeslagProcess', ['ZorgtoeslagProvisionalSubProcess']),
    shellProcess('AwbShellProcess', ['TreeFellingPermitSubProcess']),
  ];

  test.each([
    ['shells first', [zorgShell, kapShell, zorgSub, kapSub]],
    ['shells last, in the other order', [kapSub, zorgSub, kapShell, zorgShell]],
  ])('each subprocess sits under the shell that calls it (%s)', (_name, records) => {
    const { shells, unlinked } = groupRopaRecords(records, processes);
    const byShell = Object.fromEntries(shells.map((g) => [g.shell.id, ids(g.subprocesses)]));

    expect(byShell).toEqual({ 'r-zorg': ['r-zorg-sub'], 'r-kap': ['r-kap-sub'] });
    expect(unlinked).toEqual([]);
  });

  test('keeps the shells in the order given', () => {
    const { shells } = groupRopaRecords([kapShell, zorgShell], processes);
    expect(shells.map((g) => g.shell.id)).toEqual(['r-kap', 'r-zorg']);
  });

  test('lists a shell’s subprocesses in the order its call activities name them', () => {
    const a = record('r-a', 'SubA', 'subprocess');
    const b = record('r-b', 'SubB', 'subprocess');
    const shell = record('r-s', 'Shell', 'shell');

    const { shells } = groupRopaRecords([b, shell, a], [shellProcess('Shell', ['SubA', 'SubB'])]);

    expect(ids(shells[0].subprocesses)).toEqual(['r-a', 'r-b']);
  });

  test('a subprocess called by two shells appears under both', () => {
    const shared = record('r-shared', 'Shared', 'subprocess');
    const s1 = record('r-1', 'Shell1', 'shell');
    const s2 = record('r-2', 'Shell2', 'shell');

    const { shells, unlinked } = groupRopaRecords(
      [s1, s2, shared],
      [shellProcess('Shell1', ['Shared']), shellProcess('Shell2', ['Shared'])]
    );

    expect(shells.map((g) => ids(g.subprocesses))).toEqual([['r-shared'], ['r-shared']]);
    expect(unlinked).toEqual([]);
  });

  test('a subprocess no shell record calls is unlinked, not attached to the last shell', () => {
    const orphan = record('r-orphan', 'OrphanSub', 'subprocess');

    const { shells, unlinked } = groupRopaRecords([zorgShell, kapShell, orphan], processes);

    expect(shells.every((g) => !ids(g.subprocesses).includes('r-orphan'))).toBe(true);
    expect(ids(unlinked)).toEqual(['r-orphan']);
  });

  test('a subprocess whose shell has no RoPA record is unlinked', () => {
    const { shells, unlinked } = groupRopaRecords([kapShell, zorgSub], processes);

    expect(ids(shells[0].subprocesses)).toEqual([]);
    expect(ids(unlinked)).toEqual(['r-zorg-sub']);
  });

  test('without stored processes nothing can be linked, so every subprocess is unlinked', () => {
    const { shells, unlinked } = groupRopaRecords([zorgShell, zorgSub], []);

    expect(ids(shells[0].subprocesses)).toEqual([]);
    expect(ids(unlinked)).toEqual(['r-zorg-sub']);
  });

  test('counts the calls of every stored process with the shell’s id, one per organisation', () => {
    const a = record('r-a', 'SubA', 'subprocess');
    const b = record('r-b', 'SubB', 'subprocess');
    const shell = record('r-s', 'Shell', 'shell');

    const { shells } = groupRopaRecords(
      [shell, a, b],
      [shellProcess('Shell', ['SubA'], 'flevoland'), shellProcess('Shell', ['SubB'], 'toeslagen')]
    );

    expect(ids(shells[0].subprocesses)).toEqual(['r-a', 'r-b']);
  });
});
