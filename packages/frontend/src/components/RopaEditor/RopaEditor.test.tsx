// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { RopaRecord } from '../../types/ropa.types';

const listRopa = vi.fn();
const upsertRopa = vi.fn();
const deleteRopa = vi.fn();

vi.mock('../../services/ropaService', () => ({
  RopaService: {
    listRopa: (...args: unknown[]) => listRopa(...args),
    upsertRopa: (...args: unknown[]) => upsertRopa(...args),
    deleteRopa: (...args: unknown[]) => deleteRopa(...args),
  },
}));

import RopaEditor from './RopaEditor';

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
  vi.restoreAllMocks();
});

describe('RopaEditor', () => {
  test('loads and lists records on mount, with no record selected initially', async () => {
    listRopa.mockResolvedValue([record()]);
    render(<RopaEditor />);

    expect(await screen.findByText('Zorgtoeslag')).toBeTruthy();
    expect(screen.getByText('Select a record or create a new one')).toBeTruthy();
  });

  test('selecting a record from the list opens the record editor for it', async () => {
    listRopa.mockResolvedValue([record()]);
    render(<RopaEditor />);

    await userEvent.click(await screen.findByText('Zorgtoeslag'));

    expect(screen.getByRole('heading', { name: 'Zorgtoeslag' })).toBeTruthy();
    expect(screen.queryByText('Select a record or create a new one')).toBeNull();
  });

  test('"New RoPA record" opens a blank editor', async () => {
    listRopa.mockResolvedValue([]);
    render(<RopaEditor />);

    await userEvent.click(await screen.findByTitle('New RoPA record'));

    expect(screen.getByRole('heading', { name: 'New RoPA record' })).toBeTruthy();
  });

  test('saving reloads the list and re-selects the saved record by its returned id', async () => {
    listRopa.mockResolvedValueOnce([]).mockResolvedValue([record({ id: 'new-id' })]);
    upsertRopa.mockResolvedValue('new-id');
    render(<RopaEditor />);

    await userEvent.click(await screen.findByTitle('New RoPA record'));
    await userEvent.click(screen.getByRole('button', { name: /Save/ }));

    expect(upsertRopa).toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Zorgtoeslag' })).toBeTruthy();
  });

  test('deleting asks for confirmation and does nothing when cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    listRopa.mockResolvedValue([record()]);
    render(<RopaEditor />);

    const card = (await screen.findByText('Zorgtoeslag')).closest('div')!.parentElement!;
    await userEvent.click(within(card).getByRole('button'));

    expect(window.confirm).toHaveBeenCalled();
    expect(deleteRopa).not.toHaveBeenCalled();
  });

  test('deleting the active record clears the selection after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteRopa.mockResolvedValue(undefined);
    listRopa.mockResolvedValueOnce([record()]).mockResolvedValue([]);
    render(<RopaEditor />);

    await userEvent.click(await screen.findByText('Zorgtoeslag'));
    expect(screen.getByRole('heading', { name: 'Zorgtoeslag' })).toBeTruthy();

    const card = screen.getAllByText('Zorgtoeslag')[0].closest('div')!.parentElement!;
    await userEvent.click(within(card).getByRole('button'));

    expect(deleteRopa).toHaveBeenCalledWith('r1');
    expect(await screen.findByText('Select a record or create a new one')).toBeTruthy();
  });
});
