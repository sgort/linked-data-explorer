// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { EMPTY_PHASE_VIEW, PhaseView } from '../../utils/phases/assignPhases';
import { AWB_PHASE_SET } from '../../utils/phases/phaseSet';
import ProcessPhasesEditor from './ProcessPhasesEditor';

afterEach(() => vi.restoreAllMocks());

function setup(
  processAttrs: Record<string, string | undefined>,
  opts: { view?: PhaseView; nodes?: unknown[]; intent?: 'declared' | 'awb' | 'none' } = {}
) {
  const moddleElement = { get: (k: string) => processAttrs[k] };
  const target = { element: { id: 'P' }, moddleElement };
  const execute = vi.fn();
  const onSchemeIntent = vi.fn();
  render(
    <ProcessPhasesEditor
      target={target}
      nodes={opts.nodes ?? []}
      commandStack={{ execute }}
      view={opts.view ?? EMPTY_PHASE_VIEW}
      schemeIntent={opts.intent}
      onSchemeIntent={onSchemeIntent}
    />
  );
  const lastUpdates = () => execute.mock.calls.at(-1)?.[1].updates;
  return { execute, onSchemeIntent, lastUpdates, target };
}

const node = (id: string, attrs: Record<string, string>) => ({
  id,
  type: 'bpmn:UserTask',
  businessObject: { get: (k: string) => attrs[k] },
});

const declaredView: PhaseView = { ...EMPTY_PHASE_VIEW, scheme: 'declared' };

