// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

vi.mock('./RopaSelector', () => ({
  default: ({ onRopaRefChange }: { onRopaRefChange: (ref: string | undefined) => void }) => (
    <button onClick={() => onRopaRefChange('r1')}>RopaSelector stub</button>
  ),
}));
vi.mock('./DsoActiviteitSelector', () => ({
  default: ({ onUrnChange }: { onUrnChange: (urn: string | undefined) => void }) => (
    <button onClick={() => onUrnChange('urn:x')}>DsoActiviteitSelector stub</button>
  ),
}));

import { BpmnProcess } from '../../types';
import ProcessList from './ProcessList';

function process(overrides: Partial<BpmnProcess> = {}): BpmnProcess {
  return {
    id: 'p1',
    name: 'Zorgtoeslag',
    xml: '<bpmn:definitions></bpmn:definitions>',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    linkedDmnTemplates: [],
    ...overrides,
  };
}

const baseProps = {
  activeProcessId: null,
  activeProcess: null,
  onCreateProcess: vi.fn(),
  onImportProcess: vi.fn(),
  onLoadProcess: vi.fn(),
  onDeleteProcess: vi.fn(),
  onUpdateProcessName: vi.fn(),
  onRopaRefChange: vi.fn(),
  onDsoActiviteitUrnChange: vi.fn(),
};

