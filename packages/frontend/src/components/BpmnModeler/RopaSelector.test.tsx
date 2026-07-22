// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

const listRopa = vi.fn();
vi.mock('../../services/ropaService', () => ({
  RopaService: { listRopa: (...args: unknown[]) => listRopa(...args) },
}));

import { RopaRecord } from '../../types/ropa.types';
import RopaSelector from './RopaSelector';

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

afterEach(() => {
  listRopa.mockReset();
});

describe('RopaSelector', () => {
  test('shows a loading message, then the record list', async () => {
    listRopa.mockResolvedValue([record()]);
    render(
      <RopaSelector
        bpmnProcessId="ZorgtoeslagProcess"
        currentRopaRef={undefined}
        onRopaRefChange={vi.fn()}
      />
    );

    expect(screen.getByText('Loading records…')).toBeTruthy();
    expect(await screen.findByText('Zorgtoeslag', { selector: 'option' })).toBeTruthy();
  });

  test('degrades to an empty list rather than crashing when the fetch fails', async () => {
    listRopa.mockRejectedValue(new Error('network down'));
    render(<RopaSelector bpmnProcessId="p" currentRopaRef={undefined} onRopaRefChange={vi.fn()} />);
    expect(await screen.findByText('— Not linked —', { selector: 'option' })).toBeTruthy();
  });

  test('shows linked record details when currentRopaRef matches a record', async () => {
    listRopa.mockResolvedValue([record()]);
    render(<RopaSelector bpmnProcessId="p" currentRopaRef="r1" onRopaRefChange={vi.fn()} />);
    expect(await screen.findByText('Belastingdienst')).toBeTruthy();
    expect(screen.getByText('6.1.c')).toBeTruthy();
  });

  test('shows a warning when no record is linked but the process id is set', async () => {
    listRopa.mockResolvedValue([]);
    render(
      <RopaSelector
        bpmnProcessId="ZorgtoeslagProcess"
        currentRopaRef={undefined}
        onRopaRefChange={vi.fn()}
      />
    );
    expect(await screen.findByText(/No RoPA record linked/)).toBeTruthy();
  });

  test('selecting a record calls onRopaRefChange with its id', async () => {
    listRopa.mockResolvedValue([record()]);
    const onRopaRefChange = vi.fn();
    render(
      <RopaSelector
        bpmnProcessId="p"
        currentRopaRef={undefined}
        onRopaRefChange={onRopaRefChange}
      />
    );

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'r1');
    expect(onRopaRefChange).toHaveBeenCalledWith('r1');
  });

  test('clearing the selection calls onRopaRefChange with undefined', async () => {
    listRopa.mockResolvedValue([record()]);
    const onRopaRefChange = vi.fn();
    render(
      <RopaSelector bpmnProcessId="p" currentRopaRef="r1" onRopaRefChange={onRopaRefChange} />
    );

    await userEvent.selectOptions(await screen.findByRole('combobox'), '');
    expect(onRopaRefChange).toHaveBeenCalledWith(undefined);
  });
});
