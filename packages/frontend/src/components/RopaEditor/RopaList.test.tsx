// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { BpmnProcess } from '../../types';
import { RopaRecord } from '../../types/ropa.types';
import RopaList from './RopaList';

function record(overrides: Partial<RopaRecord> = {}): RopaRecord {
  return {
    id: 'r1',
    bpmnProcessId: 'ZorgtoeslagProcess',
    processLevel: 'shell',
    title: 'Zorgtoeslag',
    controllerName: 'Belastingdienst',
    controllerContact: 'privacy@example.com',
    purpose: 'Toeslag verwerken',
    legalBasisUri: '',
    legalBasisLabel: '',
    gdprArticle: '6.1.c',
    dataSubjects: 'Aanvragers',
    recipients: 'Belastingdienst',
    thirdCountryTransfers: false,
    retentionPeriod: '7 jaar',
    securityMeasures: 'Encryptie',
    status: 'active',
    schemaVersion: 1,
    personalDataFields: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

const baseProps = {
  activeId: null,
  loading: false,
  onSelect: vi.fn(),
  onCreate: vi.fn(),
  onDelete: vi.fn(),
};

describe('RopaList', () => {
  test('shows a loading message while loading', () => {
    render(<RopaList {...baseProps} records={[]} loading />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  test('shows an empty message when there are no records', () => {
    render(<RopaList {...baseProps} records={[]} />);
    expect(screen.getByText('No records yet')).toBeTruthy();
  });

  test('renders shell records and indents subprocess records under them', () => {
    render(
      <RopaList
        {...baseProps}
        records={[
          record({ id: 'shell-1', title: 'Shell', processLevel: 'shell' }),
          record({ id: 'sub-1', title: 'Sub', processLevel: 'subprocess' }),
        ]}
      />
    );
    expect(screen.getByText('Shell')).toBeTruthy();
    expect(screen.getByText('Sub')).toBeTruthy();
  });

  test('nests each subprocess under the shell that calls it, whatever the order, and lists the rest apart (#173)', () => {
    const shellProcess = (id: string, calls: string) =>
      ({
        id: `p-${id}`,
        bpmnProcessId: id,
        processRole: 'shell',
        xml: `<bpmn:process id="${id}"><bpmn:callActivity calledElement="${calls}"/></bpmn:process>`,
      }) as unknown as BpmnProcess;

    render(
      <RopaList
        {...baseProps}
        processes={[
          shellProcess('AwbZorgtoeslagProcess', 'ZorgSub'),
          shellProcess('AwbShellProcess', 'KapSub'),
        ]}
        records={[
          record({ id: 'zorg', title: 'AWB Zorgtoeslag', bpmnProcessId: 'AwbZorgtoeslagProcess' }),
          record({ id: 'kap', title: 'AWB Kapvergunning', bpmnProcessId: 'AwbShellProcess' }),
          record({
            id: 'zorg-sub',
            title: 'Zorgtoeslag voorlopig',
            bpmnProcessId: 'ZorgSub',
            processLevel: 'subprocess',
          }),
          record({
            id: 'kap-sub',
            title: 'Kapvergunning beoordeling',
            bpmnProcessId: 'KapSub',
            processLevel: 'subprocess',
          }),
          record({
            id: 'orphan',
            title: 'Losse deelprocessen',
            bpmnProcessId: 'Orphan',
            processLevel: 'subprocess',
          }),
        ]}
      />
    );

    // Document order: each shell directly followed by its own subprocess.
    const order = [
      'AWB Zorgtoeslag',
      'Zorgtoeslag voorlopig',
      'AWB Kapvergunning',
      'Kapvergunning beoordeling',
      'Not linked to a shell',
      'Losse deelprocessen',
    ].map((text) => screen.getByText(text));
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });

  test('shows no "not linked" heading when every subprocess has its shell', () => {
    render(<RopaList {...baseProps} records={[record({ id: 'shell-1', title: 'Shell' })]} />);
    expect(screen.queryByText('Not linked to a shell')).toBeNull();
  });

  test('clicking a card calls onSelect with its id', async () => {
    const onSelect = vi.fn();
    render(<RopaList {...baseProps} onSelect={onSelect} records={[record()]} />);

    await userEvent.click(screen.getByText('Zorgtoeslag'));
    expect(onSelect).toHaveBeenCalledWith('r1');
  });

  test('clicking the delete button calls onDelete without also selecting the card', async () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    render(
      <RopaList {...baseProps} onSelect={onSelect} onDelete={onDelete} records={[record()]} />
    );

    await userEvent.click(screen.getByRole('button', { name: '' }));
    expect(onDelete).toHaveBeenCalledWith('r1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('clicking the "New RoPA record" button calls onCreate', async () => {
    const onCreate = vi.fn();
    render(<RopaList {...baseProps} onCreate={onCreate} records={[]} />);

    await userEvent.click(screen.getByTitle('New RoPA record'));
    expect(onCreate).toHaveBeenCalled();
  });
});