describe('ProcessList', () => {
  test('shows an empty-state message when there are no processes', () => {
    render(<ProcessList {...baseProps} processes={[]} />);
    expect(screen.getByText('No processes yet')).toBeTruthy();
  });

  test('nests a subprocess under its shell within the same organization group', () => {
    render(
      <ProcessList
        {...baseProps}
        processes={[
          process({
            id: 'shell1',
            name: 'Shell',
            processRole: 'shell',
            bpmnProcessId: 'ShellProc',
            organization: 'flevoland',
          }),
          process({
            id: 'sub1',
            name: 'Sub',
            processRole: 'subprocess',
            calledElement: 'ShellProc',
            organization: 'flevoland',
          }),
        ]}
      />
    );

    expect(screen.getByText('flevoland')).toBeTruthy();
    expect(screen.getByText('Shell')).toBeTruthy();
    expect(screen.getByText('Sub')).toBeTruthy();
  });

  test('an orphan subprocess (no matching shell) still renders, flat', () => {
    render(
      <ProcessList
        {...baseProps}
        processes={[
          process({
            id: 'orphan1',
            name: 'Orphan sub',
            processRole: 'subprocess',
            calledElement: 'Missing',
          }),
        ]}
      />
    );
    expect(screen.getByText('Orphan sub')).toBeTruthy();
  });

  test('renders status and role badges', () => {
    render(
      <ProcessList
        {...baseProps}
        processes={[
          process({ id: 'p1', name: 'Example', status: 'example' }),
          process({ id: 'p2', name: 'Wip', status: 'wip' }),
          process({ id: 'p3', name: 'Shell', processRole: 'shell' }),
          process({ id: 'p4', name: 'Sub', processRole: 'subprocess' }),
        ]}
      />
    );
    expect(screen.getByText('EXAMPLE')).toBeTruthy();
    expect(screen.getByText('WIP')).toBeTruthy();
    expect(screen.getByText('SHELL')).toBeTruthy();
    expect(screen.getByText('SUB')).toBeTruthy();
  });

  test('the toolbar search filters the visible processes', async () => {
    render(
      <ProcessList
        {...baseProps}
        processes={[
          process({ id: 'p1', name: 'Zorgtoeslag intake' }),
          process({ id: 'p2', name: 'Kapvergunning' }),
        ]}
      />
    );

    await userEvent.type(screen.getByPlaceholderText(/Search name/i), 'Kap');
    expect(screen.getByText('Kapvergunning')).toBeTruthy();
    expect(screen.queryByText('Zorgtoeslag intake')).toBeNull();
  });

  test('clicking a card calls onLoadProcess with its id', async () => {
    const onLoadProcess = vi.fn();
    render(<ProcessList {...baseProps} processes={[process()]} onLoadProcess={onLoadProcess} />);

    await userEvent.click(screen.getByText('Zorgtoeslag'));
    expect(onLoadProcess).toHaveBeenCalledWith('p1');
  });

  test('deleting calls onDeleteProcess without also selecting the card', async () => {
    const onLoadProcess = vi.fn();
    const onDeleteProcess = vi.fn();
    render(
      <ProcessList
        {...baseProps}
        processes={[process()]}
        onLoadProcess={onLoadProcess}
        onDeleteProcess={onDeleteProcess}
      />
    );

    await userEvent.click(screen.getByTitle('Delete'));
    expect(onDeleteProcess).toHaveBeenCalledWith('p1');
    expect(onLoadProcess).not.toHaveBeenCalled();
  });

  test('an example process disables its delete button', () => {
    render(<ProcessList {...baseProps} processes={[process({ status: 'example' })]} />);
    expect(screen.getByTitle('Cannot delete example')).toBeDisabled();
  });

  test('double-clicking a title starts renaming; Enter commits the new name', async () => {
    const onUpdateProcessName = vi.fn();
    render(
      <ProcessList
        {...baseProps}
        processes={[process()]}
        onUpdateProcessName={onUpdateProcessName}
      />
    );

    await userEvent.dblClick(screen.getByText('Zorgtoeslag'));
    const input = screen.getByDisplayValue('Zorgtoeslag');
    await userEvent.clear(input);
    await userEvent.type(input, 'Renamed{Enter}');

    expect(onUpdateProcessName).toHaveBeenCalledWith('p1', 'Renamed');
  });

  test('importing a .bpmn file extracts the process name from the XML and calls onImportProcess', async () => {
    const onImportProcess = vi.fn();
    render(<ProcessList {...baseProps} processes={[]} onImportProcess={onImportProcess} />);

    const xml = '<bpmn:definitions><bpmn:process name="Imported Process"/></bpmn:definitions>';
    const file = new File([xml], 'my-process.nl.bpmn', { type: 'application/xml' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    await vi.waitFor(() =>
      expect(onImportProcess).toHaveBeenCalledWith(xml, 'Imported Process', 'nl')
    );
  });

  test('falls back to the filename when the XML has no process name attribute', async () => {
    const onImportProcess = vi.fn();
    render(<ProcessList {...baseProps} processes={[]} onImportProcess={onImportProcess} />);

    const xml = '<bpmn:definitions><bpmn:process/></bpmn:definitions>';
    const file = new File([xml], 'unnamed-process.bpmn', { type: 'application/xml' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    await vi.waitFor(() =>
      expect(onImportProcess).toHaveBeenCalledWith(xml, 'unnamed-process', undefined)
    );
  });

  test('the footer selectors (Language/Organization/RoPA/DSO) only appear once a process is active', async () => {
    const onRopaRefChange = vi.fn();
    const onDsoActiviteitUrnChange = vi.fn();
    const { rerender } = render(<ProcessList {...baseProps} processes={[process()]} />);
    expect(screen.queryByText('Language')).toBeNull();

    rerender(
      <ProcessList
        {...baseProps}
        processes={[process()]}
        activeProcess={process()}
        activeProcessId="p1"
        onRopaRefChange={onRopaRefChange}
        onDsoActiviteitUrnChange={onDsoActiviteitUrnChange}
      />
    );

    expect(screen.getByText('Language')).toBeTruthy();
    expect(screen.getByText('Organization')).toBeTruthy();

    await userEvent.click(screen.getByText('RopaSelector stub'));
    expect(onRopaRefChange).toHaveBeenCalledWith('r1');

    await userEvent.click(screen.getByText('DsoActiviteitSelector stub'));
    expect(onDsoActiviteitUrnChange).toHaveBeenCalledWith('urn:x');
  });
});
