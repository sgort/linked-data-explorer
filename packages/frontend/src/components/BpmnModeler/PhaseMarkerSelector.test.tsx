// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { EMPTY_PHASE_VIEW, PhaseView } from '../../utils/phases/assignPhases';
import { AWB_PHASE_SET, parseDeclaredPhases } from '../../utils/phases/phaseSet';
import PhaseMarkerSelector from './PhaseMarkerSelector';

const declared = parseDeclaredPhases('intake:Intake;toetsing:Toetsing', undefined).set!;
const element = (attrs: Record<string, string> = {}, parentType = 'bpmn:Process') => ({
  id: 'T',
  type: 'bpmn:UserTask',
  parent: { type: parentType },
  businessObject: { get: (k: string) => attrs[k] },
});
const view = (over: Partial<PhaseView>): PhaseView => ({ ...EMPTY_PHASE_VIEW, ...over });

function setup(el: ReturnType<typeof element>, v: PhaseView, intent?: 'declared' | 'awb' | 'none') {
  const execute = vi.fn();
  render(
    <PhaseMarkerSelector element={el} commandStack={{ execute }} view={v} schemeIntent={intent} />
  );
  return { execute, lastUpdates: () => execute.mock.calls.at(-1)?.[1].updates };
}

describe('PhaseMarkerSelector', () => {
  test('without a scheme it asks to set phases on the process first', () => {
    setup(element(), view({}));
    expect(screen.getByText('Stel eerst fasen in op het proces')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  // Review focus 4
  test('a node inside an embedded subprocess is not counted by RBA', () => {
    setup(element({}, 'bpmn:SubProcess'), view({ scheme: 'declared', set: declared }));
    expect(screen.getByText(/telt niet mee/)).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  test('offers "(erft over)" and the declared phases, labelled as RBA labels them', () => {
    setup(element(), view({ scheme: 'declared', set: declared }));
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['(erft over)', 'Fase 1 · Intake', 'Fase 2 · Toetsing']);
  });

  test('picking a declared phase writes ronl:phase', async () => {
    const el = element();
    const { lastUpdates } = setup(el, view({ scheme: 'declared', set: declared }));
    await userEvent.selectOptions(screen.getByRole('combobox'), 'toetsing');
    expect(lastUpdates()).toEqual([
      { element: el, moddleElement: el.businessObject, properties: { 'ronl:phase': 'toetsing' } },
    ]);
  });

  test('"(erft over)" removes the marker', async () => {
    const el = element({ 'ronl:phase': 'intake' });
    const { lastUpdates } = setup(el, view({ scheme: 'declared', set: declared }));
    await userEvent.selectOptions(screen.getByRole('combobox'), '');
    expect(lastUpdates()[0].properties).toEqual({ 'ronl:phase': undefined });
  });

  test('with the Awb intent and no markers yet, it offers the Awb codes and writes ronl:awbPhase', async () => {
    const el = element();
    const { lastUpdates } = setup(el, view({}), 'awb');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContain(
      'Fase 4+5 · Behandeling en besluit'
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), '3');
    expect(lastUpdates()[0].properties).toEqual({ 'ronl:awbPhase': '3' });
  });

  test('says what an unmarked node inherits', () => {
    setup(
      element(),
      view({
        scheme: 'declared',
        set: declared,
        byNode: new Map([['T', { code: 'toetsing', inherited: true }]]),
      })
    );
    expect(screen.getByText('Erft fase 2 (Toetsing) over')).toBeTruthy();
  });

  test('says when a node lies before the first marker', () => {
    setup(
      element(),
      view({
        scheme: 'declared',
        set: declared,
        byNode: new Map([['X', { code: 'intake', inherited: false }]]),
      })
    );
    expect(screen.getByText('Geen fase: ligt vóór de eerste fasemarkering')).toBeTruthy();
  });

  test('uses the Awb label for an inherited Awb phase', () => {
    setup(
      element(),
      view({
        scheme: 'awb',
        set: AWB_PHASE_SET,
        byNode: new Map([['T', { code: 'archivering', inherited: true }]]),
      })
    );
    expect(screen.getByText('Erft Archiefwet (Archivering) over')).toBeTruthy();
  });

  test('shows no status line for a node that carries its own marker', () => {
    setup(
      element({ 'ronl:phase': 'intake' }),
      view({
        scheme: 'declared',
        set: declared,
        byNode: new Map([['T', { code: 'intake', inherited: false }]]),
      })
    );
    expect(screen.queryByText(/Erft|Geen fase/)).toBeNull();
  });
});

describe('PhaseMarkerSelector — elements RBA does not read', () => {
  test('a node in a pool RBA does not read gets no dropdown', () => {
    const execute = vi.fn();
    render(
      <PhaseMarkerSelector
        element={element()}
        commandStack={{ execute }}
        view={view({ scheme: 'declared', set: declared })}
        readByRba={false}
      />
    );
    expect(screen.getByText(/RBA leest alleen het eerste proces/)).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  test('a plain task, which RBA does not count, says so and why inheritance stops there', () => {
    const task = { ...element(), type: 'bpmn:Task' };
    setup(task, view({ scheme: 'declared', set: declared }));
    expect(screen.getByText(/telt dit soort element niet mee/)).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