describe('ProcessPhasesEditor', () => {
  test('a process without phases shows "None" selected', () => {
    setup({});
    expect(screen.getByLabelText('None')).toBeChecked();
  });

  test('switching to own phases is a session intent until a phase is added', async () => {
    const { execute, onSchemeIntent } = setup({});
    await userEvent.click(screen.getByLabelText('Own phases'));
    expect(onSchemeIntent).toHaveBeenCalledWith('declared');
    expect(execute).not.toHaveBeenCalled();
  });

  test('adding a phase writes ronl:phases with a code generated from the name', async () => {
    const { lastUpdates, target } = setup({}, { intent: 'declared' });
    await userEvent.type(screen.getByPlaceholderText('New phase name'), 'Financiële reservering');
    await userEvent.click(screen.getByRole('button', { name: 'Add phase' }));
    expect(lastUpdates()).toEqual([
      {
        element: target.element,
        moddleElement: target.moddleElement,
        properties: { 'ronl:phases': 'financiele-reservering:Financiële reservering' },
      },
    ]);
  });

  // Review focus 1
  test('a ";" typed in a name is stripped before writing', async () => {
    const { lastUpdates } = setup({}, { intent: 'declared' });
    await userEvent.type(screen.getByPlaceholderText('New phase name'), 'Claim; opstellen');
    await userEvent.click(screen.getByRole('button', { name: 'Add phase' }));
    expect(lastUpdates()[0].properties['ronl:phases']).toBe('claim-opstellen:Claim opstellen');
  });

  test('renaming a code rewrites the markers that used it, in the same command', async () => {
    const nodes = [node('A', { 'ronl:phase': 'a' }), node('B', { 'ronl:phase': 'b' })];
    const { execute, lastUpdates } = setup(
      { 'ronl:phases': 'a:Alpha;b:Beta' },
      { nodes, view: declaredView }
    );
    const code = screen.getByDisplayValue('a');
    await userEvent.clear(code);
    await userEvent.type(code, 'intake');
    await userEvent.tab();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(lastUpdates()).toEqual([
      expect.objectContaining({ properties: { 'ronl:phases': 'intake:Alpha;b:Beta' } }),
      expect.objectContaining({ element: nodes[0], properties: { 'ronl:phase': 'intake' } }),
    ]);
  });

  // Review focus 2
  test('renaming a code to one another phase has is refused, not written', async () => {
    const { execute } = setup({ 'ronl:phases': 'a:Alpha;b:Beta' }, { view: declaredView });
    const code = screen.getByDisplayValue('a');
    await userEvent.clear(code);
    await userEvent.type(code, 'b');
    await userEvent.tab();
    expect(execute).not.toHaveBeenCalled();
    expect(screen.getByText('Code "b" is already used by another phase.')).toBeTruthy();
  });

  test('a code with ":" or ";" is refused', async () => {
    const { execute } = setup({ 'ronl:phases': 'a:Alpha' }, { view: declaredView });
    const code = screen.getByDisplayValue('a');
    await userEvent.clear(code);
    await userEvent.type(code, 'x:y');
    await userEvent.tab();
    expect(execute).not.toHaveBeenCalled();
    expect(screen.getByText('A code may not be empty or contain ":" or ";".')).toBeTruthy();
  });

  test('moving a phase down reorders ronl:phases', async () => {
    const { lastUpdates } = setup({ 'ronl:phases': 'a:Alpha;b:Beta' }, { view: declaredView });
    await userEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]);
    expect(lastUpdates()[0].properties).toEqual({ 'ronl:phases': 'b:Beta;a:Alpha' });
  });

  test('removing a phase asks, then clears its markers in the same command', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const nodes = [node('A', { 'ronl:phase': 'a' })];
    const { lastUpdates } = setup(
      { 'ronl:phases': 'a:Alpha;b:Beta' },
      { nodes, view: declaredView }
    );
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(window.confirm).toHaveBeenCalled();
    expect(lastUpdates()).toEqual([
      expect.objectContaining({ properties: { 'ronl:phases': 'b:Beta' } }),
      expect.objectContaining({ element: nodes[0], properties: { 'ronl:phase': undefined } }),
    ]);
  });

  test('the label is written only when it differs from "Fase"', async () => {
    const { lastUpdates } = setup({ 'ronl:phases': 'a:Alpha' }, { view: declaredView });
    const label = screen.getByLabelText('Label');
    await userEvent.clear(label);
    await userEvent.type(label, 'Stap');
    await userEvent.tab();
    expect(lastUpdates()[0].properties).toEqual({ 'ronl:phaseLabel': 'Stap' });
    await userEvent.clear(label);
    await userEvent.type(label, 'Fase');
    await userEvent.tab();
    expect(lastUpdates()[0].properties).toEqual({ 'ronl:phaseLabel': undefined });
  });

  test('switching from own phases to Awb asks, then clears ronl:phases and every ronl:phase marker', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const nodes = [node('A', { 'ronl:phase': 'a' })];
    const { lastUpdates, onSchemeIntent } = setup(
      { 'ronl:phases': 'a:Alpha', 'ronl:phaseLabel': 'Stap' },
      { nodes, view: declaredView }
    );
    await userEvent.click(screen.getByLabelText('Awb phases'));
    expect(lastUpdates()).toEqual([
      expect.objectContaining({
        properties: { 'ronl:phases': undefined, 'ronl:phaseLabel': undefined },
      }),
      expect.objectContaining({ element: nodes[0], properties: { 'ronl:phase': undefined } }),
    ]);
    expect(onSchemeIntent).toHaveBeenCalledWith('awb');
  });

  test('switching from own phases to None clears the list and label but keeps the markers', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const nodes = [node('A', { 'ronl:phase': 'a' })];
    const { lastUpdates, onSchemeIntent } = setup(
      { 'ronl:phases': 'a:Alpha' },
      { nodes, view: declaredView }
    );
    await userEvent.click(screen.getByLabelText('None'));
    expect(lastUpdates()).toEqual([
      expect.objectContaining({
        properties: { 'ronl:phases': undefined, 'ronl:phaseLabel': undefined },
      }),
    ]);
    expect(onSchemeIntent).toHaveBeenCalledWith('none');
  });

  test('declining the switch changes nothing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { execute, onSchemeIntent } = setup(
      { 'ronl:phases': 'a:Alpha' },
      { nodes: [node('A', { 'ronl:phase': 'a' })], view: declaredView }
    );
    await userEvent.click(screen.getByLabelText('Awb phases'));
    expect(execute).not.toHaveBeenCalled();
    expect(onSchemeIntent).not.toHaveBeenCalled();
  });

  test('switching from Awb to None asks, then clears every Awb marker', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const nodes = [node('A', { 'ronl:awbPhase': '3' })];
    const { lastUpdates } = setup(
      {},
      { nodes, view: { ...EMPTY_PHASE_VIEW, scheme: 'awb', set: AWB_PHASE_SET } }
    );
    await userEvent.click(screen.getByLabelText('None'));
    expect(lastUpdates()).toEqual([
      expect.objectContaining({ element: nodes[0], properties: { 'ronl:awbPhase': undefined } }),
    ]);
  });

  test('renaming a phase writes the cleaned name; a blank or unchanged name writes nothing', async () => {
    const { execute, lastUpdates } = setup({ 'ronl:phases': 'a:Alpha' }, { view: declaredView });
    const name = screen.getByLabelText('Name of phase 1');
    await userEvent.click(name);
    await userEvent.tab();
    await userEvent.clear(name);
    await userEvent.tab();
    expect(execute).not.toHaveBeenCalled();
    await userEvent.type(name, 'Intake; eerste');
    await userEvent.tab();
    expect(lastUpdates()[0].properties).toEqual({ 'ronl:phases': 'a:Intake eerste' });
  });

  test('declining a removal changes nothing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { execute } = setup({ 'ronl:phases': 'a:Alpha' }, { view: declaredView });
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(execute).not.toHaveBeenCalled();
  });

  test('moving a phase up reorders ronl:phases', async () => {
    const { lastUpdates } = setup({ 'ronl:phases': 'a:Alpha;b:Beta' }, { view: declaredView });
    await userEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]);
    expect(lastUpdates()[0].properties).toEqual({ 'ronl:phases': 'b:Beta;a:Alpha' });
  });

  test('Enter adds a phase; a blank name adds nothing', async () => {
    const { execute, lastUpdates } = setup({}, { intent: 'declared' });
    await userEvent.click(screen.getByRole('button', { name: 'Add phase' }));
    expect(execute).not.toHaveBeenCalled();
    await userEvent.type(screen.getByPlaceholderText('New phase name'), 'Intake{Enter}');
    expect(lastUpdates()[0].properties).toEqual({ 'ronl:phases': 'intake:Intake' });
  });

  test('leaving own phases before any was added asks nothing and writes nothing', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { execute, onSchemeIntent } = setup({}, { intent: 'declared' });
    await userEvent.click(screen.getByLabelText('None'));
    expect(confirm).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(onSchemeIntent).toHaveBeenCalledWith('none');
  });

  test('clearing the label removes ronl:phaseLabel', async () => {
    const { lastUpdates } = setup(
      { 'ronl:phases': 'a:Alpha', 'ronl:phaseLabel': 'Stap' },
      { view: declaredView }
    );
    await userEvent.clear(screen.getByLabelText('Label'));
    await userEvent.tab();
    expect(lastUpdates()[0].properties).toEqual({ 'ronl:phaseLabel': undefined });
  });

  test('the Awb scheme lists the eight codes read-only', () => {
    setup({}, { view: { ...EMPTY_PHASE_VIEW, scheme: 'awb', set: AWB_PHASE_SET } });
    expect(screen.getByText('4+5 · Behandeling en besluit')).toBeTruthy();
    expect(screen.queryByPlaceholderText('New phase name')).toBeNull();
  });

  test('a process RBA does not read shows why instead of the editor', () => {
    render(
      <ProcessPhasesEditor
        target={{ element: {}, moddleElement: { get: () => undefined } }}
        nodes={[]}
        commandStack={{ execute: vi.fn() }}
        view={declaredView}
        onSchemeIntent={vi.fn()}
        readByRba={false}
      />
    );
    expect(screen.getByText(/RBA reads only the first process/)).toBeTruthy();
    expect(screen.queryByLabelText('None')).toBeNull();
  });

  test('a name changed outside the editor (an undo) shows up in its field', () => {
    let phases = 'a:Alpha';
    const moddleElement = { get: (k: string) => (k === 'ronl:phases' ? phases : undefined) };
    const props = {
      target: { element: {}, moddleElement },
      nodes: [],
      commandStack: { execute: vi.fn() },
      onSchemeIntent: vi.fn(),
    };
    const { rerender } = render(<ProcessPhasesEditor {...props} view={{ ...declaredView }} />);
    expect(screen.getByLabelText('Name of phase 1')).toHaveValue('Alpha');

    phases = 'a:Renamed';
    rerender(<ProcessPhasesEditor {...props} view={{ ...declaredView }} />);

    expect(screen.getByLabelText('Name of phase 1')).toHaveValue('Renamed');
  });

  test('shows the note it is given', () => {
    const moddleElement = { get: () => undefined };
    render(
      <ProcessPhasesEditor
        target={{ element: {}, moddleElement }}
        nodes={[]}
        commandStack={{ execute: vi.fn() }}
        view={EMPTY_PHASE_VIEW}
        onSchemeIntent={vi.fn()}
        note="Editing the first participant's process."
      />
    );
    expect(screen.getByText("Editing the first participant's process.")).toBeTruthy();
  });
});
